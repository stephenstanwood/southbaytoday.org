// ---------------------------------------------------------------------------
// events-archive.json helpers shared by generate-events and the git backfill.
// The archive keeps passed events for ARCHIVE_DAYS so /event/<slug> and
// /events/<date> pages keep resolving (with a "passed" banner) after the day.
// ---------------------------------------------------------------------------

export const ARCHIVE_DAYS = 90;

/**
 * One archive row per event per date. A theater run listed as a single entry
 * whose date advances to the next performance each night keeps its id, so an
 * id-only key let each night overwrite the last and every earlier
 * performance's /event/ URL 404'd (Palo Alto Players, Sep 2026).
 */
export function archiveKey(e) {
  return `${e.id ?? e.title}|${e.date}`;
}

const isDated = (e) => typeof e?.date === "string";

/**
 * Fold the events that passed since `previousEvents` was written into the
 * archive, then trim to [cutoffPt, todayPt].
 *
 * Passed means dated before today, or dated today and missing from
 * `currentEvents`: windowed sources (the library calendars above all) stop
 * listing an event once it starts, so the evening refresh drops most of the
 * day's events. Before 2026-09-25 those never reached the archive — 71 of
 * 121 events on Sep 24 — and their URLs 404'd the next morning. Today's rows
 * sit in the archive until tomorrow; the pages only read rows dated before
 * today.
 *
 * `preferExisting` keeps rows already in the archive (the git backfill must
 * not undo a later copy edit or fact check).
 */
export function mergeArchive(archiveEvents, previousEvents, todayPt, cutoffPt, { currentEvents = null, preferExisting = false } = {}) {
  const byKey = new Map((archiveEvents ?? []).filter(isDated).map((e) => [archiveKey(e), e]));
  const stillListed = new Set((currentEvents ?? []).filter(isDated).map(archiveKey));
  const aging = (previousEvents ?? []).filter(
    (e) => isDated(e) && (e.date < todayPt || (currentEvents && e.date === todayPt && !stillListed.has(archiveKey(e)))),
  );
  for (const e of aging) {
    const key = archiveKey(e);
    if (preferExisting && byKey.has(key)) continue;
    byKey.set(key, e);
  }
  const kept = [...byKey.values()].filter((e) => e.date >= cutoffPt && e.date <= todayPt);
  kept.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id ?? "").localeCompare(String(b.id ?? "")));
  return { kept, aged: aging.length };
}
