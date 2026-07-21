import assert from "node:assert/strict";
import test from "node:test";

import {
  confirmMeeting,
  legistarMeetingUrl,
  onlyConfirmedMeetings,
  pickCivicClerkMeeting,
} from "./civic-meetings.mjs";

test("Legistar links use the provider-owned public URL instead of rebuilding API ids", () => {
  const providerUrl = "https://cupertino.legistar.com/MeetingDetail.aspx?LEGID=5295&GID=341&G=74359C04-A5F0-4CB2-A97A-0032996BB90E";
  assert.equal(legistarMeetingUrl("cupertino", "2026-07-21", providerUrl), providerUrl);
  assert.equal(
    legistarMeetingUrl("cupertino", "2026-07-21", "https://evil.example/MeetingDetail.aspx?LEGID=5295"),
    "https://cupertino.legistar.com/Calendar.aspx?From=7%2F21%2F2026&To=7%2F21%2F2026",
  );
});

test("the publication gate rejects projected or date-mismatched meetings", () => {
  const projected = { date: "2026-07-21", bodyName: "City Council" };
  const mismatched = confirmMeeting(projected, {
    provider: "civicclerk",
    sourceUrl: "https://www.milpitas.gov/129/Agendas-Minutes",
    observedDate: "2026-07-22",
  });
  const confirmed = confirmMeeting(projected, {
    provider: "civicclerk",
    sourceUrl: "https://www.milpitas.gov/129/Agendas-Minutes",
  });

  assert.equal(mismatched, null);
  assert.deepEqual(Object.keys(onlyConfirmedMeetings({ projected, mismatched, confirmed })), ["confirmed"]);
});

test("CivicClerk selection publishes only concrete, current, non-cancelled events", () => {
  assert.equal(pickCivicClerkMeeting([], "2026-07-21"), null);
  const selected = pickCivicClerkMeeting([
    { id: 1, categoryName: "City Council", eventName: "City Council Meeting - CANCELLED", eventDate: "2026-07-21T19:00:00Z" },
    { id: 2, categoryName: "Planning Commission", eventName: "Planning Commission", eventDate: "2026-07-22T19:00:00Z" },
    { id: 3, categoryName: "City Council", eventName: "City Council Meeting", eventDate: "2026-08-04T19:00:00Z" },
  ], "2026-07-21");
  assert.equal(selected?.id, 3);
});
