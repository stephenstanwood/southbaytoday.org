import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { midpenDetailConfirmsEvent, parseMidpenDetail, recheckMidpenEvent } from "../lib/midpen-events.mjs";

const portal = readFileSync(new URL("../lib/fixtures/midpen-volunteer-occurrence.html", import.meta.url), "utf8");
const prior = {
  id: "midpen-0eaebbb08c553a71",
  title: "Sierra Azul Preserve - Trail Maintenance: Mt. Umunhum Trail (Pt. 7)",
  source: "Midpen Open Space",
  url: "https://www.openspace.org/events/volunteer-projects/sierra-azul-preserve-trail-maintenance-mt-umunhum-trail-pt-7",
  date: "2026-12-17",
  time: "9:30 AM",
  endTime: "2:00 PM",
  venue: "Sierra Azul Preserve",
  address: "535X+XQ San Jose, California 95120",
  registration: "required",
  attendanceNote: "Ages 14 and older. Register by Dec 16, 2026.",
};
const today = "2026-11-16";

test("the volunteer portal confirms the omitted December 17 workday without using its deadline", () => {
  const detail = parseMidpenDetail(portal);
  assert.equal(detail.title, prior.title);
  assert.equal(detail.date, prior.date);
  assert.equal(detail.startTime, prior.time);
  assert.equal(detail.endTime, prior.endTime);
  assert.equal(midpenDetailConfirmsEvent(portal, prior, today), true);
  assert.deepEqual(recheckMidpenEvent(portal, prior, today), prior);
});

test("the omitted-event recheck retains the page's current capacity and finish time", () => {
  assert.deepEqual(recheckMidpenEvent(portal, { ...prior, registration: "full" }, today), prior);
  assert.deepEqual(recheckMidpenEvent(portal.replace("1 open spots", "0 open spots"), prior, today), {
    ...prior, registration: "full",
  });
  assert.deepEqual(recheckMidpenEvent(portal.replace("2:00 p.m.", "3:00 p.m."), prior, today), {
    ...prior, endTime: "3:00 PM",
  });
  const unknownCapacity = portal.replace("1 open spots", "Capacity not published");
  assert.equal(recheckMidpenEvent(unknownCapacity, { ...prior, registration: "full" }, today).registration, "full");
});

test("changed, past and unverifiable occurrences cannot be recovered", () => {
  for (const change of [
    { source: "Another organizer" }, { title: "Another activity" },
    { date: "2027-12-17" }, { time: "10:30 AM" }, { time: null },
  ]) assert.equal(recheckMidpenEvent(portal, { ...prior, ...change }, today), null);
  assert.equal(recheckMidpenEvent(portal, prior, "2026-12-18"), null);
  assert.equal(recheckMidpenEvent("<html>Unavailable</html>", prior, today), null);
  const withoutDate = portal.replace("Happens On Dec 17, 2026", "Date not published");
  const narrative = "<p>Register by Dec 16, 2026. A previous workday happened on Dec 17, 2026.</p>";
  assert.equal(recheckMidpenEvent(withoutDate + narrative, prior, today), null);
  assert.equal(recheckMidpenEvent(portal.replace("Happens On Dec 17, 2026", "Happens On Dec 17, 2026 through Dec 18, 2026"), prior, today), null);
  const twoDates = portal.replace("Happens On Dec 17, 2026", "Happens On Dec 17, 2026</td></tr><tr><td class='text'>Happens On Dec 18, 2026");
  assert.equal(recheckMidpenEvent(twoDates, prior, today), null);
});
