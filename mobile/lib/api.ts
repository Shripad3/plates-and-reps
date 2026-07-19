import { supabase } from "./supabase";
import type {
  UserProfile,
  PublicProfile,
  UserGoal,
  NutritionLog,
  Food,
  WorkoutSession,
  WorkoutSet,
  Exercise,
  WorkoutTemplate,
  ActivityFeedItem,
  Challenge,
  BodyMetric,
  UserStreak,
  ChatConversation,
  ChatMessage,
  CardioSession,
  SocialConnection,
} from "@/types";
import type { MealType } from "@/constants";
import { expandExerciseSearchQuery } from "@/lib/exerciseSearch";
import { SUPABASE_URL } from "@/constants";
import { captureError } from "@/lib/errorReporting";
import { getHistoryDaysLimit } from "@/lib/premium";

const OPEN_FOOD_FACTS_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const OPEN_FOOD_FACTS_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product";

function sanitizePostgrestFilter(value: string): string {
  return value.replace(/[%_(),.\\]/g, " ").trim();
}

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

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

// Plausibility bounds for crowd-sourced Open Food Facts data, mirroring the
// server-side tool validation. Products outside these are dropped as garbage.
const MAX_FOOD_CALORIES = 10000;
const MAX_FOOD_MACRO_G = 1000;
const MAX_FOOD_SODIUM_MG = 100000;

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

/** Whole-food-first priority: 2 = USDA/verified generic, 1 = brandless, 0 = branded. */
function wholeFoodScore(food: Food): number {
  if (food.source === "usda" || food.is_verified) return 2;
  if (!food.brand?.trim()) return 1;
  return 0;
}

function rankAndDedupeFoods(foods: Food[], query: string, limit = 25): Food[] {
  const q = normalizeSearchText(query);
  const queryTokens = q.split(/\s+/).filter(Boolean);

  const dedupedByKey = new Map<string, Food>();
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
    // Whole foods first, then name-relevance within each tier (mirrors the
    // search-foods edge function's ranking).
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

function buildFoodInsertFromOpenFoodFacts(product: OpenFoodFactsProduct) {
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

  const caloriesFinal = round1(calories || 0);
  // Drop products whose data is implausible rather than surfacing rubbish.
  if (caloriesFinal < 0 || caloriesFinal > MAX_FOOD_CALORIES) return null;

  return {
    name,
    brand: product.brands?.split(",")[0]?.trim() || null,
    barcode,
    serving_size_g: clamp(round2(servingSizeG), 0, 100000),
    serving_label: product.serving_size?.trim() || `${round2(servingSizeG)}g`,
    calories_per_serving: caloriesFinal,
    protein_g: clamp(round2(protein || 0), 0, MAX_FOOD_MACRO_G),
    carbs_g: clamp(round2(carbs || 0), 0, MAX_FOOD_MACRO_G),
    fat_g: clamp(round2(fat || 0), 0, MAX_FOOD_MACRO_G),
    fiber_g: Number.isFinite(fiber) ? clamp(round2(fiber), 0, MAX_FOOD_MACRO_G) : null,
    sugar_g: Number.isFinite(sugar) ? clamp(round2(sugar), 0, MAX_FOOD_MACRO_G) : null,
    sodium_mg: Number.isFinite(sodiumMg) ? clamp(round2(sodiumMg), 0, MAX_FOOD_SODIUM_MG) : null,
    source: "open_food_facts" as const,
    created_by: null,
    is_verified: false,
  };
}

async function queryLocalFoods(query: string, limit = 25): Promise<Food[]> {
  const safe = sanitizePostgrestFilter(query);
  if (!safe) return [];
  const { data, error } = await supabase
    .from("foods")
    .select("*")
    .or(`name.ilike.%${safe}%,brand.ilike.%${safe}%`)
    .order("is_verified", { ascending: false })
    .limit(80);

  if (error) throw error;
  return rankAndDedupeFoods((data ?? []) as Food[], query, limit);
}

async function searchOpenFoodFactsProducts(query: string, pageSize = 30): Promise<OpenFoodFactsProduct[]> {
  const params = new URLSearchParams({
    search_terms: query,
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

async function upsertFoodsFromOpenFoodFacts(products: OpenFoodFactsProduct[]): Promise<void> {
  const inserts = products
    .map(buildFoodInsertFromOpenFoodFacts)
    .filter((item): item is NonNullable<typeof item> => !!item);

  if (inserts.length === 0) return;

  const { error } = await supabase
    .from("foods")
    .upsert(inserts, { onConflict: "barcode", ignoreDuplicates: false });

  if (error) throw error;
}

async function recordFoodSearchTerm(term: string): Promise<void> {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("record_food_search_term", { p_term: normalized });
  if (error) {
    // Non-blocking analytics call: do not fail user search if this RPC errors.
    console.warn("record_food_search_term failed", error.message);
  }
}

// ─── User ─────────────────────────────────────────────────────────────────────

export async function getProfile(): Promise<UserProfile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) throw error;
  return data as UserProfile;
}

export async function updateProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { is_premium: _ip, premium_until: _pu, id: _id, created_at: _ca, ...safeUpdates } =
    updates as Partial<UserProfile>;

  const { data, error } = await supabase
    .from("user_profiles")
    // Cast: injury_info is a valid column but database.types.ts is stale until
    // regenerated (supabase gen types) after the ai_plan_generation migration.
    .update({ ...safeUpdates, updated_at: new Date().toISOString() } as never)
    .eq("id", user.id)
    .select()
    .single();

  if (error) throw error;
  return data as UserProfile;
}

export async function getGoal(): Promise<UserGoal | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_goals")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return (data as UserGoal) ?? null;
}

