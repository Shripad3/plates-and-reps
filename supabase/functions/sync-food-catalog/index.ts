import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { respond500 } from "../_shared/validation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FOOD_SYNC_SECRET = Deno.env.get("FOOD_SYNC_SECRET");
const OPEN_FOOD_FACTS_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";

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

async function searchProducts(term: string, pageSize: number): Promise<OpenFoodFactsProduct[]> {
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = req.headers.get("x-food-sync-secret") ??
      req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!FOOD_SYNC_SECRET || token !== FOOD_SYNC_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const termLimit = Math.max(1, Math.min(50, Number(body?.term_limit ?? 20)));
    const perTerm = Math.max(5, Math.min(80, Number(body?.per_term ?? 25)));

    const { data: terms, error: termsError } = await supabase
      .from("food_search_terms")
      .select("term, search_count")
      .order("search_count", { ascending: false })
      .order("last_searched_at", { ascending: false })
      .limit(termLimit);

    if (termsError) throw termsError;
    if (!terms || terms.length === 0) {
      return new Response(JSON.stringify({ synced_terms: 0, fetched_products: 0, upserted_products: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let fetchedProducts = 0;
    let upsertedProducts = 0;
    let syncedTerms = 0;

    for (const entry of terms) {
      const products = await searchProducts(entry.term, perTerm);
      fetchedProducts += products.length;
      if (products.length === 0) continue;

      const inserts = products
        .map(mapProduct)
        .filter((item): item is NonNullable<typeof item> => !!item);
      if (inserts.length === 0) continue;

      const { error: upsertError } = await supabase
        .from("foods")
        .upsert(inserts, { onConflict: "barcode", ignoreDuplicates: false });
      if (upsertError) throw upsertError;

      upsertedProducts += inserts.length;
      syncedTerms += 1;
    }

    return new Response(
      JSON.stringify({
        synced_terms: syncedTerms,
        fetched_products: fetchedProducts,
        upserted_products: upsertedProducts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return respond500(err, "sync-food-catalog");
  }
});
