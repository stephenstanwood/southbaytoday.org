import {
  legistarMeetingUrl,
  fetchEscribePastMeeting,
  verifyLegistarBodyOnDate,
  verifyPrimeGovBodyOnDate,
} from "./civic-meetings.mjs";
import { agendaTextForMeeting, recoverUnattributedMeetingAgenda } from "./digest-source.mjs";

/** Verify unattributed council text before it reaches either AI or provenance. */
export async function recoverAroundTownMeetingAgendas(config, meetings, {
  fetchEscribe = fetchEscribePastMeeting,
} = {}) {
  if (!config.escribe) return meetings;
  const byDate = new Map();
  const recovered = [];
  for (const meeting of meetings) {
    // This archive verifies Council records, never planning or other bodies.
    if (!/^(?:city|town) council$/i.test(meeting.meetingType || "")) {
      recovered.push(meeting);
      continue;
    }
    try {
      const verified = await recoverUnattributedMeetingAgenda(meeting, {
        fetchAgenda: (date) => {
          if (!byDate.has(date)) byDate.set(date, fetchEscribe({ ...config.escribe, today: date }));
          return byDate.get(date);
        },
      });
      if (verified && !recovered.some((record) => String(record.id) === String(verified.id))) recovered.push(verified);
    } catch {
      // Missing official evidence cannot license the unverified ingest text.
    }
  }
  return recovered;
}

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

// Task forces and planners need the same agenda/outcome guard as councils.
const CIVIC_BODY = String.raw`(?:council|commission|committee|board|panel|planners?|task\s+force|hearing|city|zoning\s+administrator)`;
const COMPLETED_BODY_ACTION = new RegExp(String.raw`\b${CIVIC_BODY}\s+(?:also\s+)?(held|met|heard|covered|discussed|considered|reviewed|weighed|approved|adopted|voted|decided|denied|rejected)\b`, "gi");
const COMPLETED_SESSION_ACTION = /\b(?:study|scoping)\s+session(?:\s+on\s+(?:[A-Za-z]+\s+\d{1,2}(?:,\s+\d{4})?|\d{4}-\d{2}-\d{2}))?\s+(held|met|heard|covered|discussed|considered|reviewed|weighed|approved|adopted|voted|decided|denied|rejected)\b/gi;
// "Council members were interviewing" also asserts an actual activity; an
// agenda's "Applicant Interviews" heading establishes only the planned item.
const PROGRESSIVE_BODY_ACTION = new RegExp(String.raw`\b${CIVIC_BODY}(?:\s+members?)?\s+(?:was|were)\s+(interviewing|hearing|discussing|considering|reviewing|weighing|approving|adopting|voting|deciding|denying|rejecting)\b`, "gi");
// A planned agenda role does not confirm that the meeting took place.
const COMPLETED_MEETING_ROLE = /\b(?:meeting|session)\s+(?:also\s+)?served\s+as\s+(?:a\s+)?(study|scoping)\s+(?:meeting|session)\b/gi;
const RECEIVED_PUBLIC_COMMENTS = /\bpublic comments?(?:\s+(?:were|was|also))*\s+(?:heard|received)\b/i;
const ONGOING_BODY_TALKS = /\b(?:city|council|commission|committee|board)\s+(?:(?:is|are)\s+)?in\s+(?:closed\s+)?talks\b/i;
const DECISION_LIST = /\b(?:notable|major|key|significant)\s+decisions\s*:/i;
const AGENDA_PLAN_CONTEXT = /\bagenda\s+(?:listed|included|scheduled)\b[^.!?;]*$/i;
// A requested continuance proposes a change; it does not establish that a
// hearing, ordinance or rules rewrite was actually postponed or delayed.
const COMPLETED_CONTINUANCE = /\b(?:project|proposal|application|item|hearing|review|ordinance|rules|rewrite)\s+(?:(?:was|were|is|has\s+been|had\s+been)\s+)?(pushed(?:\s+back)?|postponed|continued|rescheduled|delayed|deferred)\s+(?:to|until|for)\b/gi;