export async function upsertGoal(goal: Partial<UserGoal>): Promise<UserGoal> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Deactivate existing goal
  await supabase
    .from("user_goals")
    .update({ is_active: false })
    .eq("user_id", user.id)
    .eq("is_active", true);

  const { data, error } = await supabase
    .from("user_goals")
    .insert({ ...goal, goal_type: goal.goal_type ?? "maintenance", user_id: user.id, is_active: true })
    .select()
    .single();

  if (error) throw error;
  return data as UserGoal;
}

export async function updateActiveGoal(
  updates: Partial<
    Pick<
      UserGoal,
      | "target_weight_kg"
      | "target_calories"
      | "target_protein_g"
      | "target_carbs_g"
      | "target_fat_g"
      | "target_water_ml"
      | "weekly_workout_target"
      | "goal_type"
    >
  >
): Promise<UserGoal> {
  const existing = await getGoal();
  if (!existing) throw new Error("No active goal");

  const { data, error } = await supabase
    .from("user_goals")
    .update(updates)
    .eq("id", existing.id)
    .select()
    .single();

  if (error) throw error;
  return data as UserGoal;
}

// ─── Nutrition ─────────────────────────────────────────────────────────────────

export async function getNutritionLogs(date: string): Promise<NutritionLog[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("nutrition_logs")
    .select("*, food:foods(*)")
    .eq("user_id", user.id)
    .eq("date", date)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as NutritionLog[];
}

export async function logFood(
  entry: Omit<NutritionLog, "id" | "user_id" | "created_at">
): Promise<NutritionLog> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const isUuid = (value: string | null | undefined) =>
    !!value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  // Some external fallback results use synthetic IDs (e.g. "external-...").
  // nutrition_logs.food_id is uuid, so only persist valid UUIDs.
  const safeFoodId = isUuid(entry.food_id) ? entry.food_id : null;

  // Strip the joined `food` relation — only insert DB columns.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { food: _food, ...entryColumns } = entry;

  const { data, error } = await supabase
    .from("nutrition_logs")
    .insert({ ...entryColumns, food_id: safeFoodId, user_id: user.id })
    .select("*, food:foods(*)")
    .single();

  if (error) throw error;
  return data as NutritionLog;
}

