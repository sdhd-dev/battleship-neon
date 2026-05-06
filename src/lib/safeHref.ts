// Sanitize a user-supplied URL before using it as `href`.
// Only http(s) and relative paths are allowed; javascript:, data:, vbscript:,
// file: and any other scheme is rejected and replaced with "#".
//
// React already escapes attribute values, so this is the layer that stops
// `javascript:alert(1)` style payloads coming out of user-submitted fields
// (viral claim post URLs, future user-supplied links).

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

const CONTROL_CHARS = /[\x00-\x1f]/;

export function safeHref(raw: string | null | undefined): string {
  if (!raw) return "#";
  const trimmed = String(raw).trim();
  if (!trimmed) return "#";
  // Allow same-origin relative paths.
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  // Reject control characters that browsers may interpret leniently in
  // protocol parsing (e.g. "java\tscript:...").
  if (CONTROL_CHARS.test(trimmed)) return "#";
  try {
    const url = new URL(trimmed, "http://placeholder.invalid/");
    if (!SAFE_PROTOCOLS.has(url.protocol)) return "#";
    return url.toString();
  } catch {
    return "#";
  }
}
