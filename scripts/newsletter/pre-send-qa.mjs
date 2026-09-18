// ---------------------------------------------------------------------------
// Pre-send newsletter QA
// ---------------------------------------------------------------------------
// This is the check that used to run in /messages after the letter landed:
// proofread the assembled issue, verify every listed event against its
// current first-party page, and confirm recommended venues are open today.
// It now runs at the end of send.mjs, so today's email can still be cut or
// rewritten. Already-sent archives stay immutable because they are not sent
// yet when this runs.
//
// Fail-open for the send: a QA timeout or network miss never blocks the email.
// Fail-closed for one item only when first-party evidence contradicts it.
// A fetch failure keeps the item (same as registration-recheck).
//
// This job does not dirty the preflight-bound checkout. Confirmed source
// problems are filed as dataDefects for the 2pm digest / later repair.
// ---------------------------------------------------------------------------

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { callClaude, CLAUDE_SONNET } from "../lib/claude.mjs";
import { UA } from "../lib/http.mjs";
import { DATA_DIR } from "../lib/paths.mjs";
import { hoursStatusOnDate } from "../../src/lib/south-bay/mealService.mjs";
import { isPlaceTemporarilyUnavailable } from "../../src/lib/south-bay/placeAvailability.mjs";
import { recordNewsletterQaDefects, repairNewsletterEventFacts } from "./lib.mjs";

const DEFAULT_FETCH_TIMEOUT_MS = 8_000;
const DEFAULT_EXCERPT_CHARS = 4_000;
const EDITORIAL_KEYS = [
  "briefing",
  "dayPlanHeadline",
  "eventsNote",
  "openingsNote",
  "conversationNote",
];

// Same tight body patterns as generate-events.mjs `looksCancelled`. Do not
// import that file from the send path — it is the nightly generator.
const CANCELLED_BODY_PATTERNS = [
  /\bevent (?:has been|is|was) cancell?ed\b/i,
  /\bhas had to cancel (?:your |the |this )?event\b/i,
  /\bthis (?:show|performance) (?:has been|is) cancell?ed\b/i,
  /\bcancell?ed[;.]\s+refunds? (?:will be|are being)\s+issued\b/i,
  /\bcancell?ed\s+(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d)/i,
  /\bthere will be no\b.{0,80}\b(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d)/i,
];

const VENUE_CLOSED_PATTERNS = [
  /\b(?:closed today|closed for (?:the day|today|the holiday)|not open today)\b/i,
  /\bgalleries are closed\b/i,
  /\btemporarily closed\b/i,
];

export function qaEnabled(opts = {}) {
  if (typeof opts.enabled === "boolean") return opts.enabled;
  const value = String(process.env.SBT_NEWSLETTER_PRE_SEND_QA || "1").toLowerCase();
  return !["0", "false", "off", "no"].includes(value);
}

export function stripHtmlExcerpt(html, maxChars = DEFAULT_EXCERPT_CHARS) {
  const text = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, maxChars);
}

export function pageLooksCancelled(text) {
  return CANCELLED_BODY_PATTERNS.some((pattern) => pattern.test(String(text || "")));
}

export function pageLooksVenueClosed(text) {
  return VENUE_CLOSED_PATTERNS.some((pattern) => pattern.test(String(text || "")));
}

export function itemKey(item) {
  return String(item?.id || item?.permitId || item?.name || item?.title || "").trim();
}

export function placeIdFromCard(card) {
  const raw = String(card?.id || "").trim();
  return raw.startsWith("place:") ? raw.slice("place:".length) : "";
}

let placesByIdCache = null;
export function loadPlacesById(readFile = readFileSync) {
  if (placesByIdCache) return placesByIdCache;
  try {
    const data = JSON.parse(readFile(join(DATA_DIR, "places.json"), "utf8"));
    placesByIdCache = new Map(
      (data.places || []).filter((place) => place?.id).map((place) => [place.id, place]),
    );
  } catch {
    placesByIdCache = new Map();
  }
  return placesByIdCache;
}