export async function deleteNutritionLog(id: string): Promise<void> {
  const { error } = await supabase.from("nutrition_logs").delete().eq("id", id);
  if (error) throw error;
}

export async function updateNutritionLog(
  id: string,
  updates: Partial<
    Pick<
      NutritionLog,
      "meal_type" | "date" | "servings" | "calories" | "protein_g" | "carbs_g" | "fat_g" | "food_name" | "notes"
    >
  >
): Promise<NutritionLog> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("nutrition_logs")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*, food:foods(*)")
    .single();

  if (error) throw error;
  return data as NutritionLog;
}

export async function searchFoods(query: string): Promise<Food[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("search-foods", {
    body: { query: q, limit: 25 },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  if (error) throw error;

  const items = (data?.items ?? []) as Food[];
  if (items.length > 0) return items;

  // Fallback for environments where function may not be deployed yet.
  // Keep legacy path to avoid breaking search entirely.
  void recordFoodSearchTerm(q);
  const local = await queryLocalFoods(q, 25);
  if (local.length > 0) return local;
  const externalProducts = await searchOpenFoodFactsProducts(q, 30);
  if (externalProducts.length > 0) {
    await upsertFoodsFromOpenFoodFacts(externalProducts);
    return await queryLocalFoods(q, 25);
  }
  return local;
}

export async function getFoodByBarcode(barcode: string): Promise<Food | null> {
  const { data, error } = await supabase
    .from("foods")
    .select("*")
    .eq("barcode", barcode)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  if (data) return data as Food;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: fnData, error: fnError } = await supabase.functions.invoke("search-foods", {
    body: { barcode },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  if (fnError) throw fnError;

  const items = (fnData?.items ?? []) as Food[];
  return items[0] ?? null;
}

export async function logWater(date: string, amount_ml: number): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("water_logs")
    .insert({ user_id: user.id, date, amount_ml });

  if (error) throw error;
}

export async function getWaterTotal(date: string): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data, error } = await supabase
    .from("water_logs")
    .select("amount_ml")
    .eq("user_id", user.id)
    .eq("date", date);

  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + row.amount_ml, 0);
}

// ─── Workouts ─────────────────────────────────────────────────────────────────

export async function getExercisesByIds(ids: string[]): Promise<Exercise[]> {
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("exercises")
    .select("*")
    .in("id", ids);

  if (error) throw error;
  return (data ?? []) as Exercise[];
}

export async function searchExercises(query: string, muscleGroup?: string): Promise<Exercise[]> {
  const expandedQuery = expandExerciseSearchQuery(query);

  const { data, error } = await supabase.rpc("search_exercises", {
    search_query: expandedQuery,
    muscle_filter: muscleGroup ?? null,
    result_limit: 50,
  });

  if (!error) {
    return (data ?? []) as Exercise[];
  }

  // Fallback for environments before the search_exercises RPC migration
  let q = supabase.from("exercises").select("*");
  if (expandedQuery) q = q.ilike("name", `%${expandedQuery}%`);
  if (muscleGroup) q = q.contains("muscle_groups", [muscleGroup]);

  const fallback = await q.order("name").limit(50);
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []) as Exercise[];
}

export async function createExercise(input: {
  name: string;
  muscle_groups?: string[];
  equipment?: string[];
  category?: Exercise["category"];
}): Promise<Exercise> {
  const name = input.name.trim();
  if (!name) throw new Error("Exercise name is required");

  const { data: existing, error: existingError } = await supabase
    .from("exercises")
    .select("*")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing as Exercise;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("exercises")
    .insert({
      name,
      muscle_groups: input.muscle_groups ?? [],
      equipment: input.equipment ?? [],
      category: input.category ?? "strength",
      is_custom: true,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: duplicate, error: duplicateError } = await supabase
        .from("exercises")
        .select("*")
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
      if (duplicateError) throw duplicateError;
      if (duplicate) return duplicate as Exercise;
    }
    throw error;
  }

  return data as Exercise;
}

