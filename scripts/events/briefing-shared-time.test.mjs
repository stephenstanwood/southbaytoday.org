import test from "node:test";
import assert from "node:assert/strict";
import { hasUnsupportedSharedEventTime } from "../lib/city-briefing-integrity.mjs";

// Exact November 10 library records, verified November 7, 2026:
// https://sccl.bibliocommons.com/events/6a55bdc71006a63d00224466
// https://sccl.bibliocommons.com/events/6a46b7bd7e16a03d00e9b7e8
const events = [
  { title: "Baby Bouncers Lapsit for Prewalkers", time: "11:30 AM" },
  { title: "Bilingual Family Storytime", time: "6:30 PM" },
];

test("a shortened library title cannot inherit the neighboring program's evening clock", () => {
  const summary = "Milpitas Library has Monday's Science Fiction and Fantasy Book Club on Ken Liu's The Grace of Kings at 7 PM, plus Tuesday's Baby Bouncers Lapsit and Bilingual Family Storytime at 6:30 PM.";
  assert.equal(hasUnsupportedSharedEventTime(summary, events), true);
  assert.equal(hasUnsupportedSharedEventTime(summary.replace("6:30 PM", "6:30 p.m."), events), true);
  assert.equal(hasUnsupportedSharedEventTime(summary.replace("6:30 PM", "11:30 AM"), events), true);
});

test("separate sourced starts, omitted clocks and explicit finish times remain eligible", () => {
  for (const summary of [
    "Tuesday brings Baby Bouncers Lapsit at 11:30 AM and Bilingual Family Storytime at 6:30 PM.",
    "Tuesday brings Baby Bouncers Lapsit and Bilingual Family Storytime.",
    "Baby Bouncers Lapsit is Tuesday; Bilingual Family Storytime is at 6:30 PM.",
    "Baby Bouncers Lapsit and Bilingual Family Storytime finish at 6:30 PM.",
  ]) assert.equal(hasUnsupportedSharedEventTime(summary, events), false, summary);
});

test("shared starts need evidence for each title; repeated occurrences are one program", () => {
  const shared = "Baby Bouncers Lapsit and Bilingual Family Storytime both start at 6:30 PM.";
  assert.equal(hasUnsupportedSharedEventTime(shared, events.map(event => ({ ...event, time: "6:30 PM" }))), false);
  assert.equal(hasUnsupportedSharedEventTime(shared, [{ ...events[0], time: null }, events[1]]), true);
  assert.equal(hasUnsupportedSharedEventTime(shared, [...events, { ...events[0], time: "6:30 PM" }]), false);
  assert.equal(hasUnsupportedSharedEventTime("Baby Bouncers Lapsit starts at 6:30 PM.", [events[0], { ...events[0] }]), false);
  assert.equal(hasUnsupportedSharedEventTime(null, events), false);
});
