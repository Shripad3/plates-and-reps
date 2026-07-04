import { corsHeaders } from "./cors.ts";

// Private/internal IP ranges that must not be fetched (SSRF protection)
const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./, // link-local
  /^::1$/,       // IPv6 loopback
  /^fc00:/i,     // IPv6 unique local
  /^fe80:/i,     // IPv6 link-local
  /^0\.0\.0\.0$/,
];

/**
 * Validates that a URL is safe to fetch from a server context.
 * Returns an error string if invalid, or null if safe.
 */
export function validateImageUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) return "image_url is required";
  if (!url.startsWith("https://")) return "image_url must use HTTPS";

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "image_url is not a valid URL";
  }

  const hostname = parsed.hostname.toLowerCase();
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) return "image_url points to a disallowed address";
  }

  return null;
}

/**
 * Validates a string field for presence, type, and maximum length.
 * Returns an error string if invalid, or null if valid.
 */
export function validateStringField(
  value: unknown,
  maxLength: number,
  name: string
): string | null {
  if (typeof value !== "string") return `${name} must be a string`;
  if (!value.trim()) return `${name} is required`;
  if (value.length > maxLength) return `${name} must be ${maxLength} characters or fewer`;
  return null;
}

/** Standardized 429 response with Retry-After header. */
export function respond429(message: string): Response {
  return new Response(
    JSON.stringify({ error: message, code: "RATE_LIMITED" }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": "60",
      },
    }
  );
}

/** Standardized 400 response. */
export function respond400(message: string): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}
