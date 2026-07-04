import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { assertPhotoAnalysisAllowed, recordAiUsage } from "../_shared/usageLimits.ts";
import { validateImageUrl, respond400 } from "../_shared/validation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const GROQ_MODEL =
  Deno.env.get("GROQ_VISION_MODEL") ?? "meta-llama/llama-4-scout-17b-16e-instruct";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

interface FoodItem {
  name: string;
  portion_description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/** Convert ArrayBuffer to base64 safely for large files */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
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
    const limitError = await assertPhotoAnalysisAllowed(admin, user.id);
    if (limitError) {
      return new Response(JSON.stringify({ error: limitError, code: "LIMIT_REACHED" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await recordAiUsage(admin, user.id, "photo_analysis");

    const body = await req.json().catch(() => ({}));
    const { image_url } = body;

    const urlError = validateImageUrl(image_url);
    if (urlError) return respond400(urlError);

    // Fetch image and encode as data URL for Groq image input
    const imgRes = await fetch(image_url as string);
    if (!imgRes.ok) throw new Error("Failed to fetch image");
    const imgBuffer = await imgRes.arrayBuffer();
    const base64Data = toBase64(imgBuffer);
    const mimeType = imgRes.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a nutrition assistant. Return strict JSON only, no markdown, no prose.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Identify all food items visible in this image. For each item estimate the nutritional content.
Return ONLY a valid JSON array with no extra text or markdown:
[{"name": "...", "portion_description": "e.g. 1 cup, 200g", "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}]
Be conservative with portion estimates. If you cannot identify food items, return an empty array [].`,
              },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 600,
      }),
    });

    if (!response.ok) throw new Error(`Groq error: ${await response.text()}`);

    const data = await response.json();
    const rawText: string = data.choices?.[0]?.message?.content ?? "[]";

    // Extract JSON array — Gemini sometimes wraps it in markdown code fences
    const match = rawText.match(/\[[\s\S]*\]/);
    let items: FoodItem[] = [];
    try {
      items = JSON.parse(match?.[0] ?? "[]");
    } catch {
      items = [];
    }

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
