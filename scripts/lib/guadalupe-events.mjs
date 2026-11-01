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
  return {
    title: raw.title, date, time: clock(start),
    endTime: Number.isFinite(+end) && end > start ? clock(end) : null,
    venue, address, city: "san-jose", category: "outdoor",
    cost: /\bfree (?:admission|entry|event|class|program)\b|\b(?:admission|entry) is free\b|\bno (?:admission )?charge\b/i.test(description) ? "free"
      : /\b(?:admission|tickets?|registration|fee|cost)\b.{0,35}\$\s*\d|\$\s*[\d,.]+\s*(?:per person|per ticket|admission)/i.test(description) ? "paid" : null,
    description, url: SOURCE_URL, source: "Guadalupe River Park Conservancy",
    kidFriendly: /\bfamil(?:y|ies)\b|\bchildren\b/i.test(description),
    ...(!location ? {
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The organizer's calendar does not list a meeting location. Confirm it with Guadalupe River Park Conservancy before going.",
    } : {}),
    occurrenceEvidence: { kind: "first-party-occurrence-page", sourceUrl: SOURCE_URL, date },
  };
}
