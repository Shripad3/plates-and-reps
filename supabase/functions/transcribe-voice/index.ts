import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { respond500 } from "../_shared/validation.ts";
import { assertVoiceLogAllowed } from "../_shared/usageLimits.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const GROQ_AUDIO_MODEL =
  Deno.env.get("GROQ_TRANSCRIBE_MODEL") ?? "whisper-large-v3-turbo";
const GROQ_TEXT_MODEL =
  Deno.env.get("GROQ_TEXT_MODEL") ?? "llama-3.3-70b-versatile";
const GROQ_AUDIO_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

interface ParsedFoodItem {
  food_name: string;
  quantity: number;
  unit: string;
  meal_type: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack"]);

function normalizeItem(raw: Record<string, unknown>): ParsedFoodItem | null {
  const food_name = typeof raw.food_name === "string" ? raw.food_name.trim() : "";
  if (!food_name) return null;

  const meal_type = typeof raw.meal_type === "string" ? raw.meal_type : "snack";
  const quantity = Math.max(toNumber(raw.quantity, 1), 0.25);

  return {
    food_name,
    quantity,
    unit: typeof raw.unit === "string" ? raw.unit : "serving",
    meal_type: MEAL_TYPES.has(meal_type) ? meal_type : "snack",
    calories: Math.max(0, toNumber(raw.calories)),
    protein_g: Math.max(0, toNumber(raw.protein_g)),
    carbs_g: Math.max(0, toNumber(raw.carbs_g)),
    fat_g: Math.max(0, toNumber(raw.fat_g)),
  };
}

interface GroqAudioResult {
  transcript: string;
  items: ParsedFoodItem[];
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

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const limitError = await assertVoiceLogAllowed(admin, user.id);
    if (limitError) {
      return new Response(JSON.stringify({ error: limitError, code: "LIMIT_REACHED" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return new Response(JSON.stringify({ error: "audio file required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reject files larger than Groq's 25MB limit before uploading
    const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
    if (audioFile.size > MAX_AUDIO_BYTES) {
      return new Response(JSON.stringify({ error: "Audio file too large (max 25MB)" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const form = new FormData();
    form.append("model", GROQ_AUDIO_MODEL);
    form.append("file", audioFile, audioFile.name || "voice.m4a");
    form.append("response_format", "verbose_json");

    const transcribeRes = await fetch(GROQ_AUDIO_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: form,
    });

    if (!transcribeRes.ok) throw new Error(`Groq transcription error: ${await transcribeRes.text()}`);
    const transcriptionData = await transcribeRes.json();
    const transcript: string = transcriptionData?.text ?? "";

    // Second pass: extract structured food items from transcript.
    const parseRes = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_TEXT_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You extract food items from transcripts. Return strict JSON only, no markdown, no prose.",
          },
          {
            role: "user",
            content: `Transcript:
${transcript}

Task:
Extract food items mentioned.

Return ONLY a valid JSON object with no extra text or markdown:
{"transcript": "...", "items": [{"food_name": "...", "quantity": 1, "unit": "serving", "meal_type": "snack", "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}]}

Rules:
- meal_type must be one of: breakfast, lunch, dinner, snack
- calories, protein_g, carbs_g, fat_g are TOTALS for the quantity mentioned (e.g. 2 eggs → sum both eggs)
- Use conservative, realistic estimates when exact nutrition is unknown
- If no food items are mentioned, use an empty items array`,
          },
        ],
        temperature: 0.1,
        max_tokens: 400,
      }),
    });

    if (!parseRes.ok) throw new Error(`Groq parsing error: ${await parseRes.text()}`);

    const parseData = await parseRes.json();
    const rawText: string = parseData?.choices?.[0]?.message?.content ?? "{}";

    // Extract JSON object — strip any markdown fences if present
    const match = rawText.match(/\{[\s\S]*\}/);
    let result: GroqAudioResult = { transcript, items: [] };
    try {
      const parsed = JSON.parse(match?.[0] ?? "{}") as Partial<GroqAudioResult>;
      const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
      result = {
        transcript: typeof parsed.transcript === "string" ? parsed.transcript : transcript,
        items: rawItems
          .map((item) =>
            item && typeof item === "object"
              ? normalizeItem(item as Record<string, unknown>)
              : null
          )
          .filter((item): item is ParsedFoodItem => item !== null),
      };
    } catch {
      result = { transcript, items: [] };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return respond500(err, "transcribe-voice");
  }
});
