import { test } from "node:test";
import assert from "node:assert/strict";

import {
  APPROVED_STYLES,
  NOVEL_DIRECTIONS,
  ORIGINAL_POSTER_ART_RULE,
  assertOriginalStyleDirection,
  dayPlanPrompt,
} from "./poster-styles.mjs";

test("day-plan poster groups each activity pillar with its nearby meal", () => {
  const cards = [
    { bucket: "breakfast", name: "Orchard Bakery", city: "campbell", role: "paired-meal" },
    { bucket: "morning", name: "Hakone Gardens", city: "saratoga", role: "pillar" },
    { bucket: "lunch", name: "Pho Spot", city: "san-jose", role: "paired-meal" },
    { bucket: "afternoon", name: "Tech Interactive", city: "san-jose", role: "pillar" },
    { bucket: "dinner", name: "The Table", city: "los-gatos", role: "paired-meal" },
    { bucket: "evening", name: "Mountain Winery Concert", city: "saratoga", role: "pillar" },
  ];
  const prompt = dayPlanPrompt({ cards }, "2026-07-18", "clean editorial layout");

  assert.ok(prompt.indexOf("MORNING PICK") < prompt.indexOf("BREAKFAST NEARBY"));
  assert.ok(prompt.indexOf("AFTERNOON PICK") < prompt.indexOf("LUNCH NEARBY"));
  assert.ok(prompt.indexOf("EVENING PICK") < prompt.indexOf("DINNER NEARBY"));
  assert.match(prompt, /activity pick the large primary line/);
  assert.match(prompt, /Do not draw a route/);
});

test("poster prompts reject named third-party style references and require original branding", () => {
  for (const direction of [
    ...APPROVED_STYLES.map((style) => style.style),
    ...NOVEL_DIRECTIONS,
  ]) {
    assert.doesNotThrow(() => assertOriginalStyleDirection(direction));
  }

  assert.throws(
    () => dayPlanPrompt({ cards: [] }, "2026-07-19", "Penguin Classics book cover"),
    /third-party brand or publication/i,
  );

  const prompt = dayPlanPrompt({ cards: [] }, "2026-07-19", "original editorial poster");
  assert.ok(prompt.includes(ORIGINAL_POSTER_ART_RULE));
  assert.match(prompt, /Do not invent a South Bay Today logo, mascot, seal, or icon/);
});