/** A past agenda date does not establish that the body heard or acted on an item. */
export function hasUnsupportedMeetingAction(item, meeting) {
  const claim = `${item?.headline || ""} ${item?.summary || ""}`;
  const bodyActions = [...claim.matchAll(COMPLETED_BODY_ACTION)].map((match) => match[1]);
  const sessionActions = [...claim.matchAll(COMPLETED_SESSION_ACTION)].map((match) => match[1]);
  const progressiveActions = [...claim.matchAll(PROGRESSIVE_BODY_ACTION)].map((match) => match[1]);
  const meetingRoles = [...claim.matchAll(COMPLETED_MEETING_ROLE)].map((match) => match[1].toLowerCase());
  const actions = [...bodyActions, ...sessionActions];
  const commentsClaimed = RECEIVED_PUBLIC_COMMENTS.test(claim);
  const talksClaimed = ONGOING_BODY_TALKS.test(claim);
  const decisionsClaimed = DECISION_LIST.test(claim);
  // Check each field separately: a qualified summary cannot excuse an
  // unqualified headline, while "the agenda listed a hearing continued to..."
  // remains an attributed description of the agenda.
  const continuanceActions = [item?.headline, item?.summary].flatMap((value) => {
    const text = String(value || "");
    return [...text.matchAll(COMPLETED_CONTINUANCE)]
      .filter((match) => !AGENDA_PLAN_CONTEXT.test(text.slice(0, match.index)))
      .map((match) => match[1].toLowerCase());
  });
  if (!actions.length && !progressiveActions.length && !meetingRoles.length && !commentsClaimed && !talksClaimed && !decisionsClaimed && !continuanceActions.length) return false;
  if (meeting?.source === "youtube-transcript") return false;
  const evidence = `${meeting?.title || ""} ${agendaTextForMeeting(meeting)}`;
  const sourcedContinuances = new Set([...evidence.matchAll(COMPLETED_CONTINUANCE)].map((match) => match[1].toLowerCase()));
  if (continuanceActions.some((action) => !sourcedContinuances.has(action))) return true;
  const sourcedProgressiveActions = new Set([...evidence.matchAll(PROGRESSIVE_BODY_ACTION)].map((match) => match[1].toLowerCase()));
  if (progressiveActions.some((action) => !sourcedProgressiveActions.has(action.toLowerCase()))) return true;
  const sourcedMeetingRoles = new Set([...evidence.matchAll(COMPLETED_MEETING_ROLE)].map((match) => match[1].toLowerCase()));
  if (meetingRoles.some((role) => !sourcedMeetingRoles.has(role))) return true;
  if (commentsClaimed && !RECEIVED_PUBLIC_COMMENTS.test(evidence)) return true;
  if (talksClaimed && !ONGOING_BODY_TALKS.test(evidence)) return true;
  // A list of proposed resolutions is not a list of decisions already made.
  if (decisionsClaimed && !DECISION_LIST.test(evidence)) return true;
  if (sessionActions.some((action) => ![...evidence.matchAll(COMPLETED_SESSION_ACTION)].some((match) => match[1].toLowerCase() === action.toLowerCase()))) return true;
  return bodyActions.some((action) => !new RegExp(
    `\\b${CIVIC_BODY}\\s+(?:also\\s+)?${action}\\b`, "i",
  ).test(evidence));
}

const CURRENT_BODY_ACTION = new RegExp(String.raw`\b${CIVIC_BODY}\s+(?:(?:(?:is|are)\s+(?:scheduled|set|expected|slated)\s+to|will|to)\s+(?:hear|consider|review|weigh|discuss|vote|decide|approve|adopt|appoint|reject|deny|address|hold|interview)\b|(?:weighs|considers|holds|meets|reviews|addresses|interviews)\b)`, "gi");
const CURRENT_PERMIT_REQUEST = /\bseeks?\s+(?:an?\s+)?(?:use\s+)?permit\b/gi;
const CURRENT_SESSION_PLAN = /\b(?:study|scoping)\s+session\s+(?:is\s+)?(?:scheduled|set|expected|slated)\s+(?:for|to)\b/gi;

/** A canceled regular meeting must not obscure a separate special meeting. */
export function hasUnscopedMeetingCancellation(item, meeting) {
  const evidence = `${meeting?.title || ""} ${agendaTextForMeeting(meeting)}`.replace(/\s+/g, " ");
  const canceled = /\bcancell?ed\b/i;
  if (!canceled.test(evidence) || !/\b(?:special|joint)\b[^.!?\n]{0,100}\bmeeting\b/i.test(evidence)) return false;
  const claims = [item?.headline, item?.summary, ...(item?.keyTopics || [])].filter(Boolean);
  return claims.some((claim) => String(claim).split(/(?<=[.!?])\s+/).some((sentence) =>
    canceled.test(sentence) && /\bmeeting\b/i.test(sentence)
      && !/\b(?:regular|special|joint|committee|commission|agenda\s+review)\b/i.test(sentence)
  ));
}

/** An old agenda supports dated agenda language, not a new pending hearing. */
export function hasPastAgendaFutureFraming(item, meeting, asOfDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item?.date || "")
      || !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate || "")
      || item.date >= asOfDate || meeting?.source === "youtube-transcript") return false;
  // "The agenda listed a session for council to interview candidates" reports
  // the old plan accurately. Check each field and clause so that qualification
  // cannot excuse a separate present-tense headline or a later sentence.
  return [item?.headline, item?.summary].some((value) => {
    const claim = String(value || "");
    return [CURRENT_BODY_ACTION, CURRENT_PERMIT_REQUEST, CURRENT_SESSION_PLAN].some((pattern) =>
      [...claim.matchAll(pattern)].some((match) => !AGENDA_PLAN_CONTEXT.test(claim.slice(0, match.index))),
    );
  });
}
