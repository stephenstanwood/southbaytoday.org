/**
 * MiLB StatsAPI is authoritative for San Jose Giants home dates at Excite
 * Ballpark. Ticketmaster keeps selling awarded-but-unplayed postseason slots
 * after the league drops them from the schedule (Sep 11 2026 Division Series).
 */

export function isTicketmasterSJGiantsExciteEvent(event) {
  if (event?.source !== "Ticketmaster") return false;
  if (!/\bsan jose giants\b/i.test(event.title || "")) return false;
  return /\bexcite ballpark\b/i.test(event.venue || "");
}

export function dropStaleTicketmasterSJGiants(events) {
  const milbHomeDates = new Set(
    events
      .filter((e) => typeof e.id === "string" && e.id.startsWith("sjgiants-"))
      .map((e) => e.date)
      .filter(Boolean),
  );
  // MiLB did not contribute this run — keep Ticketmaster as fallback coverage.
  if (milbHomeDates.size === 0) return { events, dropped: 0 };

  let dropped = 0;
  const kept = events.filter((e) => {
    if (!isTicketmasterSJGiantsExciteEvent(e)) return true;
    if (milbHomeDates.has(e.date)) return true;
    dropped++;
    return false;
  });
  return { events: kept, dropped };
}
