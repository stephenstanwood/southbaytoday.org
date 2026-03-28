/** Centralized Claude model ID constants */

export const CLAUDE_SONNET = "claude-sonnet-4-6";
export const CLAUDE_HAIKU = "claude-haiku-4-5-20251001";

/** Extract trimmed text from the first content block of a Claude response. */
export function extractText(content: Array<{ type: string; text?: string }>): string {
  const block = content[0];
  return block?.type === "text" ? (block.text ?? "").trim() : "";
}

/** Strip markdown code fences (```json ... ``` or ``` ... ```) from a string. */
export function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}
