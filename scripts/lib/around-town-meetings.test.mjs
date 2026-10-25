import test from "node:test";
import assert from "node:assert/strict";
import { resolveAroundTownMeetingSources, aroundTownSourceForItem, hasUnsupportedNonDisclosureClaim, hasUnsupportedMeetingAction, hasPastAgendaFutureFraming, hasUnscopedMeetingCancellation } from "./around-town-meetings.mjs";

test("a regular-meeting cancellation cannot hide a separate joint special meeting", () => {
  const meeting = {
    fullAgendaText: "Review October 13, 2026 Final Agenda. - Cancelled. Joint City of San José and Santa Clara Valley Water District Special\nMeeting.",
  };
  assert.equal(hasUnscopedMeetingCancellation({ summary: "The October 13, 2026 meeting was cancelled." }, meeting), true);
  assert.equal(hasUnscopedMeetingCancellation({ keyTopics: ["October 13 meeting canceled"] }, meeting), true);
  assert.equal(hasUnscopedMeetingCancellation({ summary: "The regular October 13 City Council meeting was canceled; a separate joint special meeting remains scheduled." }, meeting), false);
  assert.equal(hasUnscopedMeetingCancellation({ summary: "The October 13 meeting was canceled." }, { excerpt: "October 13 meeting canceled." }), false);
  assert.equal(hasUnscopedMeetingCancellation({ summary: "The agenda listed a joint special meeting." }, meeting), false);
});

test("old agendas cannot describe their hearing or appointment as upcoming", () => {
  const meeting = { date: "2026-09-30", excerpt: "Proposed use permit" };
  for (const text of [
    "The Zoning Administrator is scheduled to consider a use permit.",
    "Council to discuss appointing new City Attorney",
    "Council weighs legal action against fire truck makers",
  ]) {
    assert.equal(hasPastAgendaFutureFraming({ date: "2026-09-30", headline: text }, meeting, "2026-10-04"), true);
  }
  assert.equal(hasPastAgendaFutureFraming({
    date: "2026-09-30", summary: "The September 30 agenda listed a use permit for Chabad of Sunnyvale.",
  }, meeting, "2026-10-04"), false);
  const future = { date: "2026-10-06", headline: "Council will consider a use permit" };
  assert.equal(hasPastAgendaFutureFraming(future, meeting, "2026-10-04"), false);
  assert.equal(hasPastAgendaFutureFraming(future, meeting, "2026-10-06"), false);
  assert.equal(hasPastAgendaFutureFraming({ ...future, date: "2026-09-30" }, { source: "youtube-transcript" }, "2026-10-04"), false);
});

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

