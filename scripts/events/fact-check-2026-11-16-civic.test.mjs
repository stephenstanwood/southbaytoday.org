import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { legistarEventBodyName, verifyLegistarBodyOnDate } from "../lib/civic-meetings.mjs";
import { fetchNextMeeting } from "../generate-upcoming-meetings.mjs";
import { briefingMeetingContext, briefingMeetingHighlight } from "../lib/city-briefing-integrity.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/cupertino-public-facilities-2026-11-16.json", import.meta.url)));
const corporation = fixture.events.find(event => event.EventId === 5376);

test("Cupertino's generic council category does not misattribute its Corporation agenda", async t => {
  t.mock.method(globalThis, "fetch", async url => {
    assert.equal(new URL(url).hostname, "webapi.legistar.com");
    return Response.json(String(url).endsWith("/EventItems") ? fixture.items : fixture.events);
  });
  const actual = await verifyLegistarBodyOnDate("cupertino", "2026-11-16", fixture.recordText);
  assert.equal(actual.body, "Cupertino Public Facilities Corporation");
  assert.equal(actual.sourceUrl, corporation.EventInSiteURL);
  assert.notEqual(actual.councilMet, true);
});

test("the upcoming civic record carries the Corporation name and its actual source", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-17T04:43:32Z") });
  t.mock.method(globalThis, "fetch", async url => Response.json(
    String(url).endsWith("/EventItems") ? fixture.items : [corporation],
  ));
  const meeting = await fetchNextMeeting("cupertino", "cupertino", "City Council");
  assert.equal(meeting.bodyName, "Cupertino Public Facilities Corporation");
  assert.equal(meeting.date, "2026-11-16");
  assert.equal(meeting.startTime, "19:00");
  assert.equal(meeting.url, corporation.EventInSiteURL);
  assert.equal(meeting.confirmation.observedDate, "2026-11-16");
  const context = briefingMeetingContext(meeting, meeting.agendaItems.map(item => item.title).join("\n"));
  assert.match(context, /^Next Cupertino Public Facilities Corporation meeting/);
  assert.doesNotMatch(context, /council/i);
  const highlight = briefingMeetingHighlight(meeting, meeting.agendaItems[0]);
  assert.equal(highlight.type, "cityhall");
  assert.equal(highlight.venue, "Cupertino Public Facilities Corporation");
  assert.equal(highlight.url, corporation.EventInSiteURL);
});

test("incidental Corporation mentions and ordinary council comments retain their actual body", () => {
  for (const comment of [null, "Special Meeting", "Regular Meeting", "Discussion of Cupertino Public Facilities Corporation", "City Council and Cupertino Public Facilities Corporation Joint Meeting"]) {
    assert.equal(legistarEventBodyName({ ...corporation, EventComment: comment }), "City Council");
  }
  assert.equal(legistarEventBodyName({ ...corporation, EventBodyName: "Planning Commission" }), "Planning Commission");
  const council = { bodyName: "City Council and Authorities Concurrent", displayDate: "Tue, Nov 17", url: "https://santaclara.legistar.com/" };
  assert.match(briefingMeetingContext(council, "Financial reports"), /^Next City Council and Authorities Concurrent meeting/);
  assert.equal(briefingMeetingHighlight(council, { title: "Financial reports." }).type, "council");
  assert.equal(briefingMeetingContext(council, ""), "");
});
