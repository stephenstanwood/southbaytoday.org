// ---------------------------------------------------------------------------
// time-references.test.mjs
//
// Unit tests for the scheduled-social copy rewriter. The cases below codify
// what was broken on 2026-05-11 (idiomatic "on a Monday" → "on a Today" went
// live on X/Threads/Facebook/Instagram) so the regression doesn't come back.
//
// Run: node --test scripts/social/lib/time-references.test.mjs
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";
import { rewriteTimeReferences } from "./time-references.mjs";

// All test cases anchor on Monday 2026-05-11 at 7:00 PM PT. PT-time arg is
// supplied directly so tests are deterministic and TZ-independent.
const MONDAY = "2026-05-11";
const PT_7PM = new Date("2026-05-11T19:00:00-07:00");

function rewrite(text, { date = MONDAY, time = "7:30 PM", pt = PT_7PM } = {}) {
  return rewriteTimeReferences(text, { date, time }, pt);
}

test("preserves idiomatic 'on a Monday' (the 2026-05-11 bug)", () => {
  const input = "Great excuse to get out of the house on a Monday and actually use your brain.";
  assert.equal(rewrite(input), input);
});

test("preserves 'kind of Monday night' idiom", () => {
  const input = "Trivia at Dr. Funk is exactly the kind of Monday night you'll actually remember.";
  assert.equal(rewrite(input), input);
});

test("preserves 'Monday just got a reason' personification", () => {
  const input = "Monday just got a reason to exist.";
  assert.equal(rewrite(input), input);
});

test("preserves 'through a Monday' idiom", () => {
  const input = "What better way to get through a Monday than trivia?";
  assert.equal(rewrite(input), input);
});

test("preserves plural 'Trivia Mondays' (event title)", () => {
  const input = "Tonight in San Jose: Trivia Mondays at Dr. Funk kicks off at 7:30 PM.";
  // "Mondays at" — \bMonday\b only matches at word boundaries, so the plural
  // 's' blocks it. Sanity-check that explicitly.
  assert.equal(rewrite(input), input);
});

test("'On Monday at 7 PM' → 'Today at 7 PM' (scheduling ref, start of sentence)", () => {
  assert.equal(
    rewrite("On Monday at 7 PM, head to Dr. Funk for trivia."),
    "Today at 7 PM, head to Dr. Funk for trivia.",
  );
});

test("'on Monday at noon' → 'today at noon' (mid-sentence lowercase)", () => {
  assert.equal(
    rewrite("Head over on Monday at noon for trivia."),
    "Head over today at noon for trivia.",
  );
});

test("'Monday at 7:30pm' → 'Today at 7:30pm' (no 'on', bare day + time)", () => {
  assert.equal(
    rewrite("Monday at 7:30pm — Dr. Funk."),
    "Today at 7:30pm — Dr. Funk.",
  );
});

test("'Monday @ 7 PM' → 'Today @ 7 PM' (at-sign variant)", () => {
  assert.equal(
    rewrite("Trivia Monday @ 7 PM at Dr. Funk."),
    "Trivia Today @ 7 PM at Dr. Funk.",
  );
});

test("'Monday 7pm' → 'Today 7pm' (no 'at', bare time)", () => {
  assert.equal(
    rewrite("Doors Monday 7pm."),
    "Doors Today 7pm.",
  );
});

test("'Monday's trivia' → 'Today's trivia' (possessive)", () => {
  assert.equal(
    rewrite("Don't miss Monday's trivia."),
    "Don't miss Today's trivia.",
  );
});

test("'This Monday at 7' → 'Today at 7' (whole-phrase, no 'this today' fragment)", () => {
  assert.equal(
    rewrite("This Monday at 7 PM, head to Dr. Funk."),
    "Today at 7 PM, head to Dr. Funk.",
  );
});

test("'this Monday' → 'today' (lowercase, mid-sentence)", () => {
  assert.equal(
    rewrite("I'm going this Monday."),
    "I'm going today.",
  );
});

test("'On Monday's trivia' applies the 'on <Day>' rule first → 'Today's trivia'", () => {
  // "on <Day>" runs before the possessive rule, so the whole "On Monday" gets
  // swapped before the possessive even has a chance to fire on "Monday's".
  assert.equal(
    rewrite("On Monday's trivia night, things go off."),
    "Today's trivia night, things go off.",
  );
});

test("event tomorrow: 'Monday at 7 PM' → 'Tomorrow at 7 PM'", () => {
  // Publishing on Sunday 2026-05-10 for a Monday 2026-05-11 event.
  const pt = new Date("2026-05-10T10:00:00-07:00");
  assert.equal(
    rewriteTimeReferences("Monday at 7 PM at Dr. Funk.", { date: MONDAY, time: "7:30 PM" }, pt),
    "Tomorrow at 7 PM at Dr. Funk.",
  );
});

test("event 3+ days out: day name preserved (no rewrite)", () => {
  // Publishing on Friday 2026-05-08 for a Monday 2026-05-11 event — relative
  // label is "Monday" itself, so the rewriter early-returns.
  const pt = new Date("2026-05-08T10:00:00-07:00");
  const input = "On Monday at 7 PM, head to Dr. Funk.";
  assert.equal(
    rewriteTimeReferences(input, { date: MONDAY, time: "7:30 PM" }, pt),
    input,
  );
});

test("'tomorrow' → 'today' when event is actually today (copy generated yesterday)", () => {
  assert.equal(
    rewrite("Trivia is tomorrow at 7 PM."),
    "Trivia is today at 7 PM.",
  );
});

test("'this afternoon' → 'tonight' when publish hour and event hour are both ≥ 5pm", () => {
  // PT_7PM is 7pm, event 7:30pm — both ≥ 17.
  assert.equal(
    rewrite("Trivia this afternoon at Dr. Funk."),
    "Trivia tonight at Dr. Funk.",
  );
});

test("does not touch unrelated day names", () => {
  // Event is Monday — rewriter shouldn't see "Friday" anywhere.
  assert.equal(
    rewrite("Trivia Monday at 7 PM. Friday is karaoke."),
    "Trivia Today at 7 PM. Friday is karaoke.",
  );
});

test("preserves case for whole-phrase 'On Monday' at start of sentence", () => {
  assert.equal(rewrite("On Monday at 7."), "Today at 7.");
});

test("preserves lowercase for whole-phrase 'on Monday' mid-sentence", () => {
  assert.equal(rewrite("Be there on Monday at 7."), "Be there today at 7.");
});
