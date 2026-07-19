import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { assertSearchAllowed } from "../_shared/usageLimits.ts";
import { respond429, respond500 } from "../_shared/validation.ts";
import { searchUsdaFoods, type ResolvedFood } from "../_shared/foodLookup.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPEN_FOOD_FACTS_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const OPEN_FOOD_FACTS_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product";

interface OpenFoodFactsProduct {
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  code?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: {
    "energy-kcal_serving"?: number | string;
    "energy-kcal_100g"?: number | string;
    proteins_serving?: number | string;
    proteins_100g?: number | string;
    carbohydrates_serving?: number | string;
    carbohydrates_100g?: number | string;
    fat_serving?: number | string;
    fat_100g?: number | string;
    fiber_serving?: number | string;
    fiber_100g?: number | string;
    sugars_serving?: number | string;
    sugars_100g?: number | string;
    sodium_serving?: number | string;
    sodium_100g?: number | string;
  };
}

interface FoodRow {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  serving_size_g: number;
  serving_label: string;
  calories_per_serving: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  source: string;
  is_verified: boolean;
}

type FoodInsert = Omit<FoodRow, "id"> & { created_by: null };

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

/**
 * Strip characters that carry meaning in a PostgREST filter expression before
 * interpolating user input into `.or(...)`. Without this, a `,` or `)` lets a
 * caller rewrite the filter — and these queries run with the service-role key,
 * so RLS would not contain it. Mirrors the client-side sanitizer.
 */
