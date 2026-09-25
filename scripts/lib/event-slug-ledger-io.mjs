// ---------------------------------------------------------------------------
// Read/advance/write the retired-slug ledger (events-retired.json).
// Pure logic lives in src/lib/south-bay/eventSlugLedger.mjs; this is the
// file-backed wrapper generate-events and the standalone sync script share.
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { liveSlugs, retireSlugs } from "../../src/lib/south-bay/eventSlugLedger.mjs";
import { writeFileAtomic } from "./io.mjs";
import { DATA_DIR } from "./paths.mjs";

export const LEDGER_PATH = join(DATA_DIR, "events-retired.json");

export function readLedger(path = LEDGER_PATH) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { entries: [] };
  }
}

export function pacificToday(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

/**
 * Retire every future slug in `previousEvents` that `currentEvents` no longer
 * publishes, then write the ledger. Returns the new ledger plus how many
 * entries were added this pass so callers can log it.
 *
 * With `archiveEvents`, entries whose slug the archive now serves as a
 * regular passed page are dropped: the build skips them anyway, and both
 * files hold a slug for the same 90 days past its date.
 */
export function advanceLedger({ previousEvents, currentEvents, archiveEvents = null, todayPt = pacificToday(), path = LEDGER_PATH, now }) {
  const before = readLedger(path);
  const beforeSlugs = new Set((before.entries ?? []).map((e) => e.slug));
  const next = retireSlugs(before, previousEvents ?? [], currentEvents ?? [], todayPt, now);
  if (archiveEvents) {
    const live = liveSlugs(currentEvents ?? [], archiveEvents, todayPt);
    next.entries = next.entries.filter((e) => !live.has(e.slug));
    next.count = next.entries.length;
  }
  const added = next.entries.filter((e) => !beforeSlugs.has(e.slug)).length;
  const removed = beforeSlugs.size + added - next.entries.length;
  // Only touch the file when the set of retired slugs actually moved, so a
  // no-op pass (pre-commit on an unrelated edit) doesn't churn `updatedAt`.
  const changed = JSON.stringify(next.entries) !== JSON.stringify(before.entries ?? []);
  if (changed) writeFileAtomic(path, `${JSON.stringify(next, null, 2)}\n`);
  return { ledger: changed ? next : { ...before, entries: before.entries ?? [], count: (before.entries ?? []).length }, added, removed, changed };
}
