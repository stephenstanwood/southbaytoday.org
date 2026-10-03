import test from "node:test";
import assert from "node:assert/strict";
import { resolveAroundTownMeetingSources, aroundTownSourceForItem, hasUnsupportedNonDisclosureClaim, hasUnsupportedMeetingAction } from "./around-town-meetings.mjs";

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

test("a closed-session agenda cannot establish that no outcome was disclosed", () => {
  const meeting = {
    title: "5:00 P.M.-CLOSED SESSION",
    excerpt: "Conference with Legal Counsel (1 potential case): Pierce Manufacturing, Oshkosh Corporation.",
    fullAgendaText: "CLOSED SESSION REPORT. Public Employee Appointment: City Attorney.",
  };
  assert.equal(hasUnsupportedNonDisclosureClaim({
    summary: "No outcome or further detail was disclosed in the open session.",
  }, meeting), true);
  assert.equal(hasUnsupportedNonDisclosureClaim({ summary: "There was no reportable action." }, meeting), true);
  assert.equal(hasUnsupportedNonDisclosureClaim({ summary: "The outcome was not reported." }, meeting), true);
  assert.equal(hasUnsupportedNonDisclosureClaim({
    summary: "The September 22 agenda listed a potential case involving fire truck manufacturers.",
  }, meeting), false);
});

test("an explicit source report can support a non-disclosure claim", () => {
  assert.equal(hasUnsupportedNonDisclosureClaim({ summary: "There was no reportable action." }, {
    source: "youtube-transcript",
    excerpt: "The city attorney reported no reportable action from the closed session.",
  }), false);
});

test("a dated agenda does not establish a completed council discussion or hearing", () => {
  const agenda = {
    title: "Conference with Legal Counsel",
    excerpt: "Public Employee Appointment: City Attorney. Public Hearing: 408 residential units at 451-475 El Camino Real.",
  };
  for (const summary of [
    "The council met in closed session to discuss a potential legal matter.",
    "The City Council held a public hearing on the housing project.",
    "The council discussed appointing a new city attorney.",
    "The council also considered appointing a new city attorney.",
    "Public comments were also heard on the housing proposal.",
  ]) assert.equal(hasUnsupportedMeetingAction({ summary }, agenda), true);
  assert.equal(hasUnsupportedMeetingAction({
    summary: "The September 22 agenda listed a public hearing on the housing project.",
  }, agenda), false);
  assert.equal(hasUnsupportedMeetingAction({ summary: "The council heard the housing proposal." }, {
    excerpt: "The council heard the housing proposal and continued the hearing.",
  }), false);
  assert.equal(hasUnsupportedMeetingAction({ summary: "The council approved the housing proposal." }, {
    excerpt: "The council heard the housing proposal and continued the hearing.",
  }), true);
  assert.equal(hasUnsupportedMeetingAction({ summary: "The council discussed the housing proposal." }, {
    source: "youtube-transcript", excerpt: "Recorded council discussion of the housing proposal.",
  }), false);
  assert.equal(hasUnsupportedMeetingAction({ summary: "Public comments were heard on the housing proposal." }, {
    excerpt: "Public comments were heard on the housing proposal and the hearing was continued.",
  }), false);
});

test("Around Town body verification receives the full agenda instead of a clipped preview", async () => {
  let observedText;
  await resolveAroundTownMeetingSources(config, [{
    ...meetings[0], excerpt: "Participation instructions", fullAgendaText: "Cubberley property negotiations",
  }], {
    verifyPrimeGov: async (_host, _date, text) => {
      observedText = text;
      return { body: null, councilMet: true, sourceUrl: councilUrl };
    },
  });
  assert.match(observedText, /Cubberley property negotiations/);
  assert.doesNotMatch(observedText, /Participation instructions/);
});