const MAX_SEARCH_LEN = 100;
function sanitizePostgrestFilter(value: string): string {
  return value.replace(/[%_(),.\\*:"']/g, " ").trim().slice(0, MAX_SEARCH_LEN);
}

/**
 * Whole-food-first priority. Generic whole foods (USDA / verified) outrank
 * branded packaged products so e.g. "Beets, raw" beats "Tesco Beetroot" even
 * when the branded item is an exact name match.
 *   2 = authoritative generic (USDA, or a verified seed food)
 *   1 = brandless
 *   0 = branded
 */
function wholeFoodScore(food: FoodRow): number {
  if (food.source === "usda" || food.is_verified) return 2;
  if (!food.brand?.trim()) return 1;
  return 0;
}

function rankAndDedupeFoods(foods: FoodRow[], query: string, limit = 25): FoodRow[] {
  const q = normalizeSearchText(query);
  const queryTokens = q.split(/\s+/).filter(Boolean);

  const dedupedByKey = new Map<string, FoodRow>();
  for (const food of foods) {
    const key =
      food.barcode?.trim() ||
      `${normalizeSearchText(food.name)}|${normalizeSearchText(food.brand ?? "")}`;
    if (!dedupedByKey.has(key)) {
      dedupedByKey.set(key, food);
      continue;
    }

    const existing = dedupedByKey.get(key)!;
    if (!existing.is_verified && food.is_verified) dedupedByKey.set(key, food);
  }

  const ranked = [...dedupedByKey.values()].sort((a, b) => {
    // Whole foods first, then the name-relevance ordering within each tier.
    const wholeA = wholeFoodScore(a);
    const wholeB = wholeFoodScore(b);
    if (wholeA !== wholeB) return wholeB - wholeA;

    const nameA = normalizeSearchText(a.name);
    const nameB = normalizeSearchText(b.name);
    const brandA = normalizeSearchText(a.brand ?? "");
    const brandB = normalizeSearchText(b.brand ?? "");

    const exactA = Number(nameA === q || `${nameA} ${brandA}`.trim() === q);
    const exactB = Number(nameB === q || `${nameB} ${brandB}`.trim() === q);
    if (exactA !== exactB) return exactB - exactA;

    const startsWithA = Number(nameA.startsWith(q));
    const startsWithB = Number(nameB.startsWith(q));
    if (startsWithA !== startsWithB) return startsWithB - startsWithA;

    const tokenMatchesA = queryTokens.filter((token) => nameA.includes(token) || brandA.includes(token)).length;
    const tokenMatchesB = queryTokens.filter((token) => nameB.includes(token) || brandB.includes(token)).length;
    if (tokenMatchesA !== tokenMatchesB) return tokenMatchesB - tokenMatchesA;

    if (a.is_verified !== b.is_verified) return Number(b.is_verified) - Number(a.is_verified);
    // Shorter USDA descriptions are the simpler/base form ("Beets, raw" beats
    // "Babyfood, vegetables, beets, strained") — surface them first.
    if (a.name.length !== b.name.length) return a.name.length - b.name.length;
    return a.name.localeCompare(b.name);
  });

  return ranked.slice(0, limit);
}

function mapProduct(product: OpenFoodFactsProduct) {
  const name = (product.product_name_en || product.product_name || "").trim();
  const barcode = (product.code || "").trim();
  if (!name || !barcode) return null;

  const servingSizeG = toNumber(product.serving_quantity, 100) || 100;
  const nutriments = product.nutriments ?? {};

  const calories =
    toNumber(nutriments["energy-kcal_serving"], NaN) ||
    round1((toNumber(nutriments["energy-kcal_100g"], 0) * servingSizeG) / 100);
  const protein =
    toNumber(nutriments.proteins_serving, NaN) ||
    round2((toNumber(nutriments.proteins_100g, 0) * servingSizeG) / 100);
  const carbs =
    toNumber(nutriments.carbohydrates_serving, NaN) ||
    round2((toNumber(nutriments.carbohydrates_100g, 0) * servingSizeG) / 100);
  const fat =
    toNumber(nutriments.fat_serving, NaN) ||
    round2((toNumber(nutriments.fat_100g, 0) * servingSizeG) / 100);
  const fiber =
    toNumber(nutriments.fiber_serving, NaN) ||
    round2((toNumber(nutriments.fiber_100g, 0) * servingSizeG) / 100);
  const sugar =
    toNumber(nutriments.sugars_serving, NaN) ||
    round2((toNumber(nutriments.sugars_100g, 0) * servingSizeG) / 100);
  const sodiumMg =
    toNumber(nutriments.sodium_serving, NaN) * 1000 ||
    round2(toNumber(nutriments.sodium_100g, 0) * 1000 * servingSizeG / 100);

  return {
    name,
    brand: product.brands?.split(",")[0]?.trim() || null,
    barcode,
    serving_size_g: round2(servingSizeG),
    serving_label: product.serving_size?.trim() || `${round2(servingSizeG)}g`,
    calories_per_serving: round1(calories || 0),
    protein_g: round2(protein || 0),
    carbs_g: round2(carbs || 0),
    fat_g: round2(fat || 0),
    fiber_g: Number.isFinite(fiber) ? round2(fiber) : null,
    sugar_g: Number.isFinite(sugar) ? round2(sugar) : null,
    sodium_mg: Number.isFinite(sodiumMg) ? round2(sodiumMg) : null,
    source: "open_food_facts" as const,
    created_by: null,
    is_verified: false,
  };
}

function toFoodRows(mapped: FoodInsert[]): FoodRow[] {
  return mapped.map((item, idx) => ({
    id: `external-${item.barcode ?? idx}`,
    ...item,
  })) as FoodRow[];
}

function mappedToFoodRows(mapped: FoodInsert[], query: string, limit: number): FoodRow[] {
  return rankAndDedupeFoods(toFoodRows(mapped), query, limit);
}

/** Adapt USDA generic whole-food results (per-100g) to search FoodRows. */
function usdaToFoodRows(foods: ResolvedFood[]): FoodRow[] {
  return foods.map((f, idx) => ({
    id: `usda-${idx}-${normalizeSearchText(f.name).replace(/\s+/g, "-")}`,
    name: f.name,
    brand: null,
    barcode: null,
    serving_size_g: f.serving_size_g,
    serving_label: f.serving_label,
    calories_per_serving: f.calories_per_serving,
    protein_g: f.protein_g,
    carbs_g: f.carbs_g,
    fat_g: f.fat_g,
    fiber_g: null,
    sugar_g: null,
    sodium_mg: null,
    source: "usda",
    is_verified: true,
  }));
}

async function searchProducts(term: string, pageSize = 35): Promise<OpenFoodFactsProduct[]> {
  const params = new URLSearchParams({
    search_terms: term,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: String(pageSize),
    fields:
      "code,product_name,product_name_en,brands,serving_size,serving_quantity,nutriments",
  });
  const res = await fetch(`${OPEN_FOOD_FACTS_SEARCH_URL}?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.products) ? data.products : [];
}

async function fetchProductByBarcode(barcode: string): Promise<OpenFoodFactsProduct | null> {
  const res = await fetch(`${OPEN_FOOD_FACTS_PRODUCT_URL}/${encodeURIComponent(barcode)}.json`);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.product ? ({ ...data.product, code: barcode } as OpenFoodFactsProduct) : null;
}

async function queryLocalFoods(supabase: ReturnType<typeof createClient>, query: string, limit = 25): Promise<FoodRow[]> {
  // Never interpolate raw input into a PostgREST filter (runs as service-role).
  const safe = sanitizePostgrestFilter(query);
  if (!safe) return [];
  const { data, error } = await supabase
    .from("foods")
    .select("*")
    .or(`name.ilike.%${safe}%,brand.ilike.%${safe}%`)
    .limit(90);
  if (error) throw error;
  return rankAndDedupeFoods((data ?? []) as FoodRow[], query, limit);
}

async function recordSearchTerm(supabase: ReturnType<typeof createClient>, term: string): Promise<void> {
  const normalized = term.trim().toLowerCase();
  if (normalized.length < 2) return;
  await supabase.rpc("record_food_search_term", { p_term: normalized });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await anon.auth.getUser();
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const limitError = await assertSearchAllowed(service, authData.user.id);
    if (limitError) return respond429(limitError);

    const body = await req.json().catch(() => ({}));
    const query = String(body?.query ?? "").trim().slice(0, MAX_SEARCH_LEN);
    // Barcodes are numeric; reject anything else rather than pass it downstream.
    const rawBarcode = String(body?.barcode ?? "").trim();
    const barcode = /^[0-9]{6,20}$/.test(rawBarcode) ? rawBarcode : "";
    const limit = Math.max(1, Math.min(40, Number(body?.limit ?? 25)));

    if (!query && !barcode) {
      return new Response(JSON.stringify({ items: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (barcode) {
      const { data: localBarcode, error: barcodeError } = await service
        .from("foods")
        .select("*")
        .eq("barcode", barcode)
        .limit(1);
      if (barcodeError) throw barcodeError;
      if (localBarcode && localBarcode.length > 0) {
        return new Response(JSON.stringify({ items: localBarcode }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const product = await fetchProductByBarcode(barcode);
      if (product) {
        const mapped = mapProduct(product);
        if (mapped) {
          const { error: upsertError } = await service
            .from("foods")
            .upsert(mapped, { onConflict: "barcode", ignoreDuplicates: false });
          if (upsertError) console.error("barcode upsert failed", upsertError.message);
          const { data: inserted } = await service.from("foods").select("*").eq("barcode", barcode).limit(1);
          if (!inserted || inserted.length === 0) {
            return new Response(JSON.stringify({ items: mappedToFoodRows([mapped], mapped.name, 1) }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ items: inserted ?? [] }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ items: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (query.length < 2) {
      return new Response(JSON.stringify({ items: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await recordSearchTerm(service, query);

    // USDA generic whole foods run on EVERY search, in parallel with the local
    // cache — NOT gated behind the "few results" check below. Otherwise a cache
    // full of branded products would keep the local count high and suppress the
    // generic whole food we specifically want ranked first.
    const [local, usdaResolved] = await Promise.all([
      queryLocalFoods(service, query, limit),
      searchUsdaFoods(query, 8).catch(() => [] as ResolvedFood[]),
    ]);
    const usda = usdaToFoodRows(usdaResolved);

    let pool: FoodRow[] = [...usda, ...local];

    // Top up with Open Food Facts (branded / packaged) when hits are thin.
    if (local.length + usda.length < 12) {
      const products = await searchProducts(query, 35);
      const inserts: FoodInsert[] = products
        .map(mapProduct)
        .filter((item): item is FoodInsert => !!item);
      if (inserts.length > 0) {
        const { error: upsertError } = await service
          .from("foods")
          .upsert(inserts, { onConflict: "barcode", ignoreDuplicates: false });
        if (upsertError) {
          console.error("search upsert failed", upsertError.message);
          pool = [...usda, ...local, ...toFoodRows(inserts)];
        } else {
          const refreshed = await queryLocalFoods(service, query, limit);
          // If the DB refresh comes back empty (edge case), still show externals.
          pool = refreshed.length > 0
            ? [...usda, ...refreshed]
            : [...usda, ...local, ...toFoodRows(inserts)];
        }
      }
    }

    const items = rankAndDedupeFoods(pool, query, limit);

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return respond500(err, "search-foods");
  }
});