export function resetPlacesByIdCache() {
  placesByIdCache = null;
}

function orderedCards(plan) {
  return Array.isArray(plan?.cards) ? plan.cards : [];
}

export function collectQaTargets(data) {
  const events = [];
  const seenEvents = new Set();
  for (const event of [data?.tonightPick, ...(data?.featuredEvents || [])].filter(Boolean)) {
    const key = itemKey(event);
    if (!key || seenEvents.has(key)) continue;
    seenEvents.add(key);
    events.push(event);
  }

  const cards = orderedCards(data?.dayPlan);
  const openings = Array.isArray(data?.recentOpenings) ? data.recentOpenings : [];

  return {
    date: data?.date || "",
    tonightPick: data?.tonightPick || null,
    events,
    cards,
    openings,
  };
}

export function emptyVerdict() {
  return {
    dropEventIds: [],
    dropOpeningIds: [],
    dropDayPlan: false,
    dropTonightPick: false,
    blankEditorialKeys: [],
    blurbOverrides: {},
    titleOverrides: {},
    dataDefects: [],
    findings: [],
  };
}

function asStringArray(value) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

export function parseQaVerdict(raw) {
  const cleaned = String(raw || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) parsed = JSON.parse(cleaned.slice(start, end + 1));
    else throw new Error(`newsletter QA returned non-JSON: ${cleaned.slice(0, 300)}`);
  }
  if (!parsed || typeof parsed !== "object") throw new Error("newsletter QA returned a non-object");

  const blurbOverrides = parsed.blurbOverrides && typeof parsed.blurbOverrides === "object"
    ? Object.fromEntries(
      Object.entries(parsed.blurbOverrides)
        .map(([key, value]) => [String(key), String(value || "").trim()])
        .filter(([, value]) => value),
    )
    : {};
  const titleOverrides = parsed.titleOverrides && typeof parsed.titleOverrides === "object"
    ? Object.fromEntries(
      Object.entries(parsed.titleOverrides)
        .map(([key, value]) => [String(key), String(value || "").trim()])
        .filter(([, value]) => value),
    )
    : {};
  const dataDefects = (Array.isArray(parsed.dataDefects) ? parsed.dataDefects : [])
    .filter((row) => row && typeof row === "object")
    .map((row) => ({
      area: String(row.area || "other").toLowerCase(),
      detail: String(row.detail || "").trim().slice(0, 220),
      example: String(row.example || "").trim().slice(0, 180),
    }))
    .filter((row) => row.detail);

  return {
    dropEventIds: asStringArray(parsed.dropEventIds),
    dropOpeningIds: asStringArray(parsed.dropOpeningIds),
    dropDayPlan: parsed.dropDayPlan === true,
    dropTonightPick: parsed.dropTonightPick === true,
    blankEditorialKeys: asStringArray(parsed.blankEditorialKeys)
      .filter((key) => EDITORIAL_KEYS.includes(key)),
    blurbOverrides,
    titleOverrides,
    dataDefects,
    findings: (Array.isArray(parsed.findings) ? parsed.findings : [])
      .filter((row) => row && typeof row === "object")
      .map((row) => ({
        item: String(row.item || "").trim(),
        action: String(row.action || "").trim(),
        reason: String(row.reason || "").trim(),
      }))
      .filter((row) => row.item && row.reason),
  };
}