export async function getWorkoutTemplates(): Promise<WorkoutTemplate[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("workout_templates")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((t) => ({ ...t, exercises: t.exercises ?? [] })) as unknown as WorkoutTemplate[];
}

export async function updateWorkoutTemplate(
  id: string,
  updates: Partial<Pick<WorkoutTemplate, "name" | "description" | "exercises">>
): Promise<WorkoutTemplate> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("workout_templates")
    .update({
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
      ...(updates.exercises !== undefined
        ? { exercises: updates.exercises as unknown as import("@/types/database.types").Json }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw error;
  return { ...data, exercises: data.exercises ?? [] } as unknown as WorkoutTemplate;
}

export async function deleteWorkoutTemplate(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("workout_templates")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw error;
}

export async function createWorkoutTemplate(
  template: Omit<WorkoutTemplate, "id">
): Promise<WorkoutTemplate> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("workout_templates")
    .insert({ ...template, user_id: user.id, exercises: template.exercises as unknown as import("@/types/database.types").Json })
    .select()
    .single();

  if (error) throw error;
  return { ...data, exercises: data.exercises ?? [] } as unknown as WorkoutTemplate;
}

export async function getWorkoutSessionById(sessionId: string): Promise<WorkoutSession | null> {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) throw error;
  return data as WorkoutSession | null;
}

export async function getWorkoutSessions(limit = 20): Promise<WorkoutSession[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const profile = await getProfile().catch(() => null);
  const historyDays = getHistoryDaysLimit(profile);
  const since = new Date();
  since.setDate(since.getDate() - historyDays);

  const { data, error } = await supabase
    .from("workout_sessions")
    .select("*")
    .eq("user_id", user.id)
    .gte("started_at", since.toISOString())
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function createWorkoutSession(
  session: Omit<WorkoutSession, "id" | "user_id">
): Promise<WorkoutSession> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Strip joined relation `sets` — only insert DB columns.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sets: _sets, ...sessionColumns } = session;

  const { data, error } = await supabase
    .from("workout_sessions")
    .insert({ ...sessionColumns, user_id: user.id })
    .select()
    .single();

  if (error) throw error;
  return data as WorkoutSession;
}

