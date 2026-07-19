// External food-database lookups for meal-plan resolution.
// Primary: USDA FoodData Central (free, best for generic whole foods).
// Fallback: Open Food Facts (open, global, branded items).
// Both normalize to a `foods`-row shape with per-100g macros and canonical
// allergens. allergens === null means UNKNOWN (hard-filter treats conservatively).

import { britishToAmerican } from "./foodSynonyms.ts";

const USDA_KEY = Deno.env.get("USDA_FDC_API_KEY") ?? "DEMO_KEY";
const USDA_SEARCH = "https://api.nal.usda.gov/fdc/v1/foods/search";
const OFF_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl";

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// Canonical allergen vocabulary: milk, eggs, peanuts, tree_nuts, soy,
// wheat_gluten, fish, shellfish, sesame.
const ALLERGEN_KEYWORDS: [string, string][] = [
  ["milk", "milk"], ["cream", "milk"], ["butter", "milk"], ["cheese", "milk"],
  ["yogurt", "milk"], ["whey", "milk"], ["casein", "milk"], ["lactose", "milk"],
  ["egg", "eggs"],
  ["peanut", "peanuts"],
  ["almond", "tree_nuts"], ["walnut", "tree_nuts"], ["cashew", "tree_nuts"],
  ["pecan", "tree_nuts"], ["pistachio", "tree_nuts"], ["hazelnut", "tree_nuts"], ["tree nut", "tree_nuts"],
  ["soy", "soy"], ["soya", "soy"], ["tofu", "soy"], ["edamame", "soy"],
  ["wheat", "wheat_gluten"], ["gluten", "wheat_gluten"], ["barley", "wheat_gluten"],
  ["rye", "wheat_gluten"], ["bread", "wheat_gluten"], ["pasta", "wheat_gluten"], ["flour", "wheat_gluten"],
  ["salmon", "fish"], ["tuna", "fish"], ["cod", "fish"], ["tilapia", "fish"],
  ["sardine", "fish"], ["anchovy", "fish"], ["fish", "fish"],
  ["shrimp", "shellfish"], ["prawn", "shellfish"], ["crab", "shellfish"], ["lobster", "shellfish"],
  ["shellfish", "shellfish"], ["clam", "shellfish"], ["oyster", "shellfish"],
  ["mussel", "shellfish"], ["scallop", "shellfish"],
  ["sesame", "sesame"], ["tahini", "sesame"],
];

// "Almond milk", "peanut butter", "coconut cream" etc. are dairy-free — the
// milk/butter/cream token is a false positive unless a real dairy word is also
// present.
const PLANT_DAIRY = /\b(almond|soy|soya|oat|rice|coconut|cashew|hemp|pea|hazelnut|macadamia|peanut|sunflower|cocoa|shea|apple|nut|seed)\s+(milk|butter|cream|cheese|yogurt|yoghurt)/;
const EXPLICIT_DAIRY = /\b(cheese|cheddar|mozzarella|parmesan|feta|ricotta|whey|casein|lactose|yogurt|yoghurt|buttermilk|ghee|custard|dairy|milkfat)\b/;

/** Scan free text (name/ingredients) for allergen keywords. */
export function deriveAllergens(text: string): string[] {
  const lc = ` ${text.toLowerCase()} `;
  const out = new Set<string>();
  for (const [kw, allergen] of ALLERGEN_KEYWORDS) {
    if (lc.includes(kw)) out.add(allergen);
  }
  // Drop a dairy false positive from plant "milk/butter/cream" names.
  if (out.has("milk") && PLANT_DAIRY.test(lc) && !EXPLICIT_DAIRY.test(lc)) {
    out.delete("milk");
  }
  return [...out];
}

function normalizeOffAllergens(tags: string[]): string[] {
  const map: Record<string, string> = {
    milk: "milk", eggs: "eggs", egg: "eggs", peanuts: "peanuts",
    nuts: "tree_nuts", "tree-nuts": "tree_nuts", soybeans: "soy", soy: "soy",
    gluten: "wheat_gluten", wheat: "wheat_gluten", fish: "fish",
    crustaceans: "shellfish", molluscs: "shellfish", shellfish: "shellfish",
    sesame: "sesame", "sesame-seeds": "sesame",
  };
  const out = new Set<string>();
  for (const t of tags) {
    const key = String(t).replace(/^[a-z]{2}:/, "").toLowerCase();
    if (map[key]) out.add(map[key]);
  }
  return [...out];
}

