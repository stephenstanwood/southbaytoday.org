import { fetchLegistarPastMeeting, fetchPrimeGovPastMeeting, verifyLegistarBodyOnDate, verifyPrimeGovBodyOnDate } from "./civic-meetings.mjs";

// Stoa's excerpt is a 500-character search-card preview. Prefer the ingested
// agenda for BOTH attribution and summarization so they read the same source.
export function agendaTextForMeeting(meeting) {
  return meeting.fullAgendaText?.trim() || meeting.excerpt || "";
}

// Some upstream records contain auto-caption fragments but are labeled only
// "ingest". Without an attributable source, those words cannot establish an
// agenda item. Call only for a city with a configured first-party archive;
// an explicitly sourced transcript keeps its own provenance and limitations.
export async function recoverUnattributedMeetingAgenda(meeting, { fetchAgenda } = {}) {
  if (!meeting || meeting.source !== "ingest" || meeting.sourceUrl
      || meeting.fullAgendaText?.trim()) return meeting;
  const agenda = await fetchAgenda(meeting.date);
  if (agenda?.date !== meeting.date || !agenda.sourceUrl || !agenda.fullAgendaText?.trim()) return null;
  return { ...agenda, city: meeting.city };
}

// A recent, mislabeled Stoa record can fail attribution before its date ever
// triggers the stale-source fallback. Read the city's own council agenda and
// verify it through the same body guard; never replace a published date with
// an older one or treat an unavailable calendar as confirmation.
export async function recoverLegistarDigestSource({ client, bodyNames, publishedDate, today } = {}) {
  let meeting;
  try {
    meeting = await fetchLegistarPastMeeting({ client, bodyNames, today });
  } catch {
    return null;
  }
  if (!meeting || (publishedDate && meeting.date < publishedDate)) return null;
  const actual = await verifyLegistarBodyOnDate(
    client, meeting.date, `${meeting.title} ${agendaTextForMeeting(meeting)}`,
  );
  if (!actual || actual.councilMet !== true || actual.body) return null;
  return { meeting, actual };
}

// A fresh upstream date can belong to a committee even when tagged Council.
// Recover the Council's own agenda, then pass it through the same body guard.
// The published-date floor applies before either regeneration or relabeling.
export async function recoverPrimeGovDigestSource({ domain, committeeId, publishedDate, today } = {}) {
  let meeting;
  try {
    meeting = await fetchPrimeGovPastMeeting({ domain, committeeId, today });
  } catch {
    return null;
  }
  if (!meeting || (publishedDate && meeting.date < publishedDate)) return null;
  const actual = await verifyPrimeGovBodyOnDate(
    domain, meeting.date, `${meeting.title} ${agendaTextForMeeting(meeting)}`,
  );
  if (!actual || actual.councilMet !== true || actual.body) return null;
  return { meeting, actual };
}
