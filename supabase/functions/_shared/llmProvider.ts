// Thin, provider-agnostic adapter over OpenAI-compatible chat-completions APIs.
// Groq, Together, Fireworks and DeepSeek all speak this protocol, so failing
// over to another open-weight host is a config change, not a code rewrite.
//
// Selection: env LLM_PROVIDER (default "groq"). Each provider reads its own key
// env var. Nothing here is client-visible — this runs only in edge functions.

interface ProviderConfig {
  baseUrl: string;
  keyEnv: string;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", keyEnv: "GROQ_API_KEY" },
  together: { baseUrl: "https://api.together.xyz/v1", keyEnv: "TOGETHER_API_KEY" },
  fireworks: { baseUrl: "https://api.fireworks.ai/inference/v1", keyEnv: "FIREWORKS_API_KEY" },
  deepseek: { baseUrl: "https://api.deepseek.com/v1", keyEnv: "DEEPSEEK_API_KEY" },
};

export type ChatRole = "system" | "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Ask the provider for strict JSON output. */
  json?: boolean;
  /** Retries on 429 / 5xx (default 4). */
  maxRetries?: number;
}

export class LlmError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "LlmError";
  }
}

function resolveProvider(): ProviderConfig & { apiKey: string } {
  const name = (Deno.env.get("LLM_PROVIDER") ?? "groq").toLowerCase();
  const cfg = PROVIDERS[name];
  if (!cfg) throw new LlmError(`Unknown LLM_PROVIDER "${name}"`);
  const apiKey = Deno.env.get(cfg.keyEnv);
  if (!apiKey) throw new LlmError(`Missing ${cfg.keyEnv} for provider "${name}"`);
  return { ...cfg, apiKey };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Returns the assistant message text. Throws LlmError on unrecoverable failure. */
export async function chatCompletion(opts: ChatCompletionOptions): Promise<string> {
  const provider = resolveProvider();
  const maxRetries = opts.maxRetries ?? 4;

  const body = JSON.stringify({
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 4000,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  });

  let lastError: LlmError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body,
      });
    } catch (err) {
      lastError = new LlmError(`Network error: ${(err as Error).message}`);
      await sleep(Math.min(2 ** attempt * 500, 8000));
      continue;
    }

    if (res.ok) {
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new LlmError("Empty completion from provider");
      }
      return content;
    }

    // Retry on rate-limit and transient server errors, honoring Retry-After.
    if (res.status === 429 || res.status >= 500) {
      lastError = new LlmError(`Provider ${res.status}`, res.status);
      if (attempt < maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(2 ** attempt * 500, 8000);
        await sleep(waitMs);
        continue;
      }
    }

    // Non-retryable (4xx other than 429) — fail fast.
    const detail = await res.text().catch(() => "");
    throw new LlmError(`Provider error ${res.status}: ${detail.slice(0, 300)}`, res.status);
  }

  throw lastError ?? new LlmError("LLM request failed after retries");
}
