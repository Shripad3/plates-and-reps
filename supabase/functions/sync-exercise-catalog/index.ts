import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXERCISE_SYNC_SECRET = Deno.env.get("EXERCISE_SYNC_SECRET");
const WGER_EXERCISE_URL = "https://wger.de/api/v2/exerciseinfo/";

const MUSCLE_MAP: Record<string, string> = {
  Quads: "quads",
  Hamstrings: "hamstrings",
  Glutes: "glutes",
  Calves: "calves",
  Chest: "chest",
  Shoulders: "shoulders",
  Biceps: "biceps",
  Triceps: "triceps",
  Forearms: "forearms",
  Abs: "core",
  Lats: "back",
  Trapezius: "back",
};

const CATEGORY_MAP: Record<string, string> = {
  Cardio: "cardio",
  Legs: "strength",
  Arms: "strength",
  Chest: "strength",
  Back: "strength",
  Shoulders: "strength",
  Abs: "strength",
  Calves: "strength",
};

interface WgerMuscle {
  name: string;
  name_en?: string;
}

interface WgerEquipment {
  name: string;
}

interface WgerTranslation {
  language: number;
  name: string;
  aliases?: Array<{ alias: string }>;
}

interface WgerExercise {
  id: number;
  category?: { name: string };
  muscles?: WgerMuscle[];
  muscles_secondary?: WgerMuscle[];
  equipment?: WgerEquipment[];
  translations?: WgerTranslation[];
}

function mapMuscle(muscle: WgerMuscle): string {
  const label = muscle.name_en || muscle.name || "";
  for (const [key, value] of Object.entries(MUSCLE_MAP)) {
    if (
      label.toLowerCase().includes(key.toLowerCase()) ||
      muscle.name.toLowerCase().includes(key.toLowerCase())
    ) {
      return value;
    }
  }

  const lower = label.toLowerCase();
  if (lower.includes("deltoid")) return "shoulders";
  if (lower.includes("pectoral")) return "chest";
  if (lower.includes("abdom")) return "core";
  if (lower.includes("latissimus") || lower.includes("lat")) return "back";
  if (lower.includes("quad")) return "quads";
  if (lower.includes("hamstring") || lower.includes("femoris")) return "hamstrings";
  if (lower.includes("glute")) return "glutes";
  if (lower.includes("calf") || lower.includes("gastrocnemius")) return "calves";
  if (lower.includes("biceps")) return "biceps";
  if (lower.includes("triceps")) return "triceps";
  return "full_body";
}

function mapEquipment(equipment: WgerEquipment): string {
  const name = (equipment.name || "").toLowerCase();
  if (name.includes("barbell")) return "barbell";
  if (name.includes("dumbbell")) return "dumbbell";
  if (name.includes("cable")) return "cable";
  if (name.includes("machine") || name.includes("smith")) return "machine";
  if (name.includes("kettlebell")) return "kettlebell";
  if (name.includes("band")) return "resistance_band";
  if (name.includes("bodyweight") || name.includes("none")) return "bodyweight";
  if (name.includes("bench")) return "bench";
  return "other";
}

function mapExercise(exercise: WgerExercise) {
  const translation =
    exercise.translations?.find((item) => item.language === 2) ??
    exercise.translations?.[0];
  const name = translation?.name?.trim();
  if (!name) return null;

  const muscles = [...(exercise.muscles ?? []), ...(exercise.muscles_secondary ?? [])].map(
    mapMuscle
  );
  const muscleGroups = [...new Set(muscles)].filter(Boolean);
  const equipment = [...new Set((exercise.equipment ?? []).map(mapEquipment))];
  const category =
    CATEGORY_MAP[exercise.category?.name ?? ""] ??
    (exercise.category?.name === "Cardio" ? "cardio" : "strength");
  const searchAliases = (translation.aliases ?? [])
    .map((alias) => alias.alias?.trim())
    .filter((alias): alias is string => Boolean(alias));

  return {
    external_id: `wger:${exercise.id}`,
    name,
    muscle_groups: muscleGroups,
    equipment,
    category,
    search_aliases: searchAliases,
    is_custom: false,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!EXERCISE_SYNC_SECRET) {
    return new Response(JSON.stringify({ error: "EXERCISE_SYNC_SECRET not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${EXERCISE_SYNC_SECRET}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const exercises: ReturnType<typeof mapExercise>[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const response = await fetch(
        `${WGER_EXERCISE_URL}?language=2&limit=${limit}&offset=${offset}`
      );
      if (!response.ok) {
        throw new Error(`Wger API error (${response.status})`);
      }

      const payload = await response.json();
      for (const item of payload.results ?? []) {
        const mapped = mapExercise(item as WgerExercise);
        if (mapped) exercises.push(mapped);
      }

      if (!payload.next) break;
      offset += limit;
    }

    let inserted = 0;
    const chunkSize = 100;
    for (let i = 0; i < exercises.length; i += chunkSize) {
      const chunk = exercises.slice(i, i + chunkSize);
      const { error } = await supabase.from("exercises").upsert(chunk, {
        onConflict: "external_id",
        ignoreDuplicates: false,
      });
      if (error) throw error;
      inserted += chunk.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced: inserted,
        total_fetched: exercises.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
