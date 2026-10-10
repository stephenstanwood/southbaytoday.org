import {
  legistarMeetingUrl,
  verifyLegistarBodyOnDate,
  verifyPrimeGovBodyOnDate,
} from "./civic-meetings.mjs";
import { agendaTextForMeeting } from "./digest-source.mjs";

/** Keep provenance per upstream record: several bodies can meet on one date. */
export async function resolveAroundTownMeetingSources(config, meetings, {
  verifyLegistar = verifyLegistarBodyOnDate,
  verifyPrimeGov = verifyPrimeGovBodyOnDate,
  fallbackBody,
} = {}) {
  const sources = new Map();
  for (const meeting of meetings) {
    if (meeting.id == null) continue;
    const fallbackUrl = meeting.sourceUrl
      ?? (config.legistar ? legistarMeetingUrl(config.legistar, meeting.date) : config.agendaUrl);
    let source = { body: fallbackBody || config.councilBody || meeting.meetingType || "City Council", sourceUrl: fallbackUrl };
    if (config.legistarApi || config.primegov) {
      const text = `${meeting.title || ""} ${agendaTextForMeeting(meeting)}`;
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

const NONDISCLOSURE_CLAIM = /\bno\s+(?:reportable\s+)?(?:action|outcome|decision|vote|details?)\b[^.!?]{0,100}\b(?:disclosed|reported|announced)\b|\bnothing\s+(?:to\s+report|was\s+(?:disclosed|reported|announced))\b|\bno\s+reportable\s+action\b|\b(?:action|outcome|decision|vote|details?)\b[^.!?]{0,100}\bnot\s+(?:disclosed|reported|announced)\b/i;

/** A closed-session agenda or report slot does not establish what was reported. */
export function hasUnsupportedNonDisclosureClaim(item, meeting) {
  const claim = `${item?.headline || ""} ${item?.summary || ""}`;
  if (!NONDISCLOSURE_CLAIM.test(claim)) return false;
  const evidence = `${meeting?.title || ""} ${meeting?.excerpt || ""} ${meeting?.fullAgendaText || ""}`;
  return !NONDISCLOSURE_CLAIM.test(evidence);
}

const COMPLETED_BODY_ACTION = /\b(?:council|commission|committee|board|panel|hearing|city|zoning administrator)\s+(?:also\s+)?(held|met|heard|discussed|considered|reviewed|weighed|approved|adopted|voted|decided|denied|rejected)\b/gi;
const RECEIVED_PUBLIC_COMMENTS = /\bpublic comments?(?:\s+(?:were|was|also))*\s+(?:heard|received)\b/i;
const ONGOING_BODY_TALKS = /\b(?:city|council|commission|committee|board)\s+(?:(?:is|are)\s+)?in\s+(?:closed\s+)?talks\b/i;

/** A past agenda date does not establish that the body heard or acted on an item. */
export function hasUnsupportedMeetingAction(item, meeting) {
  const claim = `${item?.headline || ""} ${item?.summary || ""}`;
  const actions = [...claim.matchAll(COMPLETED_BODY_ACTION)].map((match) => match[1]);
  const commentsClaimed = RECEIVED_PUBLIC_COMMENTS.test(claim);
  const talksClaimed = ONGOING_BODY_TALKS.test(claim);
  if (!actions.length && !commentsClaimed && !talksClaimed) return false;
  if (meeting?.source === "youtube-transcript") return false;
  const evidence = `${meeting?.title || ""} ${agendaTextForMeeting(meeting)}`;
  if (commentsClaimed && !RECEIVED_PUBLIC_COMMENTS.test(evidence)) return true;
  if (talksClaimed && !ONGOING_BODY_TALKS.test(evidence)) return true;
  return actions.some((action) => !new RegExp(
    `\\b(?:council|commission|committee|board|panel|hearing|city|zoning administrator)\\s+(?:also\\s+)?${action}\\b`, "i",
  ).test(evidence));
}

const CURRENT_BODY_ACTION = /\b(?:council|commission|committee|board|panel|zoning administrator)\s+(?:(?:(?:is|are)\s+(?:scheduled|set|expected|slated)\s+to|will|to)\s+(?:hear|consider|review|weigh|discuss|vote|decide|approve|adopt|appoint|reject|deny)\b|(?:weighs|considers)\b)/i;
const CURRENT_PERMIT_REQUEST = /\bseeks?\s+(?:an?\s+)?(?:use\s+)?permit\b/i;

/** An old agenda supports dated agenda language, not a new pending hearing. */
export function hasPastAgendaFutureFraming(item, meeting, asOfDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item?.date || "")
      || !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate || "")
      || item.date >= asOfDate || meeting?.source === "youtube-transcript") return false;
  const claim = `${item?.headline || ""} ${item?.summary || ""}`;
  return CURRENT_BODY_ACTION.test(claim) || CURRENT_PERMIT_REQUEST.test(claim);
}
