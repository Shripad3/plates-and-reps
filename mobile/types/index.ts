import type { MealType } from "@/constants";

// ─── User ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  date_of_birth: string | null;
  sex: "male" | "female" | "other" | "prefer_not_to_say" | null;
  height_cm: number | null;
  activity_level: string | null;
  is_premium: boolean;
  premium_until: string | null;
  created_at: string;
  // AI plan generation
  injury_info?: import("@/lib/aiPlan").InjuryInfo | null;
  diet_info?: import("@/lib/mealPlan").DietInfo | null;
}

// Safe, public-facing subset of UserProfile (backed by the public_profiles
// view) — used anywhere we look up another user, since RLS restricts the
// full user_profiles table to the owning user only.
export interface PublicProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface UserGoal {
  id: string;
  user_id: string;
  goal_type: "weight_loss" | "muscle_gain" | "maintenance" | "custom";
  target_weight_kg: number | null;
  target_calories: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
  target_water_ml: number;
  weekly_workout_target: number;
  start_date: string;
  is_active: boolean;
}

// ─── Body Metrics ────────────────────────────────────────────────────────────

export interface BodyMetric {
  id: string;
  user_id: string;
  date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  measurements: Record<string, number> | null;
  notes: string | null;
}

export interface ProgressPhoto {
  id: string;
  user_id: string;
  photo_url: string;
  date: string;
  note: string | null;
  visibility: "private" | "friends" | "public";
}

// ─── Nutrition ───────────────────────────────────────────────────────────────

export interface Food {
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

export interface NutritionLog {
  id: string;
  user_id: string;
  food_id: string | null;
  meal_type: MealType;
  date: string;
  servings: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  food_name: string | null;
  log_method: "manual" | "barcode" | "voice" | "photo_ai" | "chatbot";
  notes: string | null;
  food?: Food;
}

export interface DayNutritionSummary {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_ml: number;
  logs: NutritionLog[];
}

// ─── Workouts ─────────────────────────────────────────────────────────────────

export interface Exercise {
  id: string;
  name: string;
  muscle_groups: string[];
  equipment: string[];
  category: "strength" | "cardio" | "flexibility" | "sport";
  instructions: string | null;
  demo_url: string | null;
  is_custom: boolean;
}

export interface WorkoutTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  exercises: WorkoutTemplateExercise[];
}

export interface WorkoutTemplateExercise {
  exercise_id: string;
  order: number;
  sets: WorkoutTemplateSet[];
  exercise?: Exercise;
}

export interface WorkoutTemplateSet {
  target_reps: number | null;
  target_weight_kg: number | null;
  rest_seconds: number;
}

export interface WorkoutSession {
  id: string;
  user_id: string;
  template_id: string | null;
  name: string;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  notes: string | null;
  is_synced: boolean;
  sets?: WorkoutSet[];
}

export interface WorkoutSet {
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  rpe: number | null;
  is_warmup: boolean;
  completed_at: string | null;
  exercise?: Exercise;
}

export interface CardioSession {
  id: string;
  user_id: string;
  activity_type: string;
  started_at: string;
  duration_seconds: number;
  distance_meters: number | null;
  calories_burned: number | null;
  avg_heart_rate: number | null;
  notes: string | null;
  is_synced: boolean;
}

// ─── Social ──────────────────────────────────────────────────────────────────

export type SocialConnectionStatus = "pending" | "accepted" | "declined";

export interface SocialConnection {
  id: string;
  follower_id: string;
  following_id: string;
  connection_type: "follow" | "accountability_partner";
  status: SocialConnectionStatus;
  created_at: string;
  profile?: PublicProfile;
}

export interface ActivityFeedItem {
  id: string;
  user_id: string;
  activity_type: string;
  reference_id: string | null;
  metadata: Record<string, unknown>;
  visibility: "friends" | "public" | "private";
  created_at: string;
  profile?: PublicProfile;
  reactions?: FeedReaction[];
  comments?: FeedComment[];
  reaction_count?: number;
  comment_count?: number;
  user_reaction?: string | null;
}

export interface FeedReaction {
  id: string;
  feed_item_id: string;
  user_id: string;
  reaction_type: string;
  profile?: PublicProfile;
}

export interface FeedComment {
  id: string;
  feed_item_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: PublicProfile;
}

export interface Challenge {
  id: string;
  created_by: string;
  name: string;
  description: string | null;
  challenge_type: string;
  target_value: number;
  target_unit: string | null;
  start_date: string;
  end_date: string;
  is_public: boolean;
  max_participants: number | null;
  participant_count?: number;
  user_progress?: number;
}

// ─── AI Chat ──────────────────────────────────────────────────────────────────

export interface ChatConversation {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  last_message?: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls: unknown[] | null;
  tool_call_id: string | null;
  created_at: string;
}

// ─── Streaks ──────────────────────────────────────────────────────────────────

export interface UserStreak {
  id: string;
  user_id: string;
  streak_type: "logging" | "workout" | "protein_goal";
  current_streak: number;
  longest_streak: number;
  last_logged_date: string | null;
}