export function mergeVerdicts(...verdicts) {
  const merged = emptyVerdict();
  const eventIds = new Set();
  const openingIds = new Set();
  const editorialKeys = new Set();
  for (const verdict of verdicts.filter(Boolean)) {
    for (const id of verdict.dropEventIds || []) eventIds.add(id);
    for (const id of verdict.dropOpeningIds || []) openingIds.add(id);
    for (const key of verdict.blankEditorialKeys || []) editorialKeys.add(key);
    if (verdict.dropDayPlan) merged.dropDayPlan = true;
    if (verdict.dropTonightPick) merged.dropTonightPick = true;
    Object.assign(merged.blurbOverrides, verdict.blurbOverrides || {});
    Object.assign(merged.titleOverrides, verdict.titleOverrides || {});
    merged.dataDefects.push(...(verdict.dataDefects || []));
    merged.findings.push(...(verdict.findings || []));
  }
  merged.dropEventIds = [...eventIds];
  merged.dropOpeningIds = [...openingIds];
  merged.blankEditorialKeys = [...editorialKeys];
  return merged;
}

function hoursForCard(card, placesById) {
  if (card?.hours && typeof card.hours === "object") return card.hours;
  const place = placesById.get(placeIdFromCard(card));
  return place?.hours || null;
}

export function deterministicVerdict(data, reports = [], placesById = new Map()) {
  const verdict = emptyVerdict();
  const date = data?.date;
  const push = (item, action, reason, defect) => {
    verdict.findings.push({ item, action, reason });
    if (defect) verdict.dataDefects.push(defect);
  };

  for (const event of [data?.tonightPick, ...(data?.featuredEvents || [])].filter(Boolean)) {
    const key = itemKey(event);
    if (event.date && date && event.date !== date) {
      verdict.dropEventIds.push(key);
      if (event === data.tonightPick) verdict.dropTonightPick = true;
      push(event.title || key, "drop", `occurrence date ${event.date} is not ${date}`, {
        area: "time",
        detail: `Listed event is dated ${event.date}, not the issue date ${date}`,
        example: event.title || key,
      });
    }
  }

  for (const card of orderedCards(data?.dayPlan)) {
    if (isPlaceTemporarilyUnavailable(card)) {
      verdict.dropDayPlan = true;
      push(card.name || itemKey(card), "drop-plan", "venue is temporarily unavailable");
      continue;
    }
    if (hoursStatusOnDate(hoursForCard(card, placesById), date) === "closed") {
      verdict.dropDayPlan = true;
      push(card.name || itemKey(card), "drop-plan", "hours say closed today", {
        area: "venue",
        detail: "Recommended venue hours say it is closed on the issue date",
        example: card.name || itemKey(card),
      });
    }
  }

  for (const report of reports) {
    if (report.ok === false && report.status == null) continue; // fetch failure — keep
    const label = report.title || report.id;
    if (report.kind === "event") {
      if (report.status === 404 || report.status === 410) {
        verdict.dropEventIds.push(report.id);
        if (data?.tonightPick && itemKey(data.tonightPick) === report.id) verdict.dropTonightPick = true;
        push(label, "drop", `source page returned ${report.status}`, {
          area: "url",
          detail: "First-party event page is gone",
          example: report.url || label,
        });
        continue;
      }
      if (report.ok && pageLooksCancelled(report.text)) {
        verdict.dropEventIds.push(report.id);
        if (data?.tonightPick && itemKey(data.tonightPick) === report.id) verdict.dropTonightPick = true;
        if (report.cardId) verdict.dropDayPlan = true;
        push(label, "drop", "first-party page says the event is cancelled", {
          area: "other",
          detail: "First-party page says this occurrence is cancelled",
          example: label,
        });
      }
    }
    if ((report.kind === "venue" || report.kind === "card") && report.ok && pageLooksVenueClosed(report.text)) {
      verdict.dropDayPlan = true;
      push(label, "drop-plan", "first-party page says the venue is closed today", {
        area: "venue",
        detail: "First-party page says the recommended venue is closed",
        example: label,
      });
    }
    if (report.kind === "opening") {
      if (report.status === 404 || report.status === 410) {
        verdict.dropOpeningIds.push(report.id);
        push(label, "drop", `opening source returned ${report.status}`, {
          area: "url",
          detail: "Opening source page is gone",
          example: label,
        });
      }
    }
  }

  return verdict;
}

