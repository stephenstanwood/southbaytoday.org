import test from "node:test";
import assert from "node:assert/strict";
import { resolveAroundTownMeetingSources, aroundTownSourceForItem } from "./around-town-meetings.mjs";

const config = {
  primegov: "cityofpaloalto.primegov.com",
  agendaUrl: "https://www.paloalto.gov/City-Hall/City-Council/Council-Agendas-Minutes",
};
const councilUrl = "https://cityofpaloalto.primegov.com/Portal/Meeting?compiledMeetingDocumentFileId=21568";
const parksUrl = "https://cityofpaloalto.primegov.com/Portal/Meeting?compiledMeetingDocumentFileId=21587";
const meetings = [
  { id: 7196, date: "2026-09-22", title: "CONFERENCE WITH REAL PROPERTY NEGOTIATORS", excerpt: "Cubberley Site" },
  { id: 7197, date: "2026-09-22", title: "Council Liaison Report", excerpt: "Playground Synthetic Turf Use Guidelines" },
];

test("same-day Council and Parks records retain separate body and agenda provenance", async () => {
  const sources = await resolveAroundTownMeetingSources(config, meetings, {
    verifyPrimeGov: async (_host, _date, text) => text.includes("Cubberley")
      ? { body: null, councilMet: true, sourceUrl: councilUrl }
      : { body: "Parks and Recreation Commission", sourceUrl: parksUrl },
  });
  assert.deepEqual(aroundTownSourceForItem({ sourceRecordId: "7196", date: "2026-09-22" }, sources), {
    body: "City Council", sourceUrl: councilUrl, date: "2026-09-22",
  });
  assert.equal(aroundTownSourceForItem({ sourceRecordId: 7197, date: "2026-09-22" }, sources).sourceUrl, parksUrl);
  assert.equal(sources.get("7197").body, "Parks and Recreation Commission");
  assert.equal(aroundTownSourceForItem({ date: "2026-09-22" }, sources), null);
  assert.equal(aroundTownSourceForItem({ sourceRecordId: 9999, date: "2026-09-22" }, sources), null);
  assert.equal(aroundTownSourceForItem({ sourceRecordId: 7196, date: "2026-09-23" }, sources), null);
});

test("failed and ambiguous verification cannot publish an unchecked Council record", async () => {
  for (const answer of [null, { body: null, councilMet: false }]) {
    const sources = await resolveAroundTownMeetingSources(config, meetings, { verifyPrimeGov: async () => answer });
    assert.equal(sources.size, 0);
  }
  const sources = await resolveAroundTownMeetingSources(config, meetings, {
    verifyPrimeGov: async () => { throw new Error("upstream unavailable"); },
  });
  assert.equal(sources.size, 0);
});

test("cities without a verifier still bind highlights to supplied records", async () => {
  const sources = await resolveAroundTownMeetingSources({ agendaUrl: "https://example.gov/agendas" }, meetings);
  assert.equal(sources.size, 2);
  assert.equal(aroundTownSourceForItem({ sourceRecordId: 7196, date: "2026-09-22" }, sources).sourceUrl, "https://example.gov/agendas");
  assert.equal(aroundTownSourceForItem({ sourceRecordId: "", date: "2026-09-22" }, sources), null);
});
