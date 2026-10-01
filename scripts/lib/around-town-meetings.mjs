import {
  legistarMeetingUrl,
  verifyLegistarBodyOnDate,
  verifyPrimeGovBodyOnDate,
} from "./civic-meetings.mjs";

/** Keep provenance per upstream record: several bodies can meet on one date. */
export async function resolveAroundTownMeetingSources(config, meetings, {
  verifyLegistar = verifyLegistarBodyOnDate,
  verifyPrimeGov = verifyPrimeGovBodyOnDate,
} = {}) {
  const sources = new Map();
  for (const meeting of meetings) {
    if (meeting.id == null) continue;
    const fallbackUrl = meeting.sourceUrl
      ?? (config.legistar ? legistarMeetingUrl(config.legistar, meeting.date) : config.agendaUrl);
    let source = { body: config.councilBody || meeting.meetingType || "City Council", sourceUrl: fallbackUrl };
    if (config.legistarApi || config.primegov) {
      const text = `${meeting.title || ""} ${meeting.excerpt || ""}`;
      let actual;
      try {
        actual = config.legistarApi
          ? await verifyLegistar(config.legistarApi, meeting.date, text)
          : await verifyPrimeGov(config.primegov, meeting.date, text);
      } catch {
        continue;
      }
      // A failed or ambiguous check cannot license an unchecked body label.
      if (!actual?.body && actual?.councilMet !== true) continue;
      source = {
        body: actual.body || "City Council",
        sourceUrl: actual.sourceUrl || fallbackUrl,
      };
    }
    sources.set(String(meeting.id), { ...source, date: meeting.date });
  }
  return sources;
}

/** An AI highlight must identify one supplied record on the same date. */
export function aroundTownSourceForItem(item, sources) {
  if (item?.sourceRecordId == null) return null;
  const source = sources.get(String(item.sourceRecordId));
  return source && item.date === source.date ? source : null;
}
