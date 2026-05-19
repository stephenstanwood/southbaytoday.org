// Tests for audienceAge classifier — pinned to lock in the cycle-174 fix
// where /\b21\s*\+\b/ silently matched nothing because \b after a non-word
// "+" only fires when followed by a word char (and real "21+" copy is
// followed by space/punct/EOL). Pattern lost its trailing \b in the fix.

import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyAudienceAge } from "./audienceAge.mjs";

const ev = (title, description = "") => ({ title, description });

test("21+ trailing-context variants all classify as adult", () => {
  // These all need to fire — they're what real Ticketmaster blurbs look like.
  // The pre-fix regex required a word char after "+", which made all of
  // these miss and tag as "all".
  assert.equal(
    classifyAudienceAge(ev("The Emo Night Tour", "Coming to The Ritz! *21+..... Doors 8pm.")),
    "adult",
  );
  assert.equal(
    classifyAudienceAge(ev("Reggaeton Fiesta", "🍑 21+ Dame Ms Gasolina")),
    "adult",
  );
  assert.equal(classifyAudienceAge(ev("Late Night Comedy", "21+ event tonight.")), "adult");
  assert.equal(classifyAudienceAge(ev("Whiskey Pour", "18+ only, ID required.")), "adult");
});

test("21 and over / adults only still classify as adult", () => {
  assert.equal(classifyAudienceAge(ev("Wine Walk", "21 and over.")), "adult");
  assert.equal(classifyAudienceAge(ev("Speakeasy Night", "Adults only.")), "adult");
});

test("kids signals still win on kids-only events", () => {
  assert.equal(classifyAudienceAge(ev("Toddler Story Time", "Ages 2-4.")), "kids");
  assert.equal(classifyAudienceAge(ev("Kindergarten Craft Hour", "")), "kids");
});

test("ambiguous / default cases stay 'all'", () => {
  assert.equal(classifyAudienceAge(ev("Saturday at the Park", "Family friendly afternoon.")), "all");
  assert.equal(classifyAudienceAge(ev("Live Music at the Brewery", "Beer garden open, food trucks.")), "all");
});