export function applyQaVerdict(data, verdict = emptyVerdict()) {
  if (!data) return data;
  const dropEvents = new Set(verdict.dropEventIds || []);
  const dropOpenings = new Set(verdict.dropOpeningIds || []);
  const tonightKey = itemKey(data.tonightPick);
  const dropTonight = verdict.dropTonightPick === true || (tonightKey && dropEvents.has(tonightKey));
  const planCards = orderedCards(data.dayPlan);
  const dropPlan = verdict.dropDayPlan === true
    || planCards.some((card) => dropEvents.has(itemKey(card)));

  const applyCopy = (item) => {
    if (!item) return item;
    const key = itemKey(item);
    const next = { ...item };
    if (verdict.titleOverrides?.[key]) next.title = verdict.titleOverrides[key];
    if (verdict.blurbOverrides?.[key]) next.blurb = verdict.blurbOverrides[key];
    return next;
  };

  if (dropTonight) {
    data.tonightPick = null;
    data.tonightPickBlurb = "";
  } else if (data.tonightPick) {
    data.tonightPick = applyCopy(data.tonightPick);
    if (verdict.blurbOverrides?.[tonightKey]) data.tonightPickBlurb = verdict.blurbOverrides[tonightKey];
  }

  if (Array.isArray(data.featuredEvents)) {
    data.featuredEvents = data.featuredEvents
      .filter((event) => !dropEvents.has(itemKey(event)))
      .map(applyCopy);
  }
  if (Array.isArray(data.todayEvents)) {
    data.todayEvents = data.todayEvents
      .filter((event) => !dropEvents.has(itemKey(event)))
      .map(applyCopy);
  }
  if (Array.isArray(data.recentOpenings)) {
    data.recentOpenings = data.recentOpenings.filter((opening) => !dropOpenings.has(itemKey(opening)));
  }

  if (dropPlan) {
    data.dayPlan = null;
    data.dayPlanBlurb = "";
    if (data.editorial) {
      data.editorial.briefing = "";
      data.editorial.dayPlanHeadline = "";
    }
  } else if (data.dayPlan?.cards) {
    data.dayPlan = {
      ...data.dayPlan,
      cards: data.dayPlan.cards.map((card) => {
        const key = itemKey(card);
        if (!verdict.blurbOverrides?.[key]) return card;
        return { ...card, blurb: verdict.blurbOverrides[key] };
      }),
    };
  }

  if (data.editorial) {
    for (const key of verdict.blankEditorialKeys || []) {
      if (key in data.editorial) data.editorial[key] = "";
    }
  }

  repairNewsletterEventFacts(data);
  return data;
}