export interface ResolvedFood {
  name: string;
  serving_size_g: number;       // always 100 (per-100g basis)
  serving_label: string;
  calories_per_serving: number; // per 100g
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  allergens: string[] | null;   // null = unknown
  source: "usda" | "open_food_facts";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function usdaNutrient(food: any, id: number): number {
  const n = (food.foodNutrients ?? []).find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (x: any) => x.nutrientId === id || x.nutrient?.id === id
  );
  const v = n?.value ?? n?.amount;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUsdaFood(food: any, fallbackName: string): ResolvedFood | null {
  // Energy: SR Legacy/Branded report kcal under 1008; Foundation foods often
  // omit 1008 and only carry Atwater energy (2047 General, 2048 Specific).
  // Without this fallback, raw Foundation whole foods show 0 kcal.
  const calories =
    usdaNutrient(food, 1008) || usdaNutrient(food, 2047) || usdaNutrient(food, 2048);
  const protein = usdaNutrient(food, 1003);
  const fat = usdaNutrient(food, 1004);
  const carbs = usdaNutrient(food, 1005);
  if (calories <= 0 && protein <= 0 && carbs <= 0 && fat <= 0) return null;

  const description: string = food.description ?? fallbackName;
  const ingredients: string = food.ingredients ?? "";
  let allergens: string[] | null;
  if (food.dataType === "Branded") {
    // Branded: trust parsed ingredients; unknown if none provided.
    allergens = ingredients ? deriveAllergens(`${ingredients} ${description}`) : null;
  } else {
    // Foundation / SR Legacy are single generic whole foods — name is authoritative.
    allergens = deriveAllergens(description);
  }

  return {
    name: description.trim().slice(0, 120),
    serving_size_g: 100,
    serving_label: "100g",
    calories_per_serving: round1(calories),
    protein_g: round2(protein),
    carbs_g: round2(carbs),
    fat_g: round2(fat),
    allergens,
    source: "usda",
  };
}

async function fetchUsdaFoods(query: string, dataType: string, pageSize: number): Promise<unknown[]> {
  const url =
    `${USDA_SEARCH}?api_key=${USDA_KEY}&query=${encodeURIComponent(query)}` +
    `&pageSize=${pageSize}&dataType=${encodeURIComponent(dataType)}`;
  let res: Response;
  try { res = await fetch(url); } catch { return []; }
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  return Array.isArray(data?.foods) ? data.foods : [];
}

export async function lookupUsdaFood(query: string): Promise<ResolvedFood | null> {
  const q = britishToAmerican(query);
  // Prefer a generic whole food; only fall back to Branded if none exists.
  // Querying Branded first can resolve e.g. "Mixed Berries" to a branded cereal
  // with wrong macros and phantom allergens.
  for (const dataType of ["Foundation,SR Legacy", "Branded"]) {
    const [food] = await fetchUsdaFoods(q, dataType, 1);
    const mapped = food ? mapUsdaFood(food, q) : null;
    if (mapped) return mapped;
  }
  return null;
}

/**
 * Multi-result USDA search constrained to generic whole-food data types
 * (Foundation / SR Legacy). Used by food search to surface e.g. "Beets, raw"
 * above branded packaged products. Returns [] on any failure.
 */
export async function searchUsdaFoods(query: string, pageSize = 8): Promise<ResolvedFood[]> {
  const foods = await fetchUsdaFoods(britishToAmerican(query), "Foundation,SR Legacy", pageSize);
  const out: ResolvedFood[] = [];
  for (const food of foods) {
    const mapped = mapUsdaFood(food, query);
    if (mapped) out.push(mapped);
  }
  return out;
}

export async function lookupOffFood(query: string): Promise<ResolvedFood | null> {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "1",
    fields: "product_name,nutriments,allergens_tags,ingredients_text",
  });
  let res: Response;
  try { res = await fetch(`${OFF_SEARCH}?${params}`); } catch { return null; }
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const p = data?.products?.[0];
  if (!p) return null;

  const nut = p.nutriments ?? {};
  const per100 = (k: string) => {
    const v = Number(nut[`${k}_100g`]);
    return Number.isFinite(v) ? v : 0;
  };
  const calories = per100("energy-kcal");
  const protein = per100("proteins");
  const carbs = per100("carbohydrates");
  const fat = per100("fat");
  if (calories <= 0 && protein <= 0 && carbs <= 0 && fat <= 0) return null;

  const allergens: string[] | null =
    Array.isArray(p.allergens_tags) && p.allergens_tags.length
      ? normalizeOffAllergens(p.allergens_tags)
      : p.ingredients_text
        ? deriveAllergens(p.ingredients_text)
        : null;

  return {
    name: String(p.product_name ?? query).trim().slice(0, 120),
    serving_size_g: 100,
    serving_label: "100g",
    calories_per_serving: round1(calories),
    protein_g: round2(protein),
    carbs_g: round2(carbs),
    fat_g: round2(fat),
    allergens,
    source: "open_food_facts",
  };
}
