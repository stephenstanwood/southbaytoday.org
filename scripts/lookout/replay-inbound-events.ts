/**
 * Replay recent Resend inbound emails through the event extractor.
 *
 * Use this after fixing extractor/intake bugs. It scans recent inbox items,
 * skips emails that already produced events, reprocesses likely event/newsletter
 * mail that previously errored or returned no-events, and writes the same
 * per-email Blob shards the webhook writes.
 *
 * Usage:
 *   node --import tsx scripts/lookout/replay-inbound-events.ts --days=14 --include-no-events
 *   node --import tsx scripts/lookout/replay-inbound-events.ts --days=7 --dry-run
 *   node --import tsx scripts/lookout/replay-inbound-events.ts --days=14 --list-only
 */

import { loadEnvLocal } from "../lib/env.mjs";
import { extractEvents, normalizeCityKey } from "../../src/lib/lookout/extractor.ts";
import { looksLikeAck, looksLikeConfirmation } from "../../src/lib/lookout/confirm.ts";
import { resolveRealSender } from "../../src/lib/lookout/resend-from.ts";
import {
  contentHashFor,
  dedupHashFor,
  readIntakeLog,
  writeInboundEventsForEmail,
  writeIntakeLog,
} from "../../src/lib/lookout/storage.ts";
import type { InboundEmail, InboundEvent, InboundIntakeLog } from "../../src/lib/lookout/types.ts";

loadEnvLocal();

interface Options {
  days: number;
  dryRun: boolean;
  includeNoEvents: boolean;
  listOnly: boolean;
  max: number;
}

interface ListEmail {
  id: string;
  from?: string;
  to?: string | string[];
  subject?: string;
  created_at?: string;
  message_id?: string;
}

interface ReplayEmail extends InboundEmail {
  resendId: string;
  listedFrom: string;
  dedupHash: string;
  alternateDedupHash: string;
  contentHash: string;
}

const opts = parseOptions(process.argv.slice(2));
const resendKey = process.env.RESEND_API_KEY;
if (!resendKey) {
  console.error("RESEND_API_KEY missing");
  process.exit(1);
}

const hasMiniBackend = !!(process.env.MINI_CLAUDE_URL && process.env.MINI_CLAUDE_TOKEN);
if (!hasMiniBackend && !process.env.ANTHROPIC_API_KEY) {
  console.error("No extractor backend configured: set MINI_CLAUDE_URL/MINI_CLAUDE_TOKEN or ANTHROPIC_API_KEY");
  process.exit(1);
}

const since = new Date(Date.now() - opts.days * 24 * 60 * 60 * 1000);
console.log(
  `Replaying likely inbound event emails since ${since.toISOString()} (${opts.days}d)` +
    `${opts.includeNoEvents ? " including prior no-events" : ""}` +
    `${opts.listOnly ? " [list-only]" : ""}` +
    `${opts.dryRun ? " [dry-run]" : ""}`
);

const intakeLog = await readIntakeLog();
const latestByHash = latestMap(intakeLog, (entry) => entry.dedupHash);
const latestByContent = latestMap(intakeLog, (entry) => entry.contentHash || "");

const listItems = await fetchRecentReceived(since);
console.log(`Resend inbox candidates by date: ${listItems.length}`);

const replayQueue: Array<{ email: ReplayEmail; reason: string }> = [];
let skippedSuccess = 0;
let skippedOutcome = 0;
let skippedType = 0;
let skippedHeuristic = 0;
let skippedDuplicateContent = 0;
let detailErrors = 0;
const queuedContentHashes = new Set<string>();

for (const item of listItems) {
  if (opts.max > 0 && replayQueue.length >= opts.max) break;

  let email: ReplayEmail;
  try {
    email = await fetchReplayEmail(item);
  } catch (err) {
    detailErrors++;
    console.warn(`  detail failed ${item.id}: ${(err as Error).message}`);
    continue;
  }

  if (looksLikeAck(email.subject) || looksLikeConfirmation(email.subject)) {
    skippedType++;
    continue;
  }

  const priorEntries = [
    latestByHash.get(email.dedupHash),
    latestByHash.get(email.alternateDedupHash),
    latestByContent.get(email.contentHash),
  ].filter(Boolean) as InboundIntakeLog[];

  if (priorEntries.some((entry) => entry.outcome === "events-extracted" && entry.eventCount > 0)) {
    skippedSuccess++;
    continue;
  }

  const reason = replayReason(priorEntries, opts.includeNoEvents);
  if (!reason) {
    skippedOutcome++;
    continue;
  }

  if (!looksLikeEventNewsletter(email, priorEntries)) {
    skippedHeuristic++;
    continue;
  }

  if (queuedContentHashes.has(email.contentHash)) {
    skippedDuplicateContent++;
    continue;
  }
  queuedContentHashes.add(email.contentHash);

  replayQueue.push({ email, reason });
  await sleep(80);
}

