import { test } from "node:test";
import assert from "node:assert/strict";

import { findSuccessor, liveSlugs, resolveRetired, retireSlugs } from "./eventSlugLedger.mjs";

const TODAY = "2026-09-18";
const ev = (over) => ({
  id: "x",
  title: "Storytime",
  date: "2026-09-25",
  time: "10:00 AM",
  venue: "Main Library",
  city: "san-jose",
  url: `https://example.org/events/${over.id ?? "x"}`,
  source: "Test",
  ...over,
});

test("retireSlugs records a future slug that the new run stopped publishing", () => {
  const gone = ev({ id: "a", title: "44th Annual Art & Wine Festival" });
  const kept = ev({ id: "b", title: "Book Club" });
  const ledger = retireSlugs({ entries: [] }, [gone, kept], [kept], TODAY, "2026-09-18T10:00:00.000Z");
  assert.equal(ledger.count, 1);
  assert.equal(ledger.entries[0].slug, "2026-09-25-44th-annual-art-and-wine-festival");
  assert.equal(ledger.entries[0].retiredAt, "2026-09-18T10:00:00.000Z");
  assert.equal(ledger.entries[0].event.title, gone.title);
  assert.equal(ledger.entries[0].event.time, "10:00 AM");
});

test("retireSlugs ignores past and untimed records, drops slugs that come back, and expires old ones", () => {
  const past = ev({ id: "p", title: "Yesterday", date: "2026-09-17" });
  const untimed = ev({ id: "u", title: "Exhibit", time: null });
  const back = ev({ id: "r", title: "Returning Event" });
  const stale = ev({ id: "s", title: "Long Ago", date: "2026-06-01" });
  const ledger = {
    entries: [
      { slug: "2026-09-25-returning-event", retiredAt: "2026-09-10T00:00:00.000Z", event: back },
      { slug: "2026-06-01-long-ago", retiredAt: "2026-06-02T00:00:00.000Z", event: stale },
    ],
  };
  const next = retireSlugs(ledger, [past, untimed], [back], TODAY);
  assert.deepEqual(next.entries, []);
});

test("retireSlugs keeps the original retiredAt for entries already in the ledger", () => {
  const gone = ev({ id: "a", title: "Gone" });
  const first = retireSlugs({ entries: [] }, [gone], [], TODAY, "2026-09-10T00:00:00.000Z");
  const second = retireSlugs(first, [], [], TODAY, "2026-09-18T00:00:00.000Z");
  assert.equal(second.entries[0].retiredAt, "2026-09-10T00:00:00.000Z");
});

test("findSuccessor matches by id, then source URL, then title similarity with an agreeing place", () => {
  const live = liveSlugs(
    [
      ev({ id: "same-id", title: "Cla Presents: Tessa Hulls" }),
      ev({ id: "n2", title: "Santa Clara Art & Wine Festival", url: "https://santaclaraca.gov/art-wine", venue: null, city: "santa-clara" }),
      ev({ id: "n3", title: "Storytime", venue: "Rose Garden Branch" }),
      ev({ id: "n4", title: "Storytime", venue: "Main Library", city: "sunnyvale" }),
    ],
    [],
    TODAY,
  );
  assert.equal(
    findSuccessor(ev({ id: "same-id", title: "Cla Presents: Tessa Hull" }), live),
    "2026-09-25-cla-presents-tessa-hulls",
  );
  assert.equal(
    findSuccessor(ev({ id: "other", title: "Wine Fest", url: "https://www.santaclaraca.gov/art-wine/" }), live),
    "2026-09-25-santa-clara-art-and-wine-festival",
  );
  assert.equal(
    findSuccessor(ev({ id: "inbound-1", title: "44th Annual Santa Clara Art & Wine Festival", url: "https://santaclaraartandwine.com", venue: null, city: "santa-clara" }), live),
    "2026-09-25-santa-clara-art-and-wine-festival",
  );
  // Same title, different branch / different city: not the same event.
  assert.equal(findSuccessor(ev({ id: "z", title: "Storytime", venue: "Cambrian Branch" }), live), null);
  assert.equal(findSuccessor(ev({ id: "z", title: "Storytime", venue: null, city: "campbell" }), live), null);
  // Different date never matches, even on id.
  assert.equal(findSuccessor(ev({ id: "same-id", date: "2026-09-26" }), live), null);
});

test("resolveRetired splits redirects from orphans and skips slugs that are live again", () => {
  const live = ev({ id: "keep", title: "Live Event" });
  const renamed = ev({ id: "keep", title: "Live Evnt" });
  const dropped = ev({ id: "gone", title: "Dropped Event" });
  const ledger = {
    entries: [
      { slug: "2026-09-25-live-evnt", retiredAt: "2026-09-17T00:00:00.000Z", event: renamed },
      { slug: "2026-09-25-dropped-event", retiredAt: "2026-09-17T00:00:00.000Z", event: dropped },
      { slug: "2026-09-25-live-event", retiredAt: "2026-09-17T00:00:00.000Z", event: live },
    ],
  };
  const { redirects, orphans } = resolveRetired(ledger, [live], [], TODAY);
  assert.deepEqual([...redirects], [["2026-09-25-live-evnt", "2026-09-25-live-event"]]);
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].slug, "2026-09-25-dropped-event");
});
