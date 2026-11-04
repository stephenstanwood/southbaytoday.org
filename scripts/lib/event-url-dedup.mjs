// Bare collection pages contain multiple occurrences. Query strings and anchors
// may identify a specific event, so leave those on the existing detail path.
function isCollectionUrl(raw) {
  try {
    const url = new URL(raw);
    return !url.search && !url.hash
      && /\/(?:events|events-calendar|calendar(?:-month-view)?(?:\.aspx)?)\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

/** Deduplicate URL/date/clock identities before venue and title matching. */
export function deduplicateEventUrls(events) {
  const seen = new Set();
  return events.filter((event) => {
    if (!event.url || !event.date || !event.time) return true;
    const time = String(event.time).split(",").pop().trim().toLowerCase().replace(/\s+/g, "");
    const identity = [event.url, event.date, time];
    if (isCollectionUrl(event.url)) {
      // Without a venue, a shared calendar cannot establish occurrence identity.
      // Later title/venue passes can still recognize genuine copies.
      if (!event.venue) return true;
      const venue = event.venue.toLowerCase().normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      if (!venue) return true;
      identity.push(event.city || "", venue);
    }
    const key = JSON.stringify(identity);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
