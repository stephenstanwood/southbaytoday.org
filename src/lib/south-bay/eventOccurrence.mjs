import { isEventEditoriallySuppressed } from "./eventAvailability.mjs";
import { isPlaceTemporarilyUnavailable } from "./placeAvailability.mjs";

// Most event sources already provide exact dated rows. GRPG previously had a
// local recurrence expander, so require proof that each GRPG date was actually
// observed on the organizer's occurrence page before it can be published.
const EVIDENCE_REQUIRED_SOURCES = new Map([
  ["Guadalupe River Park Conservancy", new Set(["grpg.org", "www.grpg.org"])],
  ["Linden Tree Books", new Set(["lindentreebooks.com", "www.lindentreebooks.com"])],
]);

function isProjectedFarmersMarket(event) {
  return event?.projectedRecurrence === true
    || (
      event?.source === "South Bay Signal"
      && /\bfarmers?[’']?\s+markets?\b/i.test(String(event?.title || event?.name || ""))
    );
}

function sameSourceHost(left, right) {
  try {
    const normalize = (value) => new URL(String(value)).hostname.toLowerCase().replace(/^www\./, "");
    return normalize(left) === normalize(right);
  } catch {
    return false;
  }
}

const INACTIVE_STATUS_TOKENS = new Set([
  "eventcancelled",
  "eventcanceled",
  "eventpostponed",
  "eventrescheduled",
  "eventmovedonline",
  "cancelled",
  "canceled",
  "postponed",
  "rescheduled",
]);

function statusToken(value) {
  return String(value || "").toLowerCase().replace(/[^a-z]/g, "");
}

export function isEventExplicitlyInactive(event) {
  if (!event || typeof event !== "object") return false;

  const statuses = [event.eventStatus, event.sourceStatus, event.status];
  if (statuses.some((value) => {
    const token = statusToken(value);
    return [...INACTIVE_STATUS_TOKENS].some((inactive) => token.endsWith(inactive));
  })) return true;

  // Keep this title rule narrow. Generic page boilerplate often explains what
  // happens "if an event is canceled" without saying this occurrence is off.
  return /\b(?:cancell?ed|postponed)\b/i.test(String(event.title || event.name || ""));
}

export function hasRequiredOccurrenceEvidence(event) {
  if (!event || typeof event !== "object") return false;

  if (isProjectedFarmersMarket(event)) {
    const evidence = event.occurrenceEvidence;
    if (!evidence || evidence.kind !== "first-party-market-schedule") return false;
    if (String(evidence.date || "") !== String(event.date || "").slice(0, 10)) return false;
    if (!/^\d{4}-\d{2}-\d{2}T/.test(String(evidence.checkedAt || ""))) return false;
    if (!sameSourceHost(evidence.sourceUrl, event.url)) return false;
    try {
      return new URL(String(evidence.sourceUrl)).protocol === "https:";
    } catch {
      return false;
    }
  }

  const allowedHosts = EVIDENCE_REQUIRED_SOURCES.get(String(event.source || ""));
  if (!allowedHosts) return true;

  const evidence = event.occurrenceEvidence;
  if (!evidence || evidence.kind !== "first-party-occurrence-page") return false;
  if (String(evidence.date || "") !== String(event.date || "").slice(0, 10)) return false;

  try {
    const sourceUrl = new URL(String(evidence.sourceUrl || ""));
    return sourceUrl.protocol === "https:" && allowedHosts.has(sourceUrl.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function hasUnconfirmedStartTime(event) {
  // Newsletter extraction can invent a valid clock beside an explicit TBA
  // notice. A syntactically valid time cannot override the source's notice.
  // Match the start/kickoff itself, not undecided parking or other details.
  const pendingStart = /\b(?:kick[-\s]?off(?:\s+time)?|start\s+time)\s*(?:(?:is|remains?)\s+)?(?:still\s+)?(?:TBA|TBD|to\s+be\s+(?:announced|determined|confirmed))\b/i;
  return [event?.title, event?.description].some((text) => pendingStart.test(String(text || "")));
}

export function hasUnconfirmedOccurrenceDate(event) {
  // A valid calendar timestamp cannot resolve an explicit pending move. The
  // January 31 writing-workshop row still says its replacement day is TBD.
  // Confirmed moves and conditional rescheduling policies remain publishable.
  const text = String(event?.description || "").replace(/<[^>]*>/g, " ");
  return /(?:^|[.!?])\s*this\s+(?:event|workshop|program|session)\s+(?:will\s+be|is\s+being)\s+rescheduled\s+to\s+(?:another|a\s+different)\s+(?:day|date)\b/i.test(text)
    && /\b(?:TBD|TBA|to\s+be\s+(?:announced|determined|confirmed))\b/i.test(text);
}

export function isNonEventOffer(event) {
  // The Tech's event index also carries membership-sales promotions. This
  // offer grants vouchers for a separate December activity; its October
  // timestamp is not a public cookie-cutter session. Keep the actual activity.
  return event?.source === "The Tech Interactive"
    && /^Buy or Renew In-Person\b/i.test(String(event?.title || ""));
}

export function isEventPublishable(event) {
  return !isPlaceTemporarilyUnavailable(event)
    && !isEventEditoriallySuppressed(event)
    && !isEventExplicitlyInactive(event)
    && !hasUnconfirmedStartTime(event)
    && !hasUnconfirmedOccurrenceDate(event)
    && !isNonEventOffer(event)
    && hasRequiredOccurrenceEvidence(event);
}
