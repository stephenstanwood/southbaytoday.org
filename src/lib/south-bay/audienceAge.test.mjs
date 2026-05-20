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

test("childcare-for-ages phrase does not classify the parent event as kids", () => {
  // "Community Equity Assessment Forum" leaked into kids plans because the
  // description mentioned "childcare available for ages 4+" — the forum is
  // for adults, the childcare is a service for their kids. Strip the phrase.
  assert.equal(
    classifyAudienceAge(
      ev("Community Equity Assessment Forum", "Share feedback on city programs. Light refreshments provided; childcare available for ages 4+."),
    ),
    "all",
  );
  assert.equal(
    classifyAudienceAge(ev("Town Hall", "Childcare provided for ages 3+ during the meeting.")),
    "all",
  );
  // Real kids event still classifies as kids
  assert.equal(
    classifyAudienceAge(ev("Storytime", "Ages 4+ welcome to listen and read along.")),
    "kids",
  );
});

test("senior age phrases do NOT classify as kids", () => {
  // Before the digit-bound fix, /\bages?\s+\d{1,2}\+?\b/ matched "ages 50+",
  // "ages 55+", and "ages 65+" — silently tagging senior programs as kids.
  // Caught real misfires: "Rodent Prevention 101" (ages 55+), "Next Gen
  // Seniors - Google Search Skills" (ages 50+), "Trees and Wellness" (ages 55+).
  assert.equal(
    classifyAudienceAge(ev("Rodent Prevention 101", "Workshop for ages 55+ on rodent prevention.")),
    "all",
  );
  assert.equal(
    classifyAudienceAge(ev("Senior Tech Help", "Free for ages 50+; pre-registration required.")),
    "all",
  );
  assert.equal(
    classifyAudienceAge(ev("Community Forum", "Open to ages 18-65.")),
    "all",
  );
  // Kid ages still classify as kids
  assert.equal(classifyAudienceAge(ev("Kids Yoga", "Ages 5+ welcome.")), "kids");
  assert.equal(classifyAudienceAge(ev("Tween Hangout", "Ages 10-13.")), "kids");
  assert.equal(classifyAudienceAge(ev("Teen Lounge", "Ages 13 and up.")), "kids");
});
