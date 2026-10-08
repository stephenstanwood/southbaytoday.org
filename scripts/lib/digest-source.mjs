import { fetchLegistarPastMeeting, verifyLegistarBodyOnDate } from "./civic-meetings.mjs";

// Stoa's excerpt is a 500-character search-card preview. Prefer the ingested
// agenda for BOTH attribution and summarization so they read the same source.
export function agendaTextForMeeting(meeting) {
  return meeting.fullAgendaText?.trim() || meeting.excerpt || "";
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
