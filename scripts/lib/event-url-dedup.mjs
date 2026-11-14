import { compareDuplicateAuthority } from "../../src/lib/south-bay/eventFuzzyDedup.mjs";

function concreteSlotKey(event) {
  if (!event.venue || !event.date || !event.time) return null;
  const venue = event.venue.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/^(the|a|an)\s+/, "").replace(/[^a-z0-9]/g, "").substring(0, 30);
  const time = String(event.time).split(",").pop().trim().toLowerCase().replace(/\s+/g, "");
  const key = `${event.date}|${venue}|${time}`;
  try {
    const url = new URL(event.url);
    const match = url.pathname.match(/^\/(?:v2\/)?events\/([a-f0-9]{24})\/?$/i);
    if (/^(?:sccl|sjpl|paloalto)\.bibliocommons\.com$/.test(url.hostname) && match) {
      // One branch can host several programs at the same time. Its organizer
      // assigns each occurrence an ID; shared venue/clock fields do not make
      // different IDs duplicates. Newsletter copies retain that same identity.
      return `${key}|${url.hostname}|${match[1].toLowerCase()}`;
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