test("a planning ingest label cannot override a verified Zoning Administrator hearing", async () => {
  const sourceUrl = "https://sunnyvaleca.legistar.com/MeetingDetail.aspx?LEGID=4568";
  const sources = await resolveAroundTownMeetingSources({ legistarApi: "sunnyvaleca" }, [{
    id: 26, date: "2026-09-30", meetingType: "Planning Commission",
    title: "Use permit at 645 W. Fremont Avenue", excerpt: "Chabad of Sunnyvale, PLNG-2026-0312",
  }], {
    fallbackBody: "City hearing",
    verifyLegistar: async (client, date, text) => {
      assert.equal(client, "sunnyvaleca");
      assert.equal(date, "2026-09-30");
      assert.match(text, /PLNG-2026-0312/);
      return { body: "Zoning Administrator Hearing", sourceUrl };
    },
  });
  assert.deepEqual(aroundTownSourceForItem({ sourceRecordId: 26, date: "2026-09-30" }, sources), {
    body: "Zoning Administrator Hearing", sourceUrl, date: "2026-09-30",
  });
  const fallback = await resolveAroundTownMeetingSources({ agendaUrl: "https://example.gov/agendas" }, [meetings[0]], {
    fallbackBody: "City hearing",
  });
  assert.equal(fallback.get("7196").body, "City hearing");
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

test("an applicant-interview agenda does not establish interviews took place", () => {
  const agenda = { fullAgendaText: "October 20, 2026 City Council agenda. Study Session: Environmental Planning Commission Applicant Interviews." };
  const summary = "The agenda shows council members were interviewing candidates for seats on that commission.";
  assert.equal(hasUnsupportedMeetingAction({ summary }, agenda), true);
  assert.equal(hasUnsupportedMeetingAction({ summary: "The council was reviewing the applicants." }, agenda), true);
  assert.equal(hasUnsupportedMeetingAction({ summary: "The October 20 agenda listed applicant interviews." }, agenda), false);
  assert.equal(hasUnsupportedMeetingAction({ summary }, { fullAgendaText: summary }), false);
  assert.equal(hasUnsupportedMeetingAction({ summary }, { ...agenda, source: "youtube-transcript" }), false);
});

test("a past study-session agenda cannot be advertised as newly set for interviews", () => {
  const item = { date: "2026-10-20", headline: "Council study session set for Environmental Planning Commission applicant interviews" };
  assert.equal(hasPastAgendaFutureFraming(item, {}, "2026-10-24"), true);
  assert.equal(hasPastAgendaFutureFraming(item, {}, "2026-10-20"), false);
  assert.equal(hasPastAgendaFutureFraming(item, {}, "2026-10-19"), false);
  assert.equal(hasPastAgendaFutureFraming(item, { source: "youtube-transcript" }, "2026-10-24"), false);
  assert.equal(hasPastAgendaFutureFraming({
    date: item.date, summary: "The October 20 agenda listed a study session set for applicant interviews.",
  }, {}, "2026-10-24"), false);
});

test("a study-session agenda cannot establish what the session covered", () => {
  const agenda = { fullAgendaText: "6 P.M. SPECIAL PLANNING COMMISSION MEETING (Study Session). Proposed Project: Peery Park Specific Plan Amendment." };
  const summary = "A special Planning Commission study session on October 12 covered a proposed amendment to the Peery Park Specific Plan.";
  assert.equal(hasUnsupportedMeetingAction({ summary }, agenda), true);
  assert.equal(hasUnsupportedMeetingAction({ summary: "The October 12 agenda listed a study session on the proposed amendment." }, agenda), false);
  assert.equal(hasUnsupportedMeetingAction({ summary }, { fullAgendaText: summary }), false);
  assert.equal(hasUnsupportedMeetingAction({ summary }, { ...agenda, source: "youtube-transcript" }), false);
});

test("proposed agenda actions cannot become a list of notable decisions", () => {
  const agenda = { fullAgendaText: "Hakone Gardens Koi Pond Renovation Project – Budget Amendment. Recommended Action: Adopt the Resolution amending the budget for $2,500,000." };
  const summary = "The agenda listed several notable decisions: a $2.5 million budget amendment and a new no-parking zone.";
  assert.equal(hasUnsupportedMeetingAction({ summary }, agenda), true);
  assert.equal(hasUnsupportedMeetingAction({ summary: "The agenda listed items for consideration: a proposed budget amendment and a no-parking zone." }, agenda), false);
  assert.equal(hasUnsupportedMeetingAction({ summary: "The agenda listed a decision on the long-term law enforcement provider." }, agenda), false);
  assert.equal(hasUnsupportedMeetingAction({ summary }, { fullAgendaText: summary }), false);
  assert.equal(hasUnsupportedMeetingAction({ summary }, { ...agenda, source: "youtube-transcript" }), false);
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

test("closed-session agenda language cannot become ongoing talks in a headline", () => {
  const agenda = { fullAgendaText: "Property: 10480 Finch Avenue. Under Negotiation: Price and terms of payment." };
  assert.equal(hasUnsupportedMeetingAction({ headline: "City in closed talks over Finch Avenue property" }, agenda), true);
  assert.equal(hasUnsupportedMeetingAction({ headline: "Finch Avenue property negotiations listed on October 6 council agenda" }, agenda), false);
  assert.equal(hasUnsupportedMeetingAction({ headline: "City in closed talks over Finch Avenue property" }, {
    excerpt: "The city is in closed talks over Finch Avenue property.",
  }), false);
});

test("past commission and permit agendas do not establish current pending action", () => {
  for (const headline of [
    "Human Relations panel to weigh in on housing bond measure",
    "Chabad seeks permit for Sunnyvale worship space",
  ]) {
    const item = { date: "2026-09-29", headline };
    assert.equal(hasPastAgendaFutureFraming(item, {}, "2026-10-09"), true);
    assert.equal(hasPastAgendaFutureFraming(item, {}, "2026-09-29"), false);
    assert.equal(hasPastAgendaFutureFraming(item, { source: "youtube-transcript" }, "2026-10-09"), false);
  }
});

test("past agendas cannot become present-tense interview or pay headlines", () => {
  const agenda = {
    date: "2026-10-09",
    fullAgendaText: "CLOSED SESSION: Public Employee Appointment: City Attorney.",
  };
  for (const headline of [
    "Council holds closed-session interviews for new city attorney",
    "Council holds second day of city attorney interviews",
    "Council to address city attorney transition, manager's pay",
    "Council will address the city attorney transition",
    "Task force reviews the draft Station Area plan",
  ]) {
    const item = { date: "2026-10-09", headline };
    assert.equal(hasPastAgendaFutureFraming(item, agenda, "2026-10-18"), true, headline);
    assert.equal(hasPastAgendaFutureFraming(item, agenda, "2026-10-09"), false);
    assert.equal(hasPastAgendaFutureFraming(item, agenda, "2026-10-08"), false);
    assert.equal(hasPastAgendaFutureFraming(item, { ...agenda, source: "youtube-transcript" }, "2026-10-18"), false);
  }
  assert.equal(hasPastAgendaFutureFraming({
    date: "2026-10-09", headline: "October 9 agenda listed city attorney interviews",
  }, agenda, "2026-10-18"), false);
  const summary = "The October 9 agenda listed a closed session for City Council to interview candidates for the City Attorney position.";
  assert.equal(hasPastAgendaFutureFraming({ date: "2026-10-09", summary }, agenda, "2026-10-18"), false);
  assert.equal(hasPastAgendaFutureFraming({
    date: "2026-10-09", headline: "Council holds city attorney interviews", summary,
  }, agenda, "2026-10-18"), true, "a source-qualified summary cannot excuse a false headline");
  assert.equal(hasPastAgendaFutureFraming({
    date: "2026-10-09", summary: `${summary} The council holds the interviews.`,
  }, agenda, "2026-10-18"), true, "agenda context does not carry into another sentence");
});

test("a task-force agenda cannot establish that the task force reviewed a plan", () => {
  const agenda = {
    fullAgendaText: "Station Area Task Force. Public Hearing: Benton-Brokaw Multimodal Crossing Feasibility Study. Review of the Complete Draft Specific Plan.",
  };
  const headline = "Task force reviewed draft Station Area plan, crossing study";
  assert.equal(hasUnsupportedMeetingAction({ headline }, agenda), true);
  assert.equal(hasUnsupportedMeetingAction({
    headline: "October 15 task force agenda listed Station Area plan, crossing study",
  }, agenda), false);
  assert.equal(hasUnsupportedMeetingAction({ headline }, {
    excerpt: "The task force reviewed the draft Station Area plan and the crossing study.",
  }), false);
  assert.equal(hasUnsupportedMeetingAction({ headline }, { ...agenda, source: "youtube-transcript" }), false);
});
