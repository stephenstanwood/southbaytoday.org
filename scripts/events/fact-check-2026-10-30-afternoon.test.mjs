import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/reviewed-event-copy-2026-10-30-midday.json", import.meta.url)));
const printCopy = fixture.cases.find((entry) => entry.events[0].id === "sjpl-6ad7b5ac377296003a4d47e1");
const event = {
  ...printCopy.events[0], date: "2026-11-03", time: "4:00 PM", endTime: "6:00 PM",
  venue: "Calabazas Library", cost: "free", registration: "full",
  description: printCopy.reviewed,
};

// The exact library occurrence publishes both 105-minute and 45-minute
// print limits. Neither establishes which designs the branch will accept.
test("Calabazas print-limit conflict is disclosed without choosing a limit or reopening registration", () => {
  for (const description of [printCopy.refreshed, printCopy.reviewed]) {
    for (const url of [event.url, event.url.replace("/events/", "/v2/events/") + "?ref=calendar"]) {
      const input = { ...event, url, description, attendanceNote: "One appointment per month per person." };
      const corrected = applyVerifiedEventFacts(input);
      assert.match(corrected.attendanceNote, /conflicting print-time limits \(45 minutes and 1 hour 45 minutes\)/);
      assert.match(corrected.attendanceNote, /Calabazas Library at cz\.sjpl@sjlibrary\.org/);
      assert.ok(corrected.attendanceNote.startsWith(input.attendanceNote));
      assert.deepEqual({ ...corrected, attendanceNote: input.attendanceNote }, input);
      assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
    }
  }
});

test("a resolved source or unrelated occurrence does not inherit the print-limit warning", () => {
  for (const input of [
    { ...event, date: "2026-12-03" },
    { ...event, url: "https://sjpl.bibliocommons.com/events/another-occurrence" },
    { ...event, description: event.description.replace("Designs must print in 1 hour 45 minutes", "Please bring a small design") },
    { ...event, description: event.description.replace(" and have a print time of under 45 minutes", "") },
  ]) assert.deepEqual(applyVerifiedEventFacts(input), input);
});
