/**
 * Shared HTML/XSS utilities used by MLB GameRank and NBA Now renderers.
 */

const ESC_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape a value for safe HTML insertion. */
export function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => ESC_MAP[c] ?? c);
}

/** Sanitise a URL — only allow http(s) protocol. */
export function escUrl(u: string): string {
  try {
    const p = new URL(u);
    return ["http:", "https:"].includes(p.protocol) ? p.href : "";
  } catch {
    return "";
  }
}
