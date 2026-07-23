// Deterministic resolution of a free-text food name to DB-grounded per-serving
// macros, for paths where the LLM would otherwise supply the numbers (e.g. the
// AI coach's log_food tool). Resolution chain mirrors the meal-plan resolver:
//   local `foods` cache → USDA → Open Food Facts.
// Returns null when nothing resolves, so the caller can fall back to the model's
// estimate for arbitrary/composite dishes the databases don't cover.

import { lookupUsdaFood, lookupOffFood, type ResolvedFood } from "./foodLookup.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = any;

export interface ResolvedLogFood {
  food_id: string | null;
  name: string;
  /** Macros for ONE serving (USDA/OFF rows are per-100g). Multiply by servings. */
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function titleCase(name: string): string {
  return name.trim().replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 120);
}

/** Cache a USDA/OFF result into `foods` so it gets a real id + enriches the catalog. */
async function insertResolved(
  admin: SupabaseAdmin,
  queryName: string,
  r: ResolvedFood
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await admin
    .from("foods")
    .insert({
      name: titleCase(queryName),
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
    .select("id, name")
    .single();
  if (error) return null;
  return data as { id: string; name: string };
}

/**
 * Resolve a food name to DB-grounded per-serving macros, or null if unresolvable.
 * Never throws — any lookup/insert failure resolves to null so the caller can
 * degrade to the model's estimate rather than fail the log.
 */
export async function resolveLoggedFood(
  admin: SupabaseAdmin,
  rawName: string
): Promise<ResolvedLogFood | null> {
  const name = rawName.trim();
  if (!name) return null;

  try {
    // 1. Local cache (case-insensitive exact — avoids wrong loose matches).
    const { data: local } = await admin
      .from("foods")
      .select("id, name, calories_per_serving, protein_g, carbs_g, fat_g")
      .ilike("name", name)
      .limit(1);
    const hit = local?.[0];
    if (hit) {
      return {
        food_id: hit.id as string,
        name: hit.name as string,
        calories: toNumber(hit.calories_per_serving),
        protein_g: toNumber(hit.protein_g),
        carbs_g: toNumber(hit.carbs_g),
        fat_g: toNumber(hit.fat_g),
      };
    }

    // 2. USDA (primary) → 3. Open Food Facts (fallback).
    const resolved = (await lookupUsdaFood(name)) ?? (await lookupOffFood(name));
    if (!resolved) return null;

    const inserted = await insertResolved(admin, name, resolved);
    return {
      food_id: inserted?.id ?? null,
      name: inserted?.name ?? titleCase(name),
      calories: resolved.calories_per_serving, // per 100g serving basis
      protein_g: resolved.protein_g,
      carbs_g: resolved.carbs_g,
      fat_g: resolved.fat_g,
    };
  } catch {
    return null;
  }
}
