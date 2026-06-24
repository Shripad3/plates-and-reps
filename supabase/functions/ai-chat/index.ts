import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { calculateGoalTargets } from "../_shared/nutritionCalc.ts";
import { assertChatAllowed, recordAiUsage } from "../_shared/usageLimits.ts";
import { validateToolArgs } from "../_shared/toolValidation.ts";

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") ?? "llama-3.3-70b-versatile";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  }
  return false;
}

type OpenAITool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type OpenAIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

const tools: OpenAITool[] = [
  {
    type: "function",
    function: {
      name: "get_nutrition_summary",
      description: "Get the user's calorie and macro totals for a specific date (defaults to today).",
      parameters: {
        type: "object",
        properties: { date: { type: "string", description: "YYYY-MM-DD, defaults to today" } },
      },
    }
  },
  {
    type: "function",
    function: {
      name: "log_food",
      description: "Log a food item to the user's nutrition diary.",
      parameters: {
        type: "object",
        properties: {
          food_name: { type: "string" },
          meal_type: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
          date: { type: "string", description: "YYYY-MM-DD, defaults to today" },
          calories: { type: ["number", "string"] },
          protein_g: { type: ["number", "string"] },
          carbs_g: { type: ["number", "string"] },
          fat_g: { type: ["number", "string"] },
          servings: { type: ["number", "string"] },
        },
        required: ["food_name", "meal_type", "calories", "protein_g", "carbs_g", "fat_g"],
      },
    }
  },
  {
    type: "function",
    function: {
      name: "get_workout_history",
      description: "Get the user's recent workout sessions.",
      parameters: {
        type: "object",
        properties: { days: { type: ["number", "string"], description: "Days to look back, default 7" } },
      },
    }
  },
  {
    type: "function",
    function: {
      name: "get_user_goals",
      description: "Get the user's current fitness goals and macro targets.",
      parameters: { type: "object", properties: {} },
    }
  },
  {
    type: "function",
    function: {
      name: "update_goal",
      description:
        "Update the user's fitness GOAL settings (target weight they want to reach, calorie/macro targets, goal type). Use when the user asks to change their goal weight, target weight, or weight goal — NOT their current weigh-in.",
      parameters: {
        type: "object",
        properties: {
          target_weight_kg: {
            type: ["number", "string"],
            description: "Goal/target weight in kg (the weight they are aiming for)",
          },
          goal_type: {
            type: "string",
            enum: ["weight_loss", "muscle_gain", "maintenance", "custom"],
          },
          target_calories: { type: ["number", "string"] },
          target_protein_g: { type: ["number", "string"] },
          target_carbs_g: { type: ["number", "string"] },
          target_fat_g: { type: ["number", "string"] },
          weekly_workout_target: { type: ["number", "string"] },
          recalculate_macros: {
            type: ["boolean", "string"],
            description:
              "Set to true to recalculate calorie/macro targets from profile + latest current weight (optional; omit when only changing goal weight)",
          },
        },
      },
    }
  },
  {
    type: "function",
    function: {
      name: "update_profile",
      description:
        "Update the user's profile settings (height, activity level, display name, sex). Use when they ask to change their height, activity level, or name — NOT for weight or goals.",
      parameters: {
        type: "object",
        properties: {
          height_cm: {
            type: ["number", "string"],
            description: "Height in centimeters",
          },
          activity_level: {
            type: "string",
            enum: [
              "sedentary",
              "lightly_active",
              "moderately_active",
              "very_active",
              "extra_active",
            ],
          },
          display_name: { type: "string" },
          sex: {
            type: "string",
            enum: ["male", "female", "other", "prefer_not_to_say"],
          },
          recalculate_macros: {
            type: ["boolean", "string"],
            description:
              "Recalculate calorie/macro targets after height or activity changes (defaults to true when height or activity changes)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_body_metric",
      description:
        "Log the user's CURRENT body weight for today (Progress chart / weigh-in). Use only when they report what they weigh now — NOT when changing goal weight, target weight, or weight goal.",
      parameters: {
        type: "object",
        properties: {
          weight_kg: { type: ["number", "string"], description: "Current body weight in kg" },
          date: { type: "string", description: "YYYY-MM-DD, defaults to today" },
        },
        required: ["weight_kg"],
      },
    }
  },
  {
    type: "function",
    function: {
      name: "get_progress_summary",
      description: "Get a summary of the user's progress over the last N days.",
      parameters: {
        type: "object",
        properties: { days: { type: ["number", "string"], description: "Timeframe in days, default 30" } },
      },
    }
  },
];

// ─── Tool execution ───────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown> | null | undefined,
  userId: string,
  supabase: ReturnType<typeof createClient>
): Promise<unknown> {
  const today = new Date().toISOString().split("T")[0];
  const safeArgs = (args && typeof args === "object") ? args : {};

  switch (name) {
    case "get_nutrition_summary": {
      const date = (safeArgs.date as string) ?? today;
      const { data: logs } = await supabase
        .from("nutrition_logs")
        .select("calories, protein_g, carbs_g, fat_g")
        .eq("user_id", userId)
        .eq("date", date);
      const totals = (logs ?? []).reduce(
        (acc: Record<string, number>, l: Record<string, number>) => ({
          calories: acc.calories + l.calories,
          protein_g: acc.protein_g + l.protein_g,
          carbs_g: acc.carbs_g + l.carbs_g,
          fat_g: acc.fat_g + l.fat_g,
        }),
        { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
      );
      return { date, ...totals, log_count: (logs ?? []).length };
    }
    case "log_food": {
      const date = (safeArgs.date as string) ?? today;
      const calories = toNumber(safeArgs.calories);
      const protein = toNumber(safeArgs.protein_g);
      const carbs = toNumber(safeArgs.carbs_g);
      const fat = toNumber(safeArgs.fat_g);
      const servings = toNumber(safeArgs.servings, 1);
      const { error } = await supabase.from("nutrition_logs").insert({
        user_id: userId,
        food_name: safeArgs.food_name,
        meal_type: safeArgs.meal_type,
        date,
        servings,
        calories,
        protein_g: protein,
        carbs_g: carbs,
        fat_g: fat,
        log_method: "chatbot",
      });
      return error
        ? { error: error.message }
        : {
            success: true,
            message: `Logged ${safeArgs.food_name} (${calories} kcal) to ${safeArgs.meal_type}`,
          };
    }
    case "get_workout_history": {
      const days = toNumber(safeArgs.days, 7);
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data: sessions } = await supabase
        .from("workout_sessions")
        .select("name, started_at, duration_seconds")
        .eq("user_id", userId)
        .gte("started_at", since.toISOString())
        .order("started_at", { ascending: false });
      return { sessions: sessions ?? [] };
    }
    case "get_user_goals": {
      const { data: goal } = await supabase
        .from("user_goals")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true)
        .single();
      return { goal: goal ?? null };
    }
    case "update_goal": {
      const { data: goal, error: goalError } = await supabase
        .from("user_goals")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true)
        .single();

      if (goalError || !goal) {
        return { error: "No active goal found" };
      }

      const updates: Record<string, unknown> = {};

      if (safeArgs.target_weight_kg != null) {
        updates.target_weight_kg = toNumber(safeArgs.target_weight_kg);
      }
      if (safeArgs.goal_type) {
        updates.goal_type = safeArgs.goal_type;
      }
      if (safeArgs.target_calories != null) {
        updates.target_calories = toNumber(safeArgs.target_calories);
      }
      if (safeArgs.target_protein_g != null) {
        updates.target_protein_g = toNumber(safeArgs.target_protein_g);
      }
      if (safeArgs.target_carbs_g != null) {
        updates.target_carbs_g = toNumber(safeArgs.target_carbs_g);
      }
      if (safeArgs.target_fat_g != null) {
        updates.target_fat_g = toNumber(safeArgs.target_fat_g);
      }
      if (safeArgs.weekly_workout_target != null) {
        updates.weekly_workout_target = toNumber(safeArgs.weekly_workout_target);
      }

      if (toBoolean(safeArgs.recalculate_macros)) {
        const [{ data: profile }, { data: latestMetric }] = await Promise.all([
          supabase
            .from("user_profiles")
            .select("height_cm, activity_level")
            .eq("id", userId)
            .single(),
          supabase
            .from("body_metrics")
            .select("weight_kg")
            .eq("user_id", userId)
            .not("weight_kg", "is", null)
            .order("date", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        const weightKg =
          latestMetric?.weight_kg != null
            ? toNumber(latestMetric.weight_kg)
            : updates.target_weight_kg != null
            ? toNumber(updates.target_weight_kg)
            : goal.target_weight_kg != null
            ? toNumber(goal.target_weight_kg)
            : 70;
        const heightCm = profile?.height_cm != null ? toNumber(profile.height_cm) : 170;
        const activityLevel = profile?.activity_level ?? "moderately_active";
        const goalType = (updates.goal_type as string) ?? goal.goal_type ?? "maintenance";

        const targets = calculateGoalTargets(weightKg, heightCm, activityLevel, goalType);
        Object.assign(updates, {
          target_calories: targets.target_calories,
          target_protein_g: targets.target_protein_g,
          target_carbs_g: targets.target_carbs_g,
          target_fat_g: targets.target_fat_g,
        });
        if (updates.target_weight_kg == null) {
          updates.target_weight_kg = targets.target_weight_kg;
        }
      }

      if (Object.keys(updates).length === 0) {
        return { error: "No goal fields provided to update" };
      }

      const { data: updated, error } = await supabase
        .from("user_goals")
        .update(updates)
        .eq("id", goal.id)
        .select()
        .single();

      return error
        ? { error: error.message }
        : {
            success: true,
            goal: updated,
            message: updates.target_weight_kg != null
              ? `Updated goal target weight to ${updates.target_weight_kg} kg`
              : "Updated fitness goals",
          };
    }
    case "update_profile": {
      const updates: Record<string, unknown> = {};

      if (safeArgs.height_cm != null) {
        updates.height_cm = toNumber(safeArgs.height_cm);
      }
      if (safeArgs.activity_level) {
        updates.activity_level = safeArgs.activity_level;
      }
      if (safeArgs.display_name) {
        updates.display_name = String(safeArgs.display_name).trim();
      }
      if (safeArgs.sex) {
        updates.sex = safeArgs.sex;
      }

      if (Object.keys(updates).length === 0) {
        return { error: "No profile fields provided to update" };
      }

      updates.updated_at = new Date().toISOString();

      const { data: updated, error } = await supabase
        .from("user_profiles")
        .update(updates)
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        return { error: error.message };
      }

      const profileChangedForMacros =
        updates.height_cm != null || updates.activity_level != null;
      const shouldRecalc =
        profileChangedForMacros || toBoolean(safeArgs.recalculate_macros);

      if (shouldRecalc) {
        const [{ data: goal }, { data: latestMetric }] = await Promise.all([
          supabase
            .from("user_goals")
            .select("*")
            .eq("user_id", userId)
            .eq("is_active", true)
            .maybeSingle(),
          supabase
            .from("body_metrics")
            .select("weight_kg")
            .eq("user_id", userId)
            .not("weight_kg", "is", null)
            .order("date", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        if (goal) {
          const weightKg =
            latestMetric?.weight_kg != null
              ? toNumber(latestMetric.weight_kg)
              : goal.target_weight_kg != null
              ? toNumber(goal.target_weight_kg)
              : 70;
          const heightCm =
            updates.height_cm != null
              ? toNumber(updates.height_cm)
              : updated?.height_cm != null
              ? toNumber(updated.height_cm)
              : 170;
          const activityLevel =
            (updates.activity_level as string) ??
            updated?.activity_level ??
            "moderately_active";
          const goalType = goal.goal_type ?? "maintenance";
          const targets = calculateGoalTargets(
            weightKg,
            heightCm,
            activityLevel,
            goalType
          );

          await supabase
            .from("user_goals")
            .update({
              target_calories: targets.target_calories,
              target_protein_g: targets.target_protein_g,
              target_carbs_g: targets.target_carbs_g,
              target_fat_g: targets.target_fat_g,
            })
            .eq("id", goal.id);
        }
      }

      const parts: string[] = [];
      if (updates.height_cm != null) {
        parts.push(`height to ${updates.height_cm} cm`);
      }
      if (updates.activity_level) {
        parts.push(`activity level to ${updates.activity_level}`);
      }
      if (updates.display_name) {
        parts.push(`name to ${updates.display_name}`);
      }
      if (updates.sex) {
        parts.push(`sex to ${updates.sex}`);
      }

      return {
        success: true,
        profile: updated,
        message: `Updated ${parts.join(", ")}`,
      };
    }
    case "log_body_metric": {
      const date = (safeArgs.date as string) ?? today;
      const weightKg = toNumber(safeArgs.weight_kg);
      const { error } = await supabase
        .from("body_metrics")
        .upsert({ user_id: userId, date, weight_kg: weightKg }, { onConflict: "user_id,date" });
      return error
        ? { error: error.message }
        : {
            success: true,
            current_weight_kg: weightKg,
            date,
            message: `Logged current weight: ${weightKg} kg`,
          };
    }
    case "get_progress_summary": {
      const days = toNumber(safeArgs.days, 30);
      const since = new Date();
      since.setDate(since.getDate() - days);
      const [{ data: metrics }, { data: sessions }] = await Promise.all([
        supabase
          .from("body_metrics")
          .select("date, weight_kg")
          .eq("user_id", userId)
          .gte("date", since.toISOString().split("T")[0])
          .order("date"),
        supabase
          .from("workout_sessions")
          .select("started_at")
          .eq("user_id", userId)
          .gte("started_at", since.toISOString()),
      ]);
      return { weight_entries: metrics ?? [], workout_count: (sessions ?? []).length, timeframe_days: days };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Context loader ───────────────────────────────────────────────────────────

async function loadUserContext(userId: string, supabase: ReturnType<typeof createClient>): Promise<string> {
  const today = new Date().toISOString().split("T")[0];
  const [{ data: profile }, { data: goal }, { data: todayLogs }, { data: streaks }, { data: latestMetric }] =
    await Promise.all([
      supabase.from("user_profiles").select("display_name, height_cm, sex, activity_level").eq("id", userId).single(),
      supabase.from("user_goals").select("*").eq("user_id", userId).eq("is_active", true).single(),
      supabase.from("nutrition_logs").select("calories, protein_g").eq("user_id", userId).eq("date", today),
      supabase.from("user_streaks").select("streak_type, current_streak").eq("user_id", userId),
      supabase
        .from("body_metrics")
        .select("date, weight_kg")
        .eq("user_id", userId)
        .not("weight_kg", "is", null)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  const totals = (todayLogs ?? []).reduce(
    (acc: Record<string, number>, l: Record<string, number>) => ({
      calories: acc.calories + l.calories,
      protein_g: acc.protein_g + l.protein_g,
    }),
    { calories: 0, protein_g: 0 }
  );
  const loggingStreak =
    (streaks ?? []).find((s: { streak_type: string }) => s.streak_type === "logging")?.current_streak ?? 0;
  const currentWeight =
    latestMetric?.weight_kg != null
      ? `${latestMetric.weight_kg} kg (${latestMetric.date})`
      : "not logged";
  return `## User\nName: ${profile?.display_name ?? "User"} | Height: ${profile?.height_cm ?? "?"}cm | Activity: ${profile?.activity_level ?? "?"}\n\n## Goals (targets to reach)\nType: ${goal?.goal_type ?? "not set"} | Goal weight: ${goal?.target_weight_kg ?? "?"} kg | Calories: ${goal?.target_calories ?? "?"} kcal | Protein: ${goal?.target_protein_g ?? "?"}g\n\n## Current weight (latest weigh-in)\n${currentWeight}\n\n## Today (${today})\nCalories logged: ${Math.round(totals.calories)} / ${goal?.target_calories ?? "?"} | Protein: ${Math.round(totals.protein_g)}g\n\n## Streak\nLogging: ${loggingStreak} days`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401 });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const {
      data: { user },
      error: authError,
    } = await createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    }).auth.getUser();
    if (authError || !user) return new Response("Unauthorized", { status: 401 });

    const limitError = await assertChatAllowed(supabase, user.id);
    if (limitError) {
      return new Response(JSON.stringify({ error: limitError, code: "LIMIT_REACHED" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { conversation_id, message } = await req.json();
    if (!conversation_id || !message?.trim()) {
      return new Response(JSON.stringify({ error: "conversation_id and message required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: conversation, error: convError } = await supabase
      .from("chat_conversations")
      .select("id, user_id")
      .eq("id", conversation_id)
      .single();

    if (convError || !conversation || conversation.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await recordAiUsage(supabase, user.id, "ai_chat");

    const [userContext, { data: history }] = await Promise.all([
      loadUserContext(user.id, supabase),
      supabase
        .from("chat_messages")
        .select("role, content")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: true })
        .limit(20),
    ]);

    const systemPrompt = `You are a personal fitness coach inside Plates & Reps. You have full access to the user's data and can take actions on their behalf.\n\n${userContext}\n\n## Weight rules (IMPORTANT)\n- **Goal weight** (target they want to reach): use update_goal with target_weight_kg. Phrases: "goal weight", "target weight", "weight goal", "want to weigh X".\n- **Current weight** (today's weigh-in on Progress): use log_body_metric with weight_kg. Phrases: "I weigh X", "log my weight", "weighed myself".\n- Never use log_body_metric when the user wants to change their goal/target weight.\n\n## Profile rules\n- **Height**: use update_profile with height_cm (centimeters). Phrases: "change my height", "I'm 180 cm tall", "update height to X".\n- **Activity level**: use update_profile with activity_level.\n- Height and activity changes automatically recalculate calorie/macro targets.\n\nBe concise, warm, and motivating. Confirm actions you take. Use metric units.`;

    await supabase.from("chat_messages").insert({ conversation_id, role: "user", content: message });

    const messages: OpenAIMessage[] = [
      { role: "system", content: systemPrompt },
    ];
    for (const h of history ?? []) {
      if ((h.role === "user" || h.role === "assistant") && h.content) {
        messages.push({ role: h.role as "user" | "assistant", content: h.content });
      }
    }
    messages.push({ role: "user", content: message });

    let finalText = "";
    const actionSummaries: string[] = [];
    for (let i = 0; i < 6; i++) {
      const groqRes = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages,
          tools,
          tool_choice: "auto",
          temperature: 0.2,
        }),
      });

      if (!groqRes.ok) {
        const details = await groqRes.text();
        finalText = `Groq API error (${groqRes.status}).\n\n${details}`;
        break;
      }

      const data = await groqRes.json();
      const msg = data?.choices?.[0]?.message;
      const toolCalls = msg?.tool_calls as Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> | undefined;

      if (!toolCalls || toolCalls.length === 0) {
        finalText = msg?.content ?? "No response.";
        break;
      }

      messages.push({
        role: "assistant",
        content: msg?.content ?? "",
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(call.function.arguments || "{}");
          args = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
        } catch {
          args = {};
        }
        const validationError = validateToolArgs(call.function.name, args);
        const result = validationError
          ? { error: validationError }
          : await executeTool(call.function.name, args, user.id, supabase);

        if (
          result &&
          typeof result === "object" &&
          "success" in result &&
          (result as { success?: boolean }).success &&
          "message" in result &&
          typeof (result as { message?: string }).message === "string"
        ) {
          actionSummaries.push((result as { message: string }).message);
        }

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    if (!finalText) {
      finalText = "I couldn't finish processing that request. Please try again.";
    }

    if (actionSummaries.length > 0) {
      const summaryBlock = actionSummaries.map((s) => `✓ ${s}`).join("\n");
      finalText = `${summaryBlock}\n\n${finalText}`;
    }

    // Persist and stream response back in OpenAI-compatible SSE format
    await Promise.all([
      supabase.from("chat_messages").insert({ conversation_id, role: "assistant", content: finalText }),
      supabase.from("chat_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation_id),
    ]);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Emit in word-sized chunks to simulate streaming
        const words = finalText.split(/(\s+)/);
        for (const word of words) {
          if (!word) continue;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: word } }] })}\n\n`)
          );
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
