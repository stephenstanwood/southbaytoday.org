import test from "node:test";
import assert from "node:assert/strict";
import { hasReversedEventSequence } from "../lib/city-briefing-integrity.mjs";

// Stanford's November 11 occurrences, verified against the organizer:
// https://events.stanford.edu/event/tangling-the-digital-weaving-printmaking-computing
// https://events.stanford.edu/event/lunchtime-recitals-communi-tea-2247
const events = [
  { title: "Tangling the Digital: Weaving, Printmaking, Computing", date: "2026-11-11", time: "1:00 PM" },
  { title: "Lunchtime Recitals & Communi-Tea", date: "2026-11-11", time: "12:15 PM" },
];

test("the Stanford briefing cannot run from a 1 PM event to a 12:15 PM recital", () => {
  const summary = "Wednesday's lineup at Stanford runs from the Tangling the Digital: Weaving, Printmaking, Computing event at McMurtry Building at 1 PM to Lunchtime Recitals & Communi-Tea at Memorial Church at 12:15 PM.";
  assert.equal(hasReversedEventSequence(summary, events), true);
  assert.equal(hasReversedEventSequence(summary.replace("12:15 PM", "12:15 p.m."), events), true);
  assert.equal(hasReversedEventSequence("Tangling the Digital is at 1 PM, followed by Lunchtime Recitals & Communi-Tea at 12:15 PM.", events), true);
  assert.equal(hasReversedEventSequence("Tangling the Digital at 1 PM, then Lunchtime Recitals & Communi-Tea at 12:15 PM.", events), true);
});

test("correct sequences and independent event choices remain eligible", () => {
  for (const summary of [
    "Wednesday runs from Lunchtime Recitals & Communi-Tea at 12:15 PM to Tangling the Digital at 1 PM.",
    "Lunchtime Recitals & Communi-Tea at 12:15 PM, followed by Tangling the Digital at 1 PM.",
    "Wednesday includes Tangling the Digital at 1 PM and Lunchtime Recitals & Communi-Tea at 12:15 PM.",
    "Choices range from Tangling the Digital to Lunchtime Recitals & Communi-Tea.",
    "Tangling the Digital runs from 1 PM to 5 PM.",
  ]) assert.equal(hasReversedEventSequence(summary, events), false, summary);
  assert.equal(hasReversedEventSequence(null, events), false);
});

test("sequence checks honor actual dates, AM/PM, unknown clocks and recurring ambiguity", () => {
  const text = "Morning Crafts is followed by Afternoon Music.";
  const rows = [
    { title: "Morning Crafts", date: "2026-11-11", time: "9:00 PM" },
    { title: "Afternoon Music", date: "2026-11-11", time: "9:00 AM" },
  ];
  assert.equal(hasReversedEventSequence(text, rows), true);
  assert.equal(hasReversedEventSequence(text, [{ ...rows[0], time: "12:00 AM" }, rows[1]]), false);
  assert.equal(hasReversedEventSequence(text, [rows[0], { ...rows[1], date: "2026-11-12" }]), false);
  assert.equal(hasReversedEventSequence(text, [rows[0], { ...rows[1], time: null }]), false);
  assert.equal(hasReversedEventSequence(text, [rows[0], { ...rows[1], time: "15:00 PM" }]), false);
  assert.equal(hasReversedEventSequence(text, [rows[0], rows[1], { ...rows[1], date: "2026-11-12" }]), false);
  assert.equal(hasReversedEventSequence("Morning Crafts at 9 PM. Afternoon Music at 9 AM.", rows), false);
});
