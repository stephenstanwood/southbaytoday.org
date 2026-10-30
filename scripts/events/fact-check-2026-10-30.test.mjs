import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";

const occurrence = {
  id: "stanford-54298990217857-2026-10-30", source: "Stanford Events",
  title: "Autumn Farm Festival - The O'Donohue Family Stanford Educational Farm",
  venue: "The O'Donohue Family Stanford Educational Farm", date: "2026-10-30",
  url: "https://events.stanford.edu/event/farm-autumn-festival-the-odonohue-family-stanford-educational-farm",
  time: "2:00 PM", endTime: "5:00 PM", cost: "free",
  description: "Come to the O'Donohue Family Stanford Educational Farm to celebrate the Fall harvest. There will be music, activties and light bites. All are welcome.",
};

test("the captured farm cache cannot turn unspecified music into a live performance", async (t) => {
  const sandbox = mkdtempSync(join(tmpdir(), "sbt-farm-facts-"));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const repo = fileURLToPath(new URL("../../", import.meta.url));
  mkdirSync(join(sandbox, "src/lib/south-bay"), { recursive: true });
  for (const file of ["eventBlurbs.mjs", "eventSourceFacts.mjs", "eventFilters.mjs", "eventCopyEdits.mjs"]) {
    cpSync(join(repo, "src/lib/south-bay", file), join(sandbox, "src/lib/south-bay", file));
  }
  mkdirSync(join(sandbox, "scripts/lib"), { recursive: true });
  cpSync(join(repo, "scripts/lib/io.mjs"), join(sandbox, "scripts/lib/io.mjs"));
  mkdirSync(join(sandbox, "src/data/south-bay"), { recursive: true });
  // Captured October 29 cache entry, with its actual source-text fingerprint.
  writeFileSync(join(sandbox, "src/data/south-bay/event-blurb-cache.json"), JSON.stringify({ byKey: {
    "fp:autumn farm festival - the o'donohue family stanford educational farm|the o'donohue family stanford educational farm|d:3d4878ab95c3": {
      blurb: "Celebrate the fall harvest at the Stanford educational farm with live music, activities, and light bites, all welcome.",
      generatedAt: "2026-10-29T23:40:35.585Z",
    },
  } }));
  symlinkSync(join(repo, "node_modules"), join(sandbox, "node_modules"), "dir");
  const { resolveEventBlurbs } = await import(pathToFileURL(join(sandbox, "src/lib/south-bay/eventBlurbs.mjs")));
  const { polishReviewedEventCopy } = await import(pathToFileURL(join(sandbox, "src/lib/south-bay/eventCopyEdits.mjs")));
  for (let pass = 0; pass < 2; pass++) {
    const event = { ...occurrence };
    const stats = await resolveEventBlurbs([event], { enabled: false });
    assert.equal(stats.cache_hits, 1);
    assert.equal(stats.generated, 0);
    const actual = polishReviewedEventCopy(event);
    assert.equal(actual.blurb, "Celebrate the fall harvest at the Stanford educational farm with music, activities, and light bites. All are welcome.");
    for (const field of ["date", "time", "endTime", "cost", "venue", "url"]) assert.equal(actual[field], occurrence[field], field);
    assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  }
});

test("the farm music repair preserves a revised source and unrelated occurrences", () => {
  const original = { ...occurrence, blurb: "Enjoy live music, activities, and light bites." };
  assert.equal(applyVerifiedEventFacts(original).blurb, "Enjoy music, activities, and light bites.");
  for (const other of [
    { ...original, description: "There will be live music, activities and light bites." },
    { ...original, description: "New program details are forthcoming." },
    { ...original, date: "2027-10-30" },
    { ...original, url: "https://events.stanford.edu/event/another-festival" },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
  assert.match(original.blurb, /live music/, "the source object is not mutated");
});