export function buildQaPrompt(data, reports = []) {
  const lines = [
    "You are the last accuracy check before South Bay Today sends its daily email.",
    `Issue date: ${data?.date || ""} (${data?.longDate || ""}).`,
    "",
    "Only drop or rewrite an item when a first-party excerpt CONTRADICTS the listing:",
    "wrong date, cancelled occurrence, venue closed today, a dated perk on the wrong night,",
    "or a series blurb advertising a session that already happened.",
    "An empty excerpt or a fetch failure is not evidence — leave that item in.",
    "Do not invent a replacement blurb; only override when the excerpt supplies the fact.",
    "A pillar-pairs field guide is atomic: one closed venue or contradicted plan event drops the whole plan.",
    "A venue+activity claim the source page's own series schedule supports is not a hallucination.",
    "Prefer cutting one item. Never empty the whole issue for a single miss.",
    "",
    "LISTINGS:",
  ];

  if (data?.editorial?.briefing) lines.push(`Intro: ${data.editorial.briefing}`);
  if (data?.dayPlanBlurb) lines.push(`Field guide: ${data.dayPlanBlurb}`);
  for (const card of orderedCards(data?.dayPlan)) {
    lines.push(`- plan ${card.bucket || "slot"}: ${card.name} | ${card.eventTime || card.timeBlock || ""} | ${card.url || ""} | ${card.blurb || ""}`);
  }
  if (data?.tonightPick) {
    lines.push(`- tonight ${itemKey(data.tonightPick)}: ${data.tonightPick.title} | ${data.tonightPick.date || ""} ${data.tonightPick.time || ""} | ${data.tonightPick.url || ""} | ${data.tonightPickBlurb || data.tonightPick.blurb || ""}`);
  }
  for (const event of data?.featuredEvents || []) {
    lines.push(`- event ${itemKey(event)}: ${event.title} | ${event.date || ""} ${event.time || ""} | ${event.url || ""} | ${event.blurb || ""}`);
  }
  for (const opening of data?.recentOpenings || []) {
    lines.push(`- opening ${itemKey(opening)}: ${opening.name} | ${opening.date || ""} | ${opening.url || opening.openingEvidence?.url || ""}`);
  }
  if (data?.editorial?.eventsNote) lines.push(`Events note: ${data.editorial.eventsNote}`);

  lines.push("", "FIRST-PARTY EXCERPTS:");
  if (!reports.length) lines.push("(none fetched)");
  for (const report of reports) {
    const status = report.ok ? "ok" : `miss ${report.status || report.error || "error"}`;
    lines.push(`--- ${report.kind} ${report.id} (${status}) ${report.url || ""}`);
    lines.push(report.text || "");
  }

  lines.push("", `Return JSON only:
{
  "dropEventIds": [],
  "dropOpeningIds": [],
  "dropDayPlan": false,
  "dropTonightPick": false,
  "blankEditorialKeys": [],
  "blurbOverrides": {},
  "titleOverrides": {},
  "dataDefects": [{ "area": "duplicate|url|cost|time|title|venue|image|civic|other", "detail": "", "example": "" }],
  "findings": [{ "item": "", "action": "drop|drop-plan|rewrite|keep", "reason": "" }]
}`);
  return lines.join("\n");
}

export async function fetchSourceExcerpt(url, opts = {}) {
  const {
    fetchImpl = fetch,
    timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    maxChars = DEFAULT_EXCERPT_CHARS,
  } = opts;
  if (!url) return { ok: false, error: "no url", text: "", status: null, finalUrl: "" };
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": UA },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    const html = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: String(response.url || url),
      text: stripHtmlExcerpt(html, maxChars),
      error: response.ok ? "" : `HTTP ${response.status}`,
    };
  } catch (error) {
    return { ok: false, status: null, finalUrl: url, text: "", error: String(error?.message || error) };
  }
}

function targetUrl(item) {
  return item?.url || item?.mapsUrl || item?.openingEvidence?.url || "";
}

export async function fetchQaReports(targets, opts = {}) {
  const jobs = [];
  for (const event of targets.events || []) {
    jobs.push({ kind: "event", id: itemKey(event), title: event.title, url: targetUrl(event) });
  }
  for (const card of targets.cards || []) {
    const url = targetUrl(card);
    if (!url) continue;
    jobs.push({
      kind: card.source === "event" || String(card.id || "").startsWith("event:") ? "event" : "venue",
      id: itemKey(card),
      title: card.name,
      url,
      cardId: itemKey(card),
    });
  }
  for (const opening of targets.openings || []) {
    const url = targetUrl(opening);
    if (!url) continue;
    jobs.push({ kind: "opening", id: itemKey(opening), title: opening.name, url });
  }

  const seen = new Set();
  const unique = [];
  for (const job of jobs) {
    const stamp = `${job.kind}:${job.id}:${job.url}`;
    if (!job.url || seen.has(stamp)) continue;
    seen.add(stamp);
    unique.push(job);
  }

  return Promise.all(unique.map(async (job) => {
    const excerpt = await fetchSourceExcerpt(job.url, opts);
    return { ...job, ...excerpt };
  }));
}

function claudeCli() {
  return process.env.CLAUDE_CLI_PATH || "/opt/homebrew/bin/claude";
}

