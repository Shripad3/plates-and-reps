import { lookupUsdaFood, lookupOffFood, type ResolvedFood } from "./foodLookup.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = any;

export interface DietInfo {
  status: "provided" | "skipped";
  pattern?: string; // omnivore|vegetarian|vegan|pescatarian|halal|kosher|keto
  allergies?: string[]; // canonical vocab
  dislikes?: string[];
  cuisines?: string[];
  budget?: string;
  cookTime?: string;
  mealsPerDay?: number;
  medicalConditions?: string[];
  /** Client confirm-on-change state; passed through, not used by the filter. */
  allergiesConfirmedAt?: string;
}

export interface MealFood {
  name: string;
  foodId: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}
export interface MacroTotals { calories: number; protein: number; carbs: number; fat: number }
export interface NormalizedMeal { mealType: string; name: string; foods: MealFood[]; totals: MacroTotals }
export interface NormalizedMealDay { dayNumber: number; meals: NormalizedMeal[]; totals: MacroTotals }
export interface NormalizedMealPlan {
  planName: string;
  durationDays: number;
  days: NormalizedMealDay[];
  weeklyTotals: MacroTotals;
  notes?: string;
}
export interface MealValidationResult {
  plan: NormalizedMealPlan;
  unresolved: string[]; // foods no DB could resolve (dropped)
  violations: string[]; // foods dropped for allergen/pattern/dislike (feed the retry)
}

export class MealValidationError extends Error {}

const MAX_DAYS = 14;
const MAX_MEALS = 8;
const MAX_FOODS = 15;
const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack"]);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;

const UNIT_TO_G: Record<string, number> = {
  g: 1, gram: 1, grams: 1, ml: 1, milliliter: 1, milliliters: 1,
  tbsp: 15, tablespoon: 15, tablespoons: 15, tsp: 5, teaspoon: 5, teaspoons: 5,
  cup: 240, cups: 240, oz: 28.35, ounce: 28.35, ounces: 28.35,
};
function toGrams(quantity: number, unit: string, servingSizeG: number): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const u = (unit ?? "").toLowerCase().trim();
  if (u === "" || u === "piece" || u === "pieces" || u === "serving" || u === "servings") {
    return quantity * servingSizeG; // approximate one piece/serving as the row's serving basis
  }
  const f = UNIT_TO_G[u];
  return f ? quantity * f : null; // unknown unit → unresolved
}

// Coarse pattern-violation keyword sets (name-based; the allergen filter is the
// hard safety net — this catches diet-preference conflicts).
const MEAT = ["chicken", "beef", "pork", "bacon", "ham", "turkey", "lamb", "veal", "meat", "sausage"];
const SEAFOOD = ["fish", "salmon", "tuna", "cod", "shrimp", "prawn", "crab", "lobster", "tilapia", "sardine"];
const ANIMAL = [...MEAT, ...SEAFOOD, "egg", "milk", "cheese", "yogurt", "butter", "cream", "gelatin", "honey", "whey", "casein"];
function violatesPattern(name: string, pattern: string): boolean {
  const lc = ` ${name.toLowerCase()} `;
  const has = (arr: string[]) => arr.some((k) => lc.includes(k));
  switch (pattern) {
    case "vegan": return has(ANIMAL);
    case "vegetarian": return has(MEAT) || has(SEAFOOD);
    case "pescatarian": return has(MEAT);
    default: return false; // halal/kosher/keto handled via prompt + allergies; not name-filtered here
  }
}

interface FoodRow {
  id: string;
  name: string;
  serving_size_g: number;
  calories_per_serving: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  allergens: string[] | null;
}

async function insertFood(admin: SupabaseAdmin, queryName: string, r: ResolvedFood): Promise<FoodRow | null> {
  const name = queryName.trim().replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 120);
  const { data, error } = await admin
    .from("foods")
    .insert({
      name,
      serving_size_g: r.serving_size_g,
      serving_label: r.serving_label,
      calories_per_serving: r.calories_per_serving,
      protein_g: r.protein_g,
      carbs_g: r.carbs_g,
      fat_g: r.fat_g,
      allergens: r.allergens, // null preserved as "unknown"
      source: r.source,
      is_verified: false,
    })
    .select("id, name, serving_size_g, calories_per_serving, protein_g, carbs_g, fat_g, allergens")
    .single();
  if (error) return null;
  return data as FoodRow;
}

/** Resolve a model food name to a foods row: local cache → USDA → OFF → null. */
async function resolveFood(
  admin: SupabaseAdmin,
  rawName: string,
  cache: Map<string, FoodRow | null>
): Promise<FoodRow | null> {
  const key = norm(rawName);
  if (cache.has(key)) return cache.get(key)!;

  // 1. Local cache (case-insensitive exact — avoids wrong loose matches).
  const { data: local } = await admin
    .from("foods")
    .select("id, name, serving_size_g, calories_per_serving, protein_g, carbs_g, fat_g, allergens")
    .ilike("name", rawName)
    .limit(1);
  let row: FoodRow | null = local?.[0] ?? null;

  // 2. USDA (primary).
  if (!row) {
    const usda = await lookupUsdaFood(rawName);
    if (usda) row = await insertFood(admin, rawName, usda);
  }
  // 3. Open Food Facts (fallback).
  if (!row) {
    const off = await lookupOffFood(rawName);
    if (off) row = await insertFood(admin, rawName, off);
  }

  cache.set(key, row);
  return row;
}

