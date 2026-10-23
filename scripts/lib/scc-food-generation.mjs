import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const DAY = 86_400_000;
const MAX_ITEMS = 12;
const TOKEN_BUDGETS = [3072, 4608];
const BLURB_SCHEMA = {
  type: "object",
  properties: {
    blurbs: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, blurb: { type: ["string", "null"] } },
        required: ["id", "blurb"],
        additionalProperties: false,
      },
    },
  },
  required: ["blurbs"],
  additionalProperties: false,
};

/** Keep rejected response bytes outside Git; daily refresh logs retain the path. */
function recordBlurbDiagnostic(diagnostic) {
  let file = null;
  try {
    const directory = join(homedir(), ".local/state/sbt-food-openings/blurb-diagnostics");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    file = join(directory, `${Date.now()}-${randomUUID()}.json`);
    writeFileSync(file, JSON.stringify(diagnostic, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  } catch (error) {
    console.warn(`[food-blurbs] Could not retain diagnostic: ${error.message}`);
  }
  console.log(`[food-blurbs] ${diagnostic.label}: attempt=${diagnostic.attempt}`
    + ` stop_reason=${diagnostic.stopReason ?? "unavailable"}`
    + ` output_tokens=${diagnostic.usage?.output_tokens ?? "unavailable"}`
    + ` accepted=${diagnostic.accepted}/${diagnostic.requested}`
    + (diagnostic.error ? ` error=${diagnostic.error}` : "")
    + (file ? ` diagnostic=${file}` : ""));
}

/**
 * At most two bounded requests for the published 12-item slice. Structured
 * output can still truncate: never parse a non-end_turn response or salvage
 * unfinished JSON. Retain good rows across a retry; unknown/duplicate IDs and
 * invalid values cannot attach a blurb to the wrong business.
 */
export async function generateFoodBlurbMap({ items, prompt, label, createMessage,
  onDiagnostic = recordBlurbDiagnostic }) {
  if (!items.length) return {};
  const ids = new Set(items.map((item) => item.id));
  if (items.length > MAX_ITEMS || ids.size !== items.length
    || items.some((item) => typeof item.id !== "string" || !item.id)) {
    throw new Error("Food blurbs require at most 12 unique source IDs");
  }
  const accepted = new Map();
  for (const [index, maxTokens] of TOKEN_BUDGETS.entries()) {
    let response, error = null;
    const rejected = [];
    try {
      response = await createMessage({
        model: "claude-sonnet-5-5",
        max_tokens: maxTokens,
        output_config: { effort: "low", format: { type: "json_schema", schema: BLURB_SCHEMA } },
        messages: [{ role: "user", content: prompt }],
      });
      if (response.stop_reason !== "end_turn") {
        throw new Error(`Incomplete response (${response.stop_reason ?? "missing stop_reason"})`);
      }
      const text = response.content.filter((block) => block?.type === "text").map((block) => block.text).join("");
      const parsed = JSON.parse(text);
      if (!parsed || Object.keys(parsed).length !== 1 || !Array.isArray(parsed.blurbs)) {
        throw new Error("Expected a structured blurbs array");
      }
      const counts = new Map();
      for (const row of parsed.blurbs) counts.set(row?.id, (counts.get(row?.id) ?? 0) + 1);
      for (const row of parsed.blurbs) {
        const valid = row && Object.keys(row).length === 2 && ids.has(row.id) && counts.get(row.id) === 1
          && (row.blurb === null || (typeof row.blurb === "string" && row.blurb.trim().length > 0
            && row.blurb.length <= 200 && row.blurb.trim().split(/\s+/).length <= 12));
        if (!valid) { rejected.push(row?.id ?? null); continue; }
        if (!accepted.has(row.id)) accepted.set(row.id, typeof row.blurb === "string" ? row.blurb.trim() : null);
      }
      if (accepted.size !== ids.size || rejected.length) error = "Missing or invalid blurb rows";
    } catch (failure) {
      error = failure.message;
      // Authentication and refusals need an operator/source change, not a retry.
      if ([400, 401, 403, 404].includes(failure.status)) rejected.push("non-retryable-request");
    }
    onDiagnostic({
      observedAt: new Date().toISOString(), label, attempt: index + 1, maxTokens,
      requested: items.length, accepted: accepted.size, rejected, error,
      stopReason: response?.stop_reason ?? null, usage: response?.usage ?? null,
      requestId: response?._request_id ?? response?.id ?? null,
      ...(error && response ? { response } : {}),
    });
    if (!error || response?.stop_reason === "refusal" || rejected.includes("non-retryable-request")) break;
  }
  return Object.fromEntries(accepted);
}

/** A successful empty/quiet restaurant subset says nothing about source age. */
export function assessFoodSourceFreshness({ updatedAt, rawInspections = [], inspections = [],
  now = Date.now(), thresholdDays = 14 }) {
  const timestamp = Date.parse(updatedAt);
  const known = Number.isFinite(timestamp) && timestamp <= now + 60_000;
  const ageDays = known ? Math.floor(Math.max(0, now - timestamp) / DAY) : null;
  const newest = (rows, field) => rows.map((row) => row[field]?.slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date ?? "")).sort().at(-1) ?? null;
  const newestRawInspection = newest(rawInspections, "final_inspection");
  const newestEligibleInspection = newest(inspections, "inspectionDate");
  return {
    status: !known ? "unknown" : now - timestamp > thresholdDays * DAY ? "stale" : "current",
    checkedAt: new Date(now).toISOString(),
    updatedAt: known ? new Date(timestamp).toISOString() : null,
    ageDays, newestRawInspection, newestEligibleInspection,
    eligibleStatus: !newestEligibleInspection ? "empty"
      : now - Date.parse(`${newestEligibleInspection}T00:00:00Z`) > thresholdDays * DAY ? "quiet" : "recent",
  };
}

/** Preserve the last valid artifact on failed HTTP, timeout, JSON or shape checks. */
export async function fetchSccFoodPage(url, { fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json", "User-Agent": "southbaytoday.org/data-pipeline" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Expected a county records array");
    return {
      rows,
      updatedAt: response.headers.get("x-soda2-truth-last-modified") ?? response.headers.get("last-modified"),
    };
  } catch (cause) {
    const error = new Error(`SCC source request failed: ${cause.message}`, { cause });
    error.code = "SCC_SOURCE_REQUEST_FAILED";
    throw error;
  }
}

export function isNeutralInspectionBlurb(blurb) {
  return typeof blurb === "string" && !/\b(?:new|open(?:ed|ing|s)?|recently|now\s+(?:operating|serving))\b/i.test(blurb);
}

/** Check the type description before its location/status phrase against the
 * actual permit name. Familiar brands still do not supply menu/type evidence.
 * Uncertain descriptions use the same null fallback as a city mismatch.
 */
export function hasSourceBackedFoodType(blurb, businessName) {
  if (typeof blurb !== "string") return false;
  const words = value => String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().match(/[a-z0-9]+/g)?.map(word => word.length > 3 ? word.replace(/s$/, "") : word) ?? [];
  const allowed = new Set([...words(businessName), "food", "busines", "a", "an", "the", "and", "shop", "focused", "themed", "related"]);
  if (allowed.has("juice")) allowed.add("bar");
  const description = blurb.replace(/^(?:planned|coming soon)\s+/i, "")
    .split(/\b(?:on|at|in|planned|opening|coming)\b/i)[0];
  return words(description).every(word => allowed.has(word));
}
