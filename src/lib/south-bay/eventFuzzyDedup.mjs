// ---------------------------------------------------------------------------
// eventFuzzyDedup.mjs
// ---------------------------------------------------------------------------
// Fallback cross-source dedup that catches near-duplicate events the exact
// (title|date|venue) key in generate-events.mjs misses. Two sources often
// surface the same event with slightly different titles, organizer prefixes,
// or venue strings: "LGPNS Big Truck Day" / "Big Truck Day", "Curator-led
// Tours: …" / "Curator-led tours: …", "SJZ Break Room Jazz Jam Ft. X" /
// "Jazz Jam Ft. X". This pass groups by date+city and collapses pairs whose
// titles are subsets (or jaccard ≥ 0.85) AND share either start time
// (within 30 min) or venue tokens (jaccard ≥ 0.4).
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a", "an", "the", "of", "in", "on", "at", "to", "for", "with", "by", "from",
  "and", "or", "vs", "versus", "presents", "present", "featuring", "ft", "feat",
  "amp", "s",
]);

function tokenize(s) {
  if (!s) return new Set();
  const out = new Set();
  for (const w of String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)) {
    if (!w || STOP_WORDS.has(w)) continue;
    // Keep all numeric tokens (age ranges, grade levels, years, edition numbers
    // distinguish otherwise-identical titles like "Chess Grades 1-5" vs "6-8").
    // Drop only short alpha-only tokens.
    if (w.length < 2 && !/\d/.test(w)) continue;
    out.add(w);
  }
  return out;
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

function isSubsetOf(a, b) {
  if (a.size === 0) return false;
  for (const w of a) if (!b.has(w)) return false;
  return true;
}

function parseTimeMin(t) {
  if (!t) return null;
  const m = String(t).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const ap = (m[3] || "").toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + parseInt(m[2], 10);
}

function richnessScore(e) {
  let s = 0;
  if (e.description) s += Math.min(e.description.length / 100, 5);
  if (e.time) s += 2;
  if (e.endTime) s += 1;
  if (e.image || e.photoRef) s += 2;
  if (e.url) s += 1;
  if (e.cost) s += 0.5;
  return s;
}

/**
 * Apply fuzzy cross-source dedup. Returns { kept, droppedCount }.
 * Mutates nothing; produces a new array.
 */
export function fuzzyDedupEvents(events) {
  const groups = new Map();
  for (const e of events) {
    if (!e || !e.date || !e.city || !e.title) continue;
    const k = `${e.date}|${e.city}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }

  const dropIds = new Set();
  let droppedCount = 0;

  for (const evs of groups.values()) {
    if (evs.length < 2) continue;
    // Sports has its own date+venue dedup upstream; skip to avoid double-handling.
    const candidates = evs.filter((e) => e.category !== "sports");
    for (let i = 0; i < candidates.length; i++) {
      const e1 = candidates[i];
      if (dropIds.has(e1.id)) continue;
      const t1 = tokenize(e1.title);
      const tm1 = parseTimeMin(e1.time);
      const v1 = tokenize(e1.venue);
      for (let j = i + 1; j < candidates.length; j++) {
        const e2 = candidates[j];
        if (dropIds.has(e2.id)) continue;
        const t2 = tokenize(e2.title);
        const titleMatch = isSubsetOf(t1, t2) || isSubsetOf(t2, t1) || jaccard(t1, t2) >= 0.85;
        if (!titleMatch) continue;

        const tm2 = parseTimeMin(e2.time);
        const timeClose = tm1 != null && tm2 != null && Math.abs(tm1 - tm2) <= 30;
        const v2 = tokenize(e2.venue);
        const venueClose = jaccard(v1, v2) >= 0.4;
        if (!timeClose && !venueClose) continue;

        const drop = richnessScore(e1) < richnessScore(e2) ? e1 : e2;
        dropIds.add(drop.id);
        droppedCount++;
      }
    }
  }

  if (dropIds.size === 0) {
    return { kept: events.slice(), droppedCount: 0 };
  }
  return {
    kept: events.filter((e) => !e || !e.id || !dropIds.has(e.id)),
    droppedCount,
  };
}
