import { compareDuplicateAuthority } from "../../src/lib/south-bay/eventFuzzyDedup.mjs";

function libraryOccurrenceKey(url) {
  const match = /^https?:\/\/((?:sccl|sjpl|paloalto)\.bibliocommons\.com)\/(?:v2\/)?events\/([a-f0-9]{24})\/?(?:[?#].*)?$/i.exec(url || "");
  return match ? `${match[1].toLowerCase()}|${match[2].toLowerCase()}` : null;
}

export function eventClockKey(time) {
  return String(time || "").split(",").pop().trim().toLowerCase().replace(/\s+/g, "");
}

function concreteSlotKey(event) {
  if (!event.venue || !event.date || !event.time) return null;
  const venue = event.venue.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/^(the|a|an)\s+/, "").replace(/[^a-z0-9]/g, "").substring(0, 30);
  const time = eventClockKey(event.time);
  const key = `${event.date}|${venue}|${time}`;
  // One branch can host multiple programs at the same time. Copies of the
  // same library record compete on authority, while distinct IDs survive.
  const library = libraryOccurrenceKey(event.url);
  if (library) return `${key}|${library}`;
  try {
    const url = new URL(event.url);
    if (/^events\.(?:stanford|sjsu)\.edu$/.test(url.hostname)
      && /^\/event\/[^/]+\/?$/.test(url.pathname)) {
      // Localist detail pages can name different programs sharing a museum
      // or campus room and clock. Copies using the same organizer page still
      // compete on authority; a different detail page preserves its program.
      return `${key}|${url.hostname}|${url.pathname.replace(/\/$/, "")}`;
    }
  } catch { /* Other sources keep the existing concrete-slot matching. */ }
  return key;
}

/** Keep the authoritative copy of a concrete occurrence, preserving library IDs. */
export function deduplicateEventSlots(events) {
  const winners = new Map();
  for (const event of events) {
    const key = concreteSlotKey(event);
    if (!key) continue;
    const current = winners.get(key);
    if (!current || compareDuplicateAuthority(event, current, {
      occurrenceOnly: true,
      includeRichness: false,
    }) < 0) winners.set(key, event);
  }
  // Resolve concrete-slot authority first. Otherwise URL dedup can retain an
  // earlier newsletter copy and discard the later organizer winner, after
  // which the slot filter discards that newsletter too and loses the event.
  return deduplicateEventUrls(events.filter((event) => {
    const key = concreteSlotKey(event);
    return !key || winners.get(key) === event;
  }));
}

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
    const time = eventClockKey(event.time);
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

/** Keep library records distinct even when the displayed names and times match. */
export function deduplicateEventTitles(events) {
  const winners = new Map();
  for (const event of events) {
    const strippedTitle = event.title.replace(/\s+[—–-]+\s+.+$/, "").replace(/\s+at\s+[A-Z].+$/, "");
    const title = strippedTitle.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 30);
    const key = JSON.stringify([title, event.date, eventClockKey(event.time), libraryOccurrenceKey(event.url)]);
    const current = winners.get(key);
    // A venue-less repost can miss concrete-slot dedup. Keep the dated
    // organizer record even when the repost comes first with more copy.
    if (!current || compareDuplicateAuthority(event, current, {
      occurrenceOnly: true,
      includeRichness: false,
    }) < 0) winners.set(key, event);
  }
  return [...winners.values()];
}
