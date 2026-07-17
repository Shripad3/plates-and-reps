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

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Content-based image check (magic bytes) — never trust a declared MIME type
 * or a file extension.
 */
export function isImageBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  // GIF8
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return true;
  // WEBP: "RIFF"...."WEBP"
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return true;
  return false;
}

/** Decode the first N bytes of a base64 payload (for magic-byte sniffing). */
export function base64Prefix(b64: string, n = 16): Uint8Array {
  try {
    const bin = atob(b64.slice(0, Math.ceil(n / 3) * 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}

/**
 * Validates an image input. Accepts either:
 *  - `data:image/*;base64,...` — what the app actually sends. No network fetch,
 *    so no SSRF surface; size-capped and verified by magic bytes.
 *  - `https://...` — fetched server-side, so private/internal hosts are blocked.
 * Returns an error string if invalid, or null if safe.
 */
export function validateImageUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) return "image_url is required";

  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    if (comma < 0 || !/^data:image\/(png|jpe?g|webp|gif);base64$/i.test(url.slice(5, comma))) {
      return "image_url must be a base64-encoded image";
    }
    const b64 = url.slice(comma + 1);
    if (!b64) return "image_url is empty";
    if ((b64.length * 3) / 4 > MAX_IMAGE_BYTES) return "image is too large (max 10MB)";
    if (!isImageBytes(base64Prefix(b64))) return "image_url is not a valid image";
    return null;
  }

  if (!url.startsWith("https://")) return "image_url must use HTTPS or be a data URL";

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

/**
 * Standardized 500. The real error (DB errors, provider bodies, stack) goes to
 * the server log only; the client gets a generic message. Never return
 * `(err as Error).message` to a caller — it leaks internals.
 */
export function respond500(err: unknown, scope: string): Response {
  console.error(`[${scope}]`, err);
  return new Response(
    JSON.stringify({ error: "Something went wrong. Please try again." }),
    {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}