console.log(`Replay queue: ${replayQueue.length}`);
console.log(`Skipped: success=${skippedSuccess} outcome=${skippedOutcome} type=${skippedType} heuristic=${skippedHeuristic} duplicateContent=${skippedDuplicateContent} detailErrors=${detailErrors}`);
if (opts.listOnly) {
  for (const { email, reason } of replayQueue) {
    console.log(`  - ${reason}: ${email.from} | ${email.subject}`);
  }
  process.exit(0);
}

let extractedEmails = 0;
let noEvents = 0;
let extractorErrors = 0;
let writtenEvents = 0;
const appendedLog: InboundIntakeLog[] = [];

for (let i = 0; i < replayQueue.length; i++) {
  const { email, reason } = replayQueue[i];
  console.log(`\n[${i + 1}/${replayQueue.length}] ${reason}: ${email.from} | ${email.subject}`);

  try {
    const extracted = await extractEvents(email);
    const fresh = extracted
      .filter((event) => event.startsAt.slice(0, 10) >= todayInPacific())
      .map((event, idx): InboundEvent => ({
        id: `inbound_${email.dedupHash}_${String(idx + 1).padStart(2, "0")}`,
        receivedAt: email.receivedAt,
        fromEmail: email.from,
        emailSubject: email.subject,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        location: event.location,
        description: event.description,
        sourceUrl: event.sourceUrl,
        cityKey: normalizeCityKey(event.cityName),
        cityName: event.cityName,
        status: "new",
      }));

    if (fresh.length > 0) {
      extractedEmails++;
      writtenEvents += fresh.length;
      console.log(`  events: ${fresh.length}`);
      for (const event of fresh) {
        console.log(`   - ${event.startsAt.slice(0, 10)} ${event.title}`);
      }
      if (!opts.dryRun) {
        await writeInboundEventsForEmail(email.dedupHash, fresh);
      }
      appendedLog.push(logEntry(email, "events-extracted", fresh.length));
    } else {
      noEvents++;
      console.log("  no future events extracted");
      appendedLog.push(logEntry(email, "no-events", 0));
    }
  } catch (err) {
    extractorErrors++;
    const message = (err as Error).message;
    console.warn(`  extractor error: ${message}`);
    appendedLog.push(logEntry(email, "extractor-error", 0, message));
  }

  await sleep(250);
}

if (!opts.dryRun && appendedLog.length > 0) {
  await writeIntakeLog([...intakeLog, ...appendedLog].slice(-500));
}

console.log("\nReplay complete:");
console.log(`  emails with events: ${extractedEmails}`);
console.log(`  events written:     ${writtenEvents}`);
console.log(`  no-events:          ${noEvents}`);
console.log(`  extractor errors:   ${extractorErrors}`);
console.log(`  log entries:        ${opts.dryRun ? 0 : appendedLog.length}`);

function parseOptions(args: string[]): Options {
  const out: Options = { days: 14, dryRun: false, includeNoEvents: false, listOnly: false, max: 0 };
  for (const arg of args) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--include-no-events") out.includeNoEvents = true;
    else if (arg === "--list-only") out.listOnly = true;
    else if (arg.startsWith("--days=")) out.days = parsePositiveInt(arg.slice("--days=".length), out.days);
    else if (arg.startsWith("--max=")) out.max = parsePositiveInt(arg.slice("--max=".length), out.max);
  }
  return out;
}

function parsePositiveInt(raw: string, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function resendGet(path: string): Promise<any> {
  const res = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${resendKey}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`resend ${path}: ${res.status} ${await res.text().catch(() => "")}`);
  return await res.json();
}