export async function completeWorkoutSession(
  sessionId: string,
  updates: { completed_at: string; duration_seconds: number; notes?: string }
): Promise<WorkoutSession> {
  const { data, error } = await supabase
    .from("workout_sessions")
    .update(updates)
    .eq("id", sessionId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteWorkoutSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from("workout_sessions")
    .delete()
    .eq("id", sessionId);

  if (error) throw error;
}

export async function deleteWorkoutSessions(sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return;

  const { error } = await supabase
    .from("workout_sessions")
    .delete()
    .in("id", sessionIds);

  if (error) throw error;
}

export async function logWorkoutSet(
  set: Omit<WorkoutSet, "id">
): Promise<WorkoutSet> {
  // Strip joined `exercise` relation — only insert DB columns.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { exercise: _exercise, ...setColumns } = set;

  const { data, error } = await supabase
    .from("workout_sets")
    .insert(setColumns)
    .select()
    .single();

  if (error) throw error;
  return data as WorkoutSet;
}

export async function getSessionSets(sessionId: string): Promise<WorkoutSet[]> {
  const { data, error } = await supabase
    .from("workout_sets")
    .select("*, exercise:exercises(*)")
    .eq("session_id", sessionId)
    .order("set_number");

  if (error) throw error;
  return (data ?? []) as WorkoutSet[];
}

// ─── Body Metrics ─────────────────────────────────────────────────────────────

export type RecentFood = {
  food_name: string;
  food_id: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  servings: number;
  meal_type: MealType;
  log_count: number;
};

export async function getRecentFoods(limit = 12): Promise<RecentFood[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const profile = await getProfile().catch(() => null);
  const historyDays = getHistoryDaysLimit(profile);
  const since = new Date();
  since.setDate(since.getDate() - historyDays);

  const { data, error } = await supabase
    .from("nutrition_logs")
    .select("food_name, food_id, calories, protein_g, carbs_g, fat_g, servings, meal_type, date")
    .eq("user_id", user.id)
    .gte("date", since.toISOString().split("T")[0])
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  const grouped = new Map<string, RecentFood>();
  for (const row of data ?? []) {
    const name = (row.food_name as string | null) ?? "Unknown food";
    const key = `${name}|${row.food_id ?? ""}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.log_count += 1;
      continue;
    }
    grouped.set(key, {
      food_name: name,
      food_id: row.food_id as string | null,
      calories: Number(row.calories),
      protein_g: Number(row.protein_g),
      carbs_g: Number(row.carbs_g),
      fat_g: Number(row.fat_g),
      servings: Number(row.servings),
      meal_type: row.meal_type as MealType,
      log_count: 1,
    });
  }

  return [...grouped.values()]
    .sort((a, b) => b.log_count - a.log_count)
    .slice(0, limit);
}

export async function getBodyMetrics(days = 90): Promise<BodyMetric[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const profile = await getProfile().catch(() => null);
  const maxDays = getHistoryDaysLimit(profile);
  const effectiveDays = Math.min(days, maxDays);

  const since = new Date();
  since.setDate(since.getDate() - effectiveDays);

  const { data, error } = await supabase
    .from("body_metrics")
    .select("*")
    .eq("user_id", user.id)
    .gte("date", since.toISOString().split("T")[0])
    .order("date", { ascending: true });

  if (error) throw error;
  return (data ?? []) as BodyMetric[];
}

export async function logBodyMetric(
  metric: Omit<BodyMetric, "id" | "user_id" | "created_at">
): Promise<BodyMetric> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("body_metrics")
    .upsert({ ...metric, user_id: user.id }, { onConflict: "user_id,date" })
    .select()
    .single();

  if (error) throw error;
  return data as BodyMetric;
}

export async function updateBodyMetric(
  id: string,
  updates: Partial<Pick<BodyMetric, "weight_kg" | "body_fat_pct" | "notes">>
): Promise<BodyMetric> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("body_metrics")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw error;
  return data as BodyMetric;
}

// ─── Social ─────────────────────────────────────────────────────────────────

export async function searchUsers(query: string): Promise<PublicProfile[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const safe = sanitizePostgrestFilter(query);
  if (!safe) return [];

  const { data, error } = await supabase
    .from("public_profiles")
    .select("*")
    .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
    .neq("id", user.id)
    .limit(20);

  if (error) throw error;
  return (data ?? []) as PublicProfile[];
}

export async function getFollowing(): Promise<SocialConnection[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("social_connections")
    .select("*, profile:public_profiles!social_connections_following_id_fkey(id, username, display_name, avatar_url)")
    .eq("follower_id", user.id)
    .neq("status", "declined")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as SocialConnection[];
}

export async function getFollowers(): Promise<SocialConnection[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("social_connections")
    .select("*, profile:public_profiles!social_connections_follower_id_fkey(id, username, display_name, avatar_url)")
    .eq("following_id", user.id)
    .eq("status", "accepted")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as SocialConnection[];
}

export async function getFollowRequests(): Promise<SocialConnection[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("social_connections")
    .select("*, profile:public_profiles!social_connections_follower_id_fkey(id, username, display_name, avatar_url)")
    .eq("following_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as SocialConnection[];
}

export async function getFriends(): Promise<PublicProfile[]> {
  const [following, followers] = await Promise.all([getFollowing(), getFollowers()]);
  const acceptedFollowing = new Set(
    following.filter((c) => c.status === "accepted").map((c) => c.following_id)
  );
  return followers
    .filter((c) => acceptedFollowing.has(c.follower_id))
    .map((c) => c.profile)
    .filter(Boolean) as PublicProfile[];
}

export async function followUser(targetUserId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (targetUserId === user.id) throw new Error("You cannot follow yourself");

  const { error } = await supabase.from("social_connections").insert({
    follower_id: user.id,
    following_id: targetUserId,
    connection_type: "follow",
    status: "pending",
  });

  if (error) throw error;
}

export async function acceptFollowRequest(connectionId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("social_connections")
    .update({ status: "accepted" })
    .eq("id", connectionId)
    .eq("following_id", user.id)
    .eq("status", "pending");

  if (error) throw error;
}

export async function declineFollowRequest(connectionId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("social_connections")
    .delete()
    .eq("id", connectionId)
    .eq("following_id", user.id)
    .eq("status", "pending");

  if (error) throw error;
}

export async function unfollowUser(targetUserId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("social_connections")
    .delete()
    .eq("follower_id", user.id)
    .eq("following_id", targetUserId);

  if (error) throw error;
}

export async function removeFollower(followerUserId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("social_connections")
    .delete()
    .eq("follower_id", followerUserId)
    .eq("following_id", user.id);

  if (error) throw error;
}

export async function getFeed(page = 0): Promise<ActivityFeedItem[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("activity_feed")
    .select(`
      *,
      profile:public_profiles!activity_feed_user_id_fkey(id, username, display_name, avatar_url),
      reactions:feed_reactions(id, reaction_type, user_id),
      comments:feed_comments(id, content, created_at, user_id, profile:public_profiles(id, username, display_name, avatar_url))
    `)
    .order("created_at", { ascending: false })
    .range(page * 20, page * 20 + 19);

  if (error) throw error;

  // Annotate which reaction_type the current user has made (if any)
  return ((data ?? []) as ActivityFeedItem[]).map((item) => ({
    ...item,
    user_reaction:
      (item.reactions ?? []).find((r) => r.user_id === user.id)?.reaction_type ?? null,
  }));
}

export async function toggleReaction(
  feedItemId: string,
  reactionType: string,
  currentReaction: string | null
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (currentReaction === reactionType) {
    // Remove existing reaction
    const { error } = await supabase
      .from("feed_reactions")
      .delete()
      .eq("feed_item_id", feedItemId)
      .eq("user_id", user.id);
    if (error) throw error;
  } else {
    // Upsert (add new or replace existing)
    const { error } = await supabase
      .from("feed_reactions")
      .upsert(
        { feed_item_id: feedItemId, user_id: user.id, reaction_type: reactionType },
        { onConflict: "feed_item_id,user_id" }
      );
    if (error) throw error;
  }
}

export async function addComment(feedItemId: string, content: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("feed_comments")
    .insert({ feed_item_id: feedItemId, user_id: user.id, content });

  if (error) throw error;
}

export async function getChallenges(): Promise<Challenge[]> {
  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("is_public", true)
    .gte("end_date", new Date().toISOString().split("T")[0])
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Challenge[];
}

export async function joinChallenge(challengeId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("challenge_participants")
    .insert({ challenge_id: challengeId, user_id: user.id });

  if (error) throw error;
}

// ─── Streaks ─────────────────────────────────────────────────────────────────

export async function getStreaks(): Promise<UserStreak[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("user_streaks")
    .select("*")
    .eq("user_id", user.id);

  if (error) throw error;
  return (data ?? []) as UserStreak[];
}

// ─── AI Chat ─────────────────────────────────────────────────────────────────

export async function getConversations(): Promise<ChatConversation[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("chat_conversations")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ChatConversation[];
}

export async function getChatMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

export async function createConversation(): Promise<ChatConversation> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("chat_conversations")
    .insert({ user_id: user.id })
    .select()
    .single();

  if (error) throw error;
  return data as ChatConversation;
}

export async function publishActivityFeedItem(
  activityType: ActivityFeedItem["activity_type"],
  referenceId: string | null,
  metadata: Record<string, unknown>,
  visibility: "friends" | "public" | "private" = "friends"
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("activity_feed").insert({
    user_id: user.id,
    activity_type: activityType,
    reference_id: referenceId,
    metadata: metadata as import("@/types/database.types").Json,
    visibility,
  });
}

// ─── AI logging ───────────────────────────────────────────────────────────────

export type AnalyzedFoodItem = {
  name: string;
  portion_description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type VoiceParsedFoodItem = {
  food_name: string;
  quantity: number;
  unit: string;
  meal_type: MealType;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

export async function analyzeFoodPhoto(
  imageBase64: string,
  mimeType = "image/jpeg"
): Promise<AnalyzedFoodItem[]> {
  const baseUrl = SUPABASE_URL.trim().replace(/\/+$/, "");
  const image_url = `data:${mimeType};base64,${imageBase64}`;
  const response = await fetch(`${baseUrl}/functions/v1/analyze-food-photo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getAuthHeaders()),
    },
    body: JSON.stringify({ image_url }),
  });

  const raw = await response.text();
  let json: { items?: AnalyzedFoodItem[]; error?: string } = {};
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(raw || "Photo analysis failed");
  }

  if (!response.ok) {
    const code = (json as { code?: string }).code;
    const err = new Error(json.error ?? `Photo analysis failed (${response.status})`);
    if (response.status === 429 || code === "LIMIT_REACHED") {
      (err as Error & { code?: string }).code = "LIMIT_REACHED";
    }
    throw err;
  }

  return json.items ?? [];
}

