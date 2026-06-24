/**
 * Drizzle ORM schema for the local SQLite offline queue.
 * Mirrors the server tables, but only the columns needed for queuing.
 */
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const pendingNutritionLogs = sqliteTable("pending_nutrition_logs", {
  local_id: text("local_id").primaryKey(),
  food_id: text("food_id"),
  food_name: text("food_name"),
  meal_type: text("meal_type").notNull(),
  date: text("date").notNull(),
  servings: real("servings").notNull().default(1),
  calories: real("calories").notNull(),
  protein_g: real("protein_g").notNull().default(0),
  carbs_g: real("carbs_g").notNull().default(0),
  fat_g: real("fat_g").notNull().default(0),
  log_method: text("log_method").default("manual"),
  notes: text("notes"),
  created_at: text("created_at").notNull(),
});

export const pendingWorkoutSessions = sqliteTable("pending_workout_sessions", {
  local_id: text("local_id").primaryKey(),
  template_id: text("template_id"),
  name: text("name").notNull(),
  started_at: text("started_at").notNull(),
  completed_at: text("completed_at"),
  duration_seconds: integer("duration_seconds"),
  notes: text("notes"),
});

export const pendingWorkoutSets = sqliteTable("pending_workout_sets", {
  local_id: text("local_id").primaryKey(),
  session_local_id: text("session_local_id").notNull(),
  exercise_id: text("exercise_id").notNull(),
  set_number: integer("set_number").notNull(),
  reps: integer("reps"),
  weight_kg: real("weight_kg"),
  duration_seconds: integer("duration_seconds"),
  distance_meters: real("distance_meters"),
  rpe: integer("rpe"),
  is_warmup: integer("is_warmup", { mode: "boolean" }).default(false),
  completed_at: text("completed_at"),
});

export const pendingWaterLogs = sqliteTable("pending_water_logs", {
  local_id: text("local_id").primaryKey(),
  date: text("date").notNull(),
  amount_ml: integer("amount_ml").notNull(),
  created_at: text("created_at").notNull(),
});

export const cachedFoods = sqliteTable("cached_foods", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  brand: text("brand"),
  barcode: text("barcode"),
  serving_size_g: real("serving_size_g").notNull(),
  serving_label: text("serving_label").notNull(),
  calories_per_serving: real("calories_per_serving").notNull(),
  protein_g: real("protein_g").notNull(),
  carbs_g: real("carbs_g").notNull(),
  fat_g: real("fat_g").notNull(),
  cached_at: text("cached_at").notNull(),
});
