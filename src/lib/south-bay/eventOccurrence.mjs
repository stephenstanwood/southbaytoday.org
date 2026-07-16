import { isPlaceTemporarilyUnavailable } from "./placeAvailability.mjs";

// Most event sources already provide exact dated rows. GRPG previously had a
// local recurrence expander, so require proof that each GRPG date was actually
// observed on the organizer's occurrence page before it can be published.
const EVIDENCE_REQUIRED_SOURCES = new Map([
  ["Guadalupe River Park Conservancy", new Set(["grpg.org", "www.grpg.org"])],
  ["Linden Tree Books", new Set(["lindentreebooks.com", "www.lindentreebooks.com"])],
]);

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

export function isEventPublishable(event) {
  return !isPlaceTemporarilyUnavailable(event)
    && !isEventExplicitlyInactive(event)
    && hasRequiredOccurrenceEvidence(event);
}