export async function transcribeVoiceLog(audioUri: string): Promise<{
  transcript: string;
  items: VoiceParsedFoodItem[];
}> {
  const baseUrl = SUPABASE_URL.trim().replace(/\/+$/, "");
  const formData = new FormData();
  formData.append("audio", {
    uri: audioUri,
    name: "voice.m4a",
    type: "audio/m4a",
  } as unknown as Blob);

  const response = await fetch(`${baseUrl}/functions/v1/transcribe-voice`, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: formData,
  });

  const raw = await response.text();
  let json: { transcript?: string; items?: VoiceParsedFoodItem[]; error?: string } = {};
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(raw || "Voice logging failed");
  }

  if (!response.ok) {
    const code = (json as { code?: string }).code;
    const err = new Error(json.error ?? `Voice logging failed (${response.status})`);
    if (response.status === 429 || code === "LIMIT_REACHED") {
      (err as Error & { code?: string }).code = "LIMIT_REACHED";
    }
    throw err;
  }

  const items = (json.items ?? []).map((item) => ({
    food_name: item.food_name,
    quantity: item.quantity ?? 1,
    unit: item.unit ?? "serving",
    meal_type: item.meal_type,
    calories: item.calories ?? 0,
    protein_g: item.protein_g ?? 0,
    carbs_g: item.carbs_g ?? 0,
    fat_g: item.fat_g ?? 0,
  }));

  return {
    transcript: json.transcript ?? "",
    items,
  };
}

export function reportClientError(error: unknown, context?: Record<string, unknown>) {
  captureError(error, context);
}

export async function syncRevenueCatPremium(): Promise<{ is_premium: boolean }> {
  const baseUrl = SUPABASE_URL.trim().replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/functions/v1/sync-revenuecat-premium`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getAuthHeaders()),
    },
  });

  const json = (await response.json()) as { is_premium?: boolean; error?: string };
  if (!response.ok) {
    throw new Error(json.error ?? `Premium sync failed (${response.status})`);
  }

  return { is_premium: !!json.is_premium };
}

export async function deleteAccount(): Promise<void> {
  const baseUrl = SUPABASE_URL.trim().replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/functions/v1/delete-account`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getAuthHeaders()),
    },
  });

  const json = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(json.error ?? `Account deletion failed (${response.status})`);
  }
}