/** Which constraint (if any) rejects this food. Fail-closed on unknown allergens. */
function rejectReason(row: FoodRow, name: string, diet: DietInfo): "allergen" | "pattern" | "dislike" | null {
  const allergies = diet.allergies ?? [];
  if (allergies.length > 0) {
    if (row.allergens == null) return "allergen"; // unknown data + declared allergy → fail closed
    if (row.allergens.some((a) => allergies.includes(a))) return "allergen";
  }
  if (diet.pattern && violatesPattern(name, diet.pattern)) return "pattern";
  const lc = name.toLowerCase();
  if ((diet.dislikes ?? []).some((d) => d && lc.includes(d.toLowerCase()))) return "dislike";
  return null;
}

export function parseMealPlanJson(raw: string): unknown {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  try { return JSON.parse(text); } catch { throw new MealValidationError("Model did not return valid JSON"); }
}

/**
 * Resolve every food, enforce the allergen/pattern hard-filter (fail-closed),
 * and compute macros deterministically from the DB. Returns the normalized plan
 * plus the dropped/violating foods so the caller can regenerate.
 */
export async function resolveAndValidateMealPlan(
  admin: SupabaseAdmin,
  raw: unknown,
  diet: DietInfo
): Promise<MealValidationResult> {
  if (!raw || typeof raw !== "object") throw new MealValidationError("Plan is not an object");
  const p = raw as Record<string, unknown>;
  if (typeof p.planName !== "string" || !p.planName.trim()) throw new MealValidationError("planName missing");
  if (!Array.isArray(p.days) || p.days.length === 0) throw new MealValidationError("days missing");

  const cache = new Map<string, FoodRow | null>();
  const unresolved: string[] = [];
  const violations: string[] = [];
  const days: NormalizedMealDay[] = [];
  const weekly: MacroTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

  const rawDays = (p.days as unknown[]).slice(0, MAX_DAYS);
  let di = 0;
  for (const dRaw of rawDays) {
    di += 1;
    const d = (dRaw ?? {}) as Record<string, unknown>;
    const meals: NormalizedMeal[] = [];
    const dayTotals: MacroTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    const rawMeals = Array.isArray(d.meals) ? (d.meals as unknown[]).slice(0, MAX_MEALS) : [];

    for (const mRaw of rawMeals) {
      const m = (mRaw ?? {}) as Record<string, unknown>;
      const mealType = MEAL_TYPES.has(String(m.mealType)) ? String(m.mealType) : "snack";
      const foods: MealFood[] = [];
      const mealTotals: MacroTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
      const rawFoods = Array.isArray(m.foods) ? (m.foods as unknown[]).slice(0, MAX_FOODS) : [];

      for (const fRaw of rawFoods) {
        const f = (fRaw ?? {}) as Record<string, unknown>;
        if (typeof f.name !== "string" || !f.name.trim()) continue;
        const row = await resolveFood(admin, f.name, cache);
        if (!row) { unresolved.push(f.name); continue; } // no DB could resolve → drop

        const reason = rejectReason(row, f.name, diet);
        if (reason) { violations.push(f.name); continue; } // HARD safety drop

        const grams = toGrams(Number(f.quantity), String(f.unit ?? ""), row.serving_size_g);
        if (grams == null) { unresolved.push(f.name); continue; } // unconvertible unit

        const factor = grams / (row.serving_size_g || 100);
        const cal = round(row.calories_per_serving * factor);
        const pro = round1(row.protein_g * factor);
        const carb = round1(row.carbs_g * factor);
        const fat = round1(row.fat_g * factor);

        foods.push({ name: row.name, foodId: row.id, grams: round(grams), calories: cal, protein: pro, carbs: carb, fat });
        mealTotals.calories += cal; mealTotals.protein += pro; mealTotals.carbs += carb; mealTotals.fat += fat;
      }

      if (foods.length === 0) continue; // drop empty meal
      mealTotals.protein = round1(mealTotals.protein);
      mealTotals.carbs = round1(mealTotals.carbs);
      mealTotals.fat = round1(mealTotals.fat);
      meals.push({ mealType, name: typeof m.name === "string" ? m.name.trim().slice(0, 80) : mealType, foods, totals: mealTotals });
      dayTotals.calories += mealTotals.calories; dayTotals.protein += mealTotals.protein;
      dayTotals.carbs += mealTotals.carbs; dayTotals.fat += mealTotals.fat;
    }

    if (meals.length === 0) continue; // drop empty day
    dayTotals.protein = round1(dayTotals.protein);
    dayTotals.carbs = round1(dayTotals.carbs);
    dayTotals.fat = round1(dayTotals.fat);
    days.push({ dayNumber: di, meals, totals: dayTotals });
    weekly.calories += dayTotals.calories; weekly.protein += dayTotals.protein;
    weekly.carbs += dayTotals.carbs; weekly.fat += dayTotals.fat;
  }

  if (days.length === 0) throw new MealValidationError("No usable meals after resolution/filtering");
  weekly.protein = round1(weekly.protein);
  weekly.carbs = round1(weekly.carbs);
  weekly.fat = round1(weekly.fat);

  return {
    plan: {
      planName: p.planName.trim().slice(0, 100),
      durationDays: days.length,
      days,
      weeklyTotals: weekly,
      ...(typeof p.notes === "string" && p.notes.trim() ? { notes: p.notes.trim().slice(0, 1000) } : {}),
    },
    unresolved,
    violations,
  };
}

/** Days whose computed calories fall outside ±tolerance of the target. */
export function daysOutsideTolerance(
  plan: NormalizedMealPlan,
  targetCalories: number,
  tolerancePct: number
): number[] {
  const lo = targetCalories * (1 - tolerancePct);
  const hi = targetCalories * (1 + tolerancePct);
  return plan.days.filter((d) => d.totals.calories < lo || d.totals.calories > hi).map((d) => d.dayNumber);
}