async function fetchRecentReceived(sinceDate: Date): Promise<ListEmail[]> {
  const out: ListEmail[] = [];
  let after: string | null = null;
  while (true) {
    const qs = new URLSearchParams({ limit: "100" });
    if (after) qs.set("after", after);
    const page = await resendGet(`/emails/receiving?${qs}`);
    const data = (page.data ?? []) as ListEmail[];
    if (data.length === 0) break;

    for (const item of data) {
      const received = dateValue(item.created_at);
      if (received >= sinceDate.getTime()) out.push(item);
    }

    const oldest = dateValue(data[data.length - 1]?.created_at);
    if (!page.has_more || oldest < sinceDate.getTime()) break;
    after = data[data.length - 1].id;
    await sleep(150);
  }
  return out;
}

async function fetchReplayEmail(item: ListEmail): Promise<ReplayEmail> {
  const detail = await resendGet(`/emails/receiving/${item.id}`);
  const text = stringFrom(detail.text);
  const html = stringFrom(detail.html);
  const body = text || stripHtml(html);
  const subject = stringFrom(detail.subject) || stringFrom(item.subject);
  const listedFrom = stringFrom(detail.from) || stringFrom(item.from);
  const from = resolveRealSender(listedFrom, detail.headers, detail.reply_to);
  const messageId = stringFrom(detail.message_id) || stringFrom(item.message_id) || item.id;
  const receivedAt = stringFrom(detail.created_at) || stringFrom(item.created_at) || new Date().toISOString();
  const to = stringFrom(detail.to) || stringFrom(item.to);
  const dedupHash = dedupHashFor(listedFrom, subject, messageId || item.id);
  const alternateDedupHash = dedupHashFor(from, subject, messageId || item.id);
  const contentHash = contentHashFor(subject, body);

  return {
    resendId: item.id,
    listedFrom,
    dedupHash,
    alternateDedupHash,
    contentHash,
    from,
    to,
    subject,
    body,
    html,
    receivedAt,
    messageId,
  };
}

function latestMap<T>(items: T[], keyFn: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = keyFn(item);
    if (key) map.set(key, item);
  }
  return map;
}

function replayReason(entries: InboundIntakeLog[], includeNoEvents: boolean): string | null {
  if (entries.some((entry) => entry.outcome === "extractor-error")) return "prior extractor-error";
  if (includeNoEvents && entries.some((entry) => entry.outcome === "no-events")) return "prior no-events";
  if (entries.length === 0) return "missing intake log";
  return null;
}

function looksLikeEventNewsletter(email: ReplayEmail, priorEntries: InboundIntakeLog[]): boolean {
  const subject = email.subject || "";
  const haystack = `${email.from}\n${subject}\n${email.body.slice(0, 6000)}`;

  if (/\b(agenda for|agenda packet|meeting agenda|committee agenda|commission agenda|board agenda|development review committee|historic preservation committee|senior advisory committee|addendum|opportunity alert|solicitation|request for proposals|rfp|bidnet|planetbids|vendorline|event interest notification|invoice|receipt|registration confirmation|zoning hearing|public hearing)\b/i.test(haystack)) {
    return false;
  }
  if (/\b(council|commission|committee|board)\s+meeting\b/i.test(subject)) return false;

  if (/\b(featured events|upcoming events|other upcoming events|event calendar|community events?|newsletter|happenings?|what'?s new|this week|weekend|on sale|announced|concert|festival|farmers'? market|class|workshop|camp|museum|theat(?:er|re)|arts?|library|recreation|downtown|chamber|grand opening|ribbon cutting|family fun|kids?|music|lecture|author|book club|ceremony|parade|fair|wine walk|art walk|fun run|5k|10k|race|volunteer)\b/i.test(haystack)) {
    return true;
  }

  return false;
}

function logEntry(
  email: ReplayEmail,
  outcome: InboundIntakeLog["outcome"],
  eventCount: number,
  error?: string
): InboundIntakeLog {
  return {
    dedupHash: email.dedupHash,
    contentHash: email.contentHash,
    receivedAt: email.receivedAt,
    from: email.from,
    subject: email.subject,
    outcome,
    eventCount,
    ...(error ? { error } : {}),
  };
}

function stringFrom(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return String(value[0]);
  return "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function todayInPacific(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function dateValue(value: unknown): number {
  const n = Date.parse(String(value || ""));
  return Number.isFinite(n) ? n : 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
