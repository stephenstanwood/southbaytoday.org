import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sharedPlanMetadata } from "./sharedPlanMetadata.ts";

const card = (name: string, bucket = "morning", city = "san-jose") => ({ name, bucket, city });
const plan = (cards: ReturnType<typeof card>[], extra = {}) => ({ cards, planDate: "2026-05-08", kids: false, ...extra });

test("all saved historical itineraries have distinct, descriptive titles and descriptions", () => {
  const saved = JSON.parse(readFileSync(new URL("../../data/south-bay/shared-plans.json", import.meta.url), "utf8"));
  const before = JSON.stringify(saved);
  const entries = Object.entries(saved) as [string, Record<string, any>][];
  assert.ok(entries.length >= 108, "preserve the historical saved plans");
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const [id, record] of entries) {
    const metadata = sharedPlanMetadata(record, entries.filter(([otherId]) => otherId !== id).map(([, other]) => other));
    assert.ok(!titles.has(metadata.title), `duplicate title at /plan/${id}: ${metadata.title}`);
    assert.ok(!descriptions.has(metadata.description), `duplicate description at /plan/${id}`);
    assert.ok(metadata.title.length <= 70, `overlong title at /plan/${id}`);
    assert.ok(metadata.description.length <= 165, `overlong description at /plan/${id}`);
    assert.ok(metadata.title.includes("2026"));
    assert.ok(metadata.description.includes("day plan"));
    assert.equal(metadata.planDate, record.planDate);
    titles.add(metadata.title);
    descriptions.add(metadata.description);
  }
  assert.equal(JSON.stringify(saved), before, "metadata generation must never mutate saved plans");
});

test("same activities with different meals get different titles", () => {
  const shared = [card("Rose Garden"), card("Art Museum", "afternoon"), card("Jazz Club", "evening")];
  const first = plan([...shared, card("Cafe One", "dinner")]);
  const second = plan([...shared, card("Cafe Two", "dinner")]);
  const a = sharedPlanMetadata(first, [second]);
  const b = sharedPlanMetadata(second, [first]);
  assert.ok(a.title.includes("Cafe One"));
  assert.ok(b.title.includes("Cafe Two"));
  assert.notEqual(a.description, b.description);
});

test("a combination of recurring stops distinguishes an itinerary", () => {
  const first = plan([card("Rose Garden"), card("Art Museum", "afternoon")]);
  const second = plan([card("Rose Garden"), card("Jazz Club", "evening")]);
  const third = plan([card("Art Museum", "afternoon"), card("Jazz Club", "evening")]);
  assert.equal(sharedPlanMetadata(first, [second, third]).headline, "Rose Garden + Art Museum");
});

test("same-name places in different cities retain their branch context", () => {
  const first = plan([card("Central Park", "morning", "santa-clara")]);
  const second = plan([card("Central Park", "morning", "campbell")]);
  assert.equal(sharedPlanMetadata(first, [second]).headline, "Central Park (Santa Clara)");
  assert.equal(sharedPlanMetadata(second, [first]).headline, "Central Park (Campbell)");
});

test("metadata only names cards the bucket page renders", () => {
  const saved = plan([card("Visible Park"), card("Hidden Park"), card("Visible Cafe", "breakfast")]);
  const metadata = sharedPlanMetadata(saved);
  assert.equal(metadata.headline, "Visible Park");
  assert.ok(!metadata.description.includes("Hidden Park"));
});

test("legacy time blocks and title fields remain usable without rewriting the record", () => {
  const metadata = sharedPlanMetadata({
    cards: [{ title: "Hakone Estate & Gardens", category: "outdoor", timeBlock: "9:00 AM - 11:00 AM" }],
    createdAt: "2026-05-09T01:00:00Z",
  });
  assert.equal(metadata.planDate, "2026-05-08", "createdAt fallback uses the saved Pacific day");
  assert.equal(metadata.dateLabel, "Friday, May 8, 2026");
  assert.ok(metadata.title.includes("Hakone Estate & Gardens"));
});

test("a saved plan date wins over creation time and invalid dates never become today's date", () => {
  assert.equal(sharedPlanMetadata(plan([card("Park")], { createdAt: "2026-05-09T01:00:00Z" })).planDate, "2026-05-08");
  const unknown = sharedPlanMetadata(plan([card("Park")], { planDate: "2026-02-30", createdAt: "not a date" }));
  assert.equal(unknown.planDate, null);
  assert.equal(unknown.dateLabel, undefined);
  assert.equal(unknown.title, "Park — South Bay Today");
});

test("family plans are identified and identical itineraries are not given invented differences", () => {
  const saved = plan([card("Children's Discovery Museum")], { kids: true });
  const metadata = sharedPlanMetadata(saved, [structuredClone(saved)]);
  assert.ok(metadata.title.startsWith("Family day plan: Children's Discovery Museum"));
  assert.ok(metadata.description.startsWith("South Bay family day plan"));
  assert.equal(metadata.headline, "Children's Discovery Museum");
});

test("long names with the same prefix are preserved rather than truncated into duplicates", () => {
  const prefix = "An evening of chamber music from the university orchestra featuring ";
  const first = plan([card(`${prefix}Mozart`)]);
  const second = plan([card(`${prefix}Beethoven`)]);
  assert.ok(sharedPlanMetadata(first, [second]).title.includes("Mozart"));
  assert.ok(sharedPlanMetadata(second, [first]).title.includes("Beethoven"));
});