async function runClaudeCliQa(prompt) {
  const model = process.env.SBT_NEWSLETTER_QA_CLAUDE_MODEL || "sonnet";
  const timeoutMs = Number(process.env.SBT_NEWSLETTER_QA_TIMEOUT_MS || 180_000);
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (error, value) => {
      if (done) return;
      done = true;
      if (error) reject(error);
      else resolve(value);
    };
    const proc = spawn(claudeCli(), [
      "-p",
      "--model", model,
      "--output-format", "text",
      "--no-session-persistence",
    ], { cwd: "/tmp", timeout: timeoutMs });
    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("error", (error) => finish(new Error(`claude spawn failed: ${error.message}`)));
    proc.on("close", (code, signal) => {
      if (signal) return finish(new Error(`claude killed by ${signal}: ${(stderr || stdout).slice(0, 400)}`));
      if (code !== 0) return finish(new Error(`claude exit ${code}: ${(stderr || stdout).slice(0, 400)}`));
      finish(null, stdout);
    });
    proc.stdin.end(prompt);
  });
}

export async function defaultQaReview(prompt, opts = {}) {
  if (opts.reviewFn) return opts.reviewFn(prompt);
  try {
    return await runClaudeCliQa(prompt);
  } catch (cliError) {
    if (!process.env.ANTHROPIC_API_KEY) throw cliError;
    const detail = String(cliError?.message || cliError).slice(0, 180);
    (opts.log || console.warn)(`⚠️  newsletter QA: CLI failed (${detail}) — retrying on the Anthropic API`);
    return callClaude(prompt, {
      model: process.env.SBT_NEWSLETTER_QA_API_MODEL || CLAUDE_SONNET,
      maxTokens: 4_096,
      label: "newsletter-qa",
      fetchImpl: opts.fetchImpl,
    });
  }
}

function logFindings(log, findings) {
  for (const finding of findings || []) {
    log(`⚠️  newsletter QA: ${finding.action || "flag"} "${finding.item}" — ${finding.reason}`);
  }
}

export async function runPreSendQa(data, opts = {}) {
  const log = opts.log || console.warn;
  if (!data) return { data, qa: { status: "skipped", reason: "no data" } };
  if (!qaEnabled(opts)) {
    data.qaMeta = { status: "disabled" };
    return { data, qa: data.qaMeta };
  }

  try {
    const targets = collectQaTargets(data);
    const reports = await fetchQaReports(targets, opts);
    const placesById = opts.placesById || loadPlacesById();
    const detected = deterministicVerdict(data, reports, placesById);
    let reviewed = emptyVerdict();
    let via = "deterministic";
    const skipLlm = opts.skipLlm === true;
    if (!skipLlm) {
      try {
        const raw = await defaultQaReview(buildQaPrompt(data, reports), opts);
        reviewed = parseQaVerdict(raw);
        via = opts.reviewFn ? "review-fn" : "llm";
      } catch (error) {
        log(`⚠️  newsletter QA: review failed (${String(error?.message || error).slice(0, 200)}) — applying deterministic cuts only`);
      }
    }

    const verdict = mergeVerdicts(detected, reviewed);
    applyQaVerdict(data, verdict);
    if (opts.persistDefects && verdict.dataDefects.length) {
      recordNewsletterQaDefects(verdict.dataDefects, data.date);
    }
    logFindings(log, verdict.findings);
    data.qaMeta = {
      status: "ok",
      via,
      findings: verdict.findings,
      droppedEvents: verdict.dropEventIds,
      droppedOpenings: verdict.dropOpeningIds,
      droppedDayPlan: verdict.dropDayPlan,
    };
    return { data, qa: data.qaMeta, verdict };
  } catch (error) {
    const message = String(error?.message || error).slice(0, 240);
    log(`⚠️  newsletter QA failed (${message}) — sending assembled issue`);
    data.qaMeta = { status: "failed", error: message };
    return { data, qa: data.qaMeta };
  }
}
