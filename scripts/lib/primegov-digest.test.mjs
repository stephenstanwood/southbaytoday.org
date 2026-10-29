import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fetchPrimeGovPastMeeting, verifyPrimeGovBodyOnDate } from "./civic-meetings.mjs";
import { recoverPrimeGovDigestSource } from "./digest-source.mjs";

const domain = "cityofpaloalto.primegov.com";
const read = (name) => readFileSync(new URL(`../fixtures/primegov/${name}`, import.meta.url), "utf8");
const archive = JSON.parse(read("archive-2026.json"));
const council = read("council-oct26.html");
const stormwater = read("stormwater-oct22.html");
const options = { domain, committeeId: 9, today: "2026-10-28" };
const json = (data) => new Response(JSON.stringify(data));
async function withFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try { return await run(); } finally { globalThis.fetch = original; }
}
function sourceFetch(url) {
  const u = String(url);
  if (u.includes("ListArchivedMeetings")) return json(u.includes("year=2025") ? [] : archive);
  if (u.endsWith("compiledMeetingDocumentFileId=21874")) return new Response(council);
  if (u.endsWith("compiledMeetingDocumentFileId=21819")) return new Response(stormwater);
  throw new Error(`Unexpected source ${u}`);
}

test("PrimeGov recovery filters committee records locally and cites the exact Council document", async () => {
  const calls = [];
  const row = archive.find((m) => m.id === 2906);
  const distractors = [
    { ...row, id: 9001, dateTime: "2026-11-02T17:30:00" },
    { ...row, id: 9002, dateTime: "2026-10-28T17:30:00", title: "City Council Regular Meeting - CANCELED" },
    { ...row, id: 9003, dateTime: "2026-10-28T17:30:00", committeeId: 17 },
    { ...row, id: 9004, dateTime: "2026-10-28T17:30:00", title: "City Council Closed Session" },
  ];
  const meeting = await withFetch((url) => {
    calls.push(String(url));
    return String(url).includes("ListArchivedMeetings") ? json([...distractors, ...archive]) : sourceFetch(url);
  }, () => fetchPrimeGovPastMeeting(options));
  assert.equal(meeting.date, "2026-10-26", "the HTML title's UTC October 27 timestamp is not the meeting date");
  assert.equal(meeting.meetingType, "City Council");
  assert.equal(meeting.source, "primegov-direct");
  assert.equal(meeting.sourceUrl, `https://${domain}/Portal/Meeting?compiledMeetingDocumentFileId=21874`);
  assert.match(meeting.fullAgendaText, /Chapter 18\.20/);
  assert.match(meeting.fullAgendaText, /Winter Storm Preparedness/);
  assert.doesNotMatch(meeting.fullAgendaText, /VIRTUAL PUBLIC COMMENT/);
  assert.equal(calls.length, 2, "filter before fetching documents or limiting candidates");
  assert.ok(calls.every((url) => !url.includes("meetingTemplateId")));
});

test("PrimeGov does not accept a document for a different body or printed date", async () => {
  for (const html of [council.replace("<title>City Council Special Meeting", "<title>Architectural Review Board"),
    council.replace("Monday, October 26, 2026", "Sunday, October 25, 2026"),
    "<html><title>Document not found</title></html>"]) {
    const result = await withFetch((url) => String(url).includes("ListArchivedMeetings")
      ? json(String(url).includes("year=2025") ? [] : [archive.find((m) => m.id === 2906)])
      : new Response(html), () => fetchPrimeGovPastMeeting(options));
    assert.equal(result, null);
  }
});

test("PrimeGov retains the two-substantive-item floor and skips unpublished agendas", async () => {
  const row = archive.find((m) => m.id === 2906);
  for (const candidate of [{ ...row, documentList: row.documentList.map((doc) => ({ ...doc, publishStatus: 0 })) }, row]) {
    const result = await withFetch((url) => String(url).includes("ListArchivedMeetings")
      ? json(String(url).includes("year=2025") ? [] : [candidate])
      : new Response(council.replace(/<table>[\s\S]*<\/table>/, "<table></table>")),
    () => fetchPrimeGovPastMeeting(options));
    assert.equal(result, null);
  }
});

test("PrimeGov recovery preserves a newer published date and requires the existing body verifier", async () => {
  assert.equal(await withFetch(sourceFetch, () => recoverPrimeGovDigestSource({ ...options, publishedDate: "2026-10-27" })), null);
  const recovered = await withFetch(sourceFetch, () => recoverPrimeGovDigestSource({ ...options, publishedDate: "2026-10-15" }));
  assert.equal(recovered.meeting.date, "2026-10-26");
  assert.equal(recovered.actual.councilMet, true);
  let archives = 0;
  assert.equal(await withFetch((url) => String(url).includes("ListArchivedMeetings") && ++archives > 1
    ? new Response("unavailable", { status: 503 }) : sourceFetch(url), () => recoverPrimeGovDigestSource(options)), null);
  assert.equal(await withFetch(() => { throw new Error("network unavailable"); }, () => recoverPrimeGovDigestSource(options)), null);
});

test("a committee-only date is attributed by its own agenda items when names are absent", async () => {
  const result = await withFetch(sourceFetch, () => verifyPrimeGovBodyOnDate(domain, "2026-10-22",
    "Review Fiscal Year 2026 Actuals and 2027 Adopted – No Action Needed (10 min). " +
    "Memorandum for Fiscal Year 2026 Actual Expenditures – Action Needed (10 min). Capital Update – No Action Needed (15 min)"));
  assert.equal(result.body, "Stormwater Management Oversight Committee");
  assert.equal(result.sourceUrl, `https://${domain}/Portal/Meeting?compiledMeetingDocumentFileId=21819`);
  assert.notEqual(result.councilMet, true);
  const unresolved = await withFetch(sourceFetch, () => verifyPrimeGovBodyOnDate(domain, "2026-10-22", "No attributable source content"));
  assert.equal(unresolved.body, null);
  assert.equal(unresolved.councilMet, false);
});
