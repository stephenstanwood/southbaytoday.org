const TICKET_HOST = "app.spektrix-link.com";
const TICKET_PATH = "/clients/paloaltoplayers/events/";
const words = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Follow only the production's own Palo Alto Players booking link. */
export function paloAltoPlayersTicketSource(html) {
  const ids = new Set();
  for (const match of String(html || "").matchAll(/href=["']([^"']+)["']/gi)) {
    try {
      const url = new URL(match[1].replace(/&amp;|&#0*38;/gi, "&"));
      if (url.protocol !== "https:" || url.hostname !== "my.paplayers.org"
          || url.pathname !== "/EventAvailability") continue;
      const id = url.searchParams.get("EventId");
      if (/^\d+$/.test(id || "")) ids.add(id);
    } catch { /* A relative or unrelated link supplies no booking identity. */ }
  }
  return ids.size === 1 ? `https://${TICKET_HOST}${TICKET_PATH}${[...ids][0]}.json` : null;
}

/** A production run and a weekday schedule never establish an occurrence. */
export function paloAltoPlayersOccurrence(ticket, { sourceUrl, title, venue, today, checkedAt } = {}) {
  let eventId;
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== "https:" || url.hostname !== TICKET_HOST) return null;
    eventId = url.pathname.match(/^\/clients\/paloaltoplayers\/events\/(\d+)\.json$/)?.[1];
  } catch { return null; }
  if (!eventId || String(ticket?.id || "").match(/^\d+/)?.[0] !== eventId
      || words(ticket?.name) !== words(title) || !Array.isArray(ticket?.instances)) return null;

  const occurrences = [];
  for (const instance of ticket.instances) {
    if (!instance?.id || instance.event?.id !== ticket.id || instance.cancelled !== false) continue;
    const local = String(instance.start || "").match(/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):[0-5]\d$/);
    if (!local || local[1] < today) continue;
    const date = local[1];
    const parsedDate = new Date(`${date}T12:00:00Z`);
    if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) continue;
    if (instance.availability?.name && words(instance.availability.name) !== words(venue)) continue;
    const hour = Number(local[2]);
    const time = `${hour % 12 || 12}:${local[3]} ${hour >= 12 ? "PM" : "AM"}`;
    // Spektrix's *Utc field can omit Z; it still represents UTC, not local time.
    if (instance.startUtc) {
      const instant = new Date(`${instance.startUtc}${/Z$|[+-]\d\d:\d\d$/.test(instance.startUtc) ? "" : "Z"}`);
      if (!Number.isFinite(instant.getTime())) continue;
      const ptDate = instant.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
      const ptTime = instant.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });
      if (ptDate !== date || ptTime !== time) continue;
    }
    occurrences.push({
      date, time, start: instance.start,
      occurrenceEvidence: {
        kind: "first-party-occurrence-page", sourceUrl, date, time, checkedAt,
        sourceOccurrenceId: instance.id,
      },
      // Future published performances can precede single-ticket sales. That
      // is neither a cancellation nor evidence that seats can be booked now.
      ...(instance.isOnSale === false ? {
        attendanceNote: "Single tickets for this performance are not currently on sale. Check the theater's booking calendar.",
      } : instance.availability?.available === 0 ? { registration: "full" } : {}),
    });
  }
  occurrences.sort((a, b) => a.start.localeCompare(b.start));
  const first = occurrences[0];
  if (!first) return null;
  const { start, ...occurrence } = first;
  return occurrence;
}
