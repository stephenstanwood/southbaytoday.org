import { REGISTRATION_REQUIRED } from "../../src/lib/south-bay/eventFilters.mjs";

const SOURCE_URL = "https://grpg.org/calendar/events/";

/** Use each dated calendar card, never the conservancy's office address. */
export function normalizeGuadalupeEvent(raw, { today } = {}) {
  const start = new Date(raw.startDate), end = new Date(raw.endDate);
  if (!raw.title || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw.startDate || "") || !Number.isFinite(+start)) return null;
  const date = start.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  if (date < today) return null;
  const clock = value => value.toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit", hour12: true,
  });
  // Simple Calendar repeats the event title in otherwise empty location meta.
  const sourceLocation = String(raw.location || "").trim();
  const location = sourceLocation === raw.title ? "" : sourceLocation;
  const description = String(raw.description || "").trim();
  // The calendar's address metadata can name a different street from the
  // explicit Meeting Location in its body. Parking is also separate: neither
  // is a substitute for the named meeting point and registration-form map.
  const meetingLocation = description.match(/\bMeeting Location:\s*([^();\n]+?)(?=\s*\(|\s+(?:Time|Recurring Dates):|$)/i)?.[1]?.trim();
  // The organizer requires advance signup for its volunteer events:
  // https://grpg.org/get-involved/volunteer/ (verified 2026-11-01).
  // Partner workouts and Neighborhood Hands have separate arrangements.
  const volunteer = /^(?:Volunteer in the (?:Historic Orchard|Heritage Rose Garden)\b|Guadalupe Gardens Workday$|Restore & Explore: Trail Clean[ -]Up(?: and| &) Trail Tour$)/i.test(raw.title);
  const chaperones = description.match(/\bChaperones are required for those age \d{1,2} and younger\b/i)?.[0];
  const coordinates = /^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(location);
  let venue = null, address = location || "";
  if (coordinates) {
    if (/\bin Guadalupe Gardens\b/i.test(description)) venue = "Guadalupe Gardens";
  } else if (location) {
    const first = location.split(",")[0].trim();
    if (!/^\d/.test(first)) {
      venue = first;
      address = location.includes(",") ? location.slice(location.indexOf(",") + 1).trim() : "";
    }
  }
  if (meetingLocation) {
    venue = meetingLocation;
    address = "";
  }
  const attendanceNote = [
    !location && !meetingLocation
      ? "The organizer's calendar does not list a meeting location. Confirm it with Guadalupe River Park Conservancy before going." : null,
    volunteer ? "Advance registration is required through Guadalupe River Park Conservancy." : null,
    meetingLocation ? `Meet at ${meetingLocation}; see the organizer's registration form for the meeting map.` : null,
    chaperones ? `${chaperones}.` : null,
  ].filter(Boolean).join(" ");
  return {
    title: raw.title, date, time: clock(start),
    endTime: Number.isFinite(+end) && end > start ? clock(end) : null,
    venue, address, city: "san-jose", category: "outdoor",
    cost: /\bfree (?:admission|entry|event|class|program)\b|\b(?:admission|entry) is free\b|\bno (?:admission )?charge\b/i.test(description) ? "free"
      : /\b(?:admission|tickets?|registration|fee|cost)\b.{0,35}\$\s*\d|\$\s*[\d,.]+\s*(?:per person|per ticket|admission)/i.test(description) ? "paid" : null,
    description, url: SOURCE_URL, source: "Guadalupe River Park Conservancy",
    kidFriendly: /\bfamil(?:y|ies)\b|\bchildren\b/i.test(description),
    ...(volunteer ? { registration: REGISTRATION_REQUIRED } : {}),
    ...(attendanceNote ? { attendanceNote } : {}),
    ...(!location && !meetingLocation ? {
      attendanceStatus: "needs-confirmation",
    } : {}),
    occurrenceEvidence: { kind: "first-party-occurrence-page", sourceUrl: SOURCE_URL, date },
  };
}
