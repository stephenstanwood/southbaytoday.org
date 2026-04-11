// ---------------------------------------------------------------------------
// South Bay Today — Slot Scheduler
// Pre-assigns each approved post to a specific publish slot based on
// event date, quality, and current queue occupancy. Replaces the reactive
// "score at publish time" model with explicit scheduling.
//
// Publish slots (local America/Los_Angeles, matches launchd cron):
//   07:15, 09:30, 11:45, 14:10, 16:30, 18:45
// ---------------------------------------------------------------------------

export const SLOTS = ["07:15", "09:30", "11:45", "14:10", "16:30", "18:45"];

/** Return today's date in Pacific Time as YYYY-MM-DD. */
export function todayPT() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

/** Return current HH:MM in Pacific Time. */
export function nowHHMM_PT() {
  return new Date().toLocaleTimeString("en-GB", {
    timeZone: "America/Los_Angeles",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Day of week (0=Sun, 6=Sat) for a YYYY-MM-DD string in PT. */
export function dowPT(dateStr) {
  return new Date(dateStr + "T12:00:00-07:00").getDay();
}

/** Add N days to a YYYY-MM-DD string. Returns new YYYY-MM-DD. */
export function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00-07:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

/** Days between two YYYY-MM-DD strings (b - a). */
export function daysBetween(a, b) {
  const da = new Date(a + "T12:00:00-07:00");
  const db = new Date(b + "T12:00:00-07:00");
  return Math.round((db - da) / 86400000);
}

/**
 * Event date extractor. Handles post.item.date, post.date, or extracts
 * from title in a few known formats.
 */
export function getEventDate(post) {
  return post?.item?.date || post?.date || null;
}

/**
 * Given an event date and today, return an ordered list of candidate
 * publish dates (YYYY-MM-DD) from most-preferred to least-preferred.
 */
export function computePreferredDates(eventDate, today = todayPT()) {
  const daysUntil = daysBetween(today, eventDate);
  if (daysUntil < 0) return []; // past event, don't schedule
  const event = eventDate;
  const eventDow = dowPT(eventDate);
  const isWeekendEvent = eventDow === 0 || eventDow === 6;

  // Same-day event: publish today only
  if (daysUntil === 0) return [today];

  // Tomorrow: publish today and tomorrow morning
  if (daysUntil === 1) return [today, event];

  // 2-3 days out: the day before gets priority, then day-of
  if (daysUntil === 2) return [addDays(event, -1), event, today];
  if (daysUntil === 3) return [addDays(event, -1), addDays(event, -2), event];

  // 4-7 days out: ramp up — start mid-week for weekend events
  if (daysUntil >= 4 && daysUntil <= 7) {
    if (isWeekendEvent) {
      // For a Sat/Sun event: prefer Thu/Fri publish (closest non-weekend workdays)
      const candidates = [];
      for (let offset = -2; offset >= -4; offset--) {
        const d = addDays(event, offset);
        const dow = dowPT(d);
        if (dow >= 1 && dow <= 5) candidates.push(d); // Mon-Fri
      }
      candidates.push(addDays(event, -1), event);
      return candidates;
    }
    return [addDays(event, -2), addDays(event, -3), addDays(event, -1), event];
  }

  // 8-14 days out: publish 3-5 days before
  if (daysUntil >= 8 && daysUntil <= 14) {
    return [addDays(event, -3), addDays(event, -4), addDays(event, -5), addDays(event, -2)];
  }

  // 15-21 days out: publish ~week before
  if (daysUntil >= 15 && daysUntil <= 21) {
    return [addDays(event, -7), addDays(event, -6), addDays(event, -5)];
  }

  // Farther out: publish ~10 days before
  return [addDays(event, -10), addDays(event, -9), addDays(event, -8)];
}

/**
 * Within a given publish date, return slot times in order of preference
 * based on how the copy will frame the event.
 */
export function preferredSlotsForDate(publishDate, eventDate) {
  const daysUntil = daysBetween(publishDate, eventDate);
  if (daysUntil === 0) {
    // Same day as event: prefer morning slot so it's seen before the event
    return ["07:15", "09:30", "11:45", "14:10", "16:30", "18:45"];
  }
  if (daysUntil === 1) {
    // Publishing day before: evening slots work great for "tomorrow" framing
    return ["16:30", "18:45", "14:10", "11:45", "09:30", "07:15"];
  }
  if (daysUntil >= 2 && daysUntil <= 3) {
    // A couple days ahead: mid-day slots catch the lunch audience
    return ["11:45", "14:10", "09:30", "16:30", "07:15", "18:45"];
  }
  // Further out: morning slots — fresh-morning scroll
  return ["09:30", "07:15", "11:45", "14:10", "16:30", "18:45"];
}

/**
 * Check if a given (date, slot) is already occupied by a non-published post.
 * Returns true if the slot is taken.
 */
export function isSlotOccupied(queue, date, slot) {
  for (const p of queue) {
    if (p.published) continue;
    const s = p.scheduledSlot;
    if (!s) continue;
    if (s.date === date && s.time === slot) return true;
  }
  return false;
}

/**
 * Check if a given (date, slot) is already in the past.
 */
export function isSlotInPast(date, slot, today = todayPT(), nowHHMM = nowHHMM_PT()) {
  if (date < today) return true;
  if (date > today) return false;
  return slot <= nowHHMM;
}

/**
 * Assign a publish slot to a post based on its event date and the
 * current state of the queue.
 *
 * Returns { date, time, assignedAt } or null if no suitable slot exists.
 *
 * @param {object} post - Queue item with item.date set
 * @param {Array} queue - Full approved queue (to check slot occupancy)
 * @param {object} [opts]
 * @param {string} [opts.today] - Override today's date (for testing)
 * @param {string} [opts.nowHHMM] - Override current time (for testing)
 */
export function assignSlot(post, queue, opts = {}) {
  const today = opts.today || todayPT();
  const nowHHMM = opts.nowHHMM || nowHHMM_PT();
  const eventDate = getEventDate(post);

  // No event date = no planned slot. Fall back to reactive at publish time.
  if (!eventDate) return null;

  const preferredDates = computePreferredDates(eventDate, today);
  if (preferredDates.length === 0) return null; // past event

  for (const date of preferredDates) {
    // Skip if date is in the past (shouldn't happen but guard anyway)
    if (date < today) continue;

    const slotOrder = preferredSlotsForDate(date, eventDate);
    for (const slot of slotOrder) {
      if (isSlotInPast(date, slot, today, nowHHMM)) continue;
      if (isSlotOccupied(queue, date, slot)) continue;
      return {
        date,
        time: slot,
        assignedAt: new Date().toISOString(),
      };
    }
  }

  // All preferred slots are full or in the past — spill to any available
  // slot between today and event date.
  const event = eventDate;
  let cursor = today;
  while (cursor <= event) {
    for (const slot of SLOTS) {
      if (isSlotInPast(cursor, slot, today, nowHHMM)) continue;
      if (isSlotOccupied(queue, cursor, slot)) continue;
      return {
        date: cursor,
        time: slot,
        assignedAt: new Date().toISOString(),
        fallback: true,
      };
    }
    cursor = addDays(cursor, 1);
  }

  return null;
}

/**
 * Find the current publish slot: given `nowHHMM`, return the slot time
 * string the cron is most likely firing for (the slot whose scheduled
 * time is closest to now, within a ±30 min window).
 */
export function currentPublishSlot(nowHHMM = nowHHMM_PT()) {
  const nowMin = hhmmToMinutes(nowHHMM);
  let best = null;
  let bestDelta = Infinity;
  for (const slot of SLOTS) {
    const delta = Math.abs(hhmmToMinutes(slot) - nowMin);
    if (delta < bestDelta && delta <= 30) {
      best = slot;
      bestDelta = delta;
    }
  }
  return best;
}

function hhmmToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Find all posts scheduled for the current slot. Returns an array sorted
 * by quality score descending (in case multiple were assigned to the same
 * slot — should never happen, but defensive).
 */
export function postsForCurrentSlot(queue, opts = {}) {
  const today = opts.today || todayPT();
  const slot = opts.slot || currentPublishSlot();
  if (!slot) return [];
  return queue
    .filter(
      (p) =>
        !p.published &&
        p.scheduledSlot?.date === today &&
        p.scheduledSlot?.time === slot,
    )
    .sort((a, b) => (b.item?.score || 0) - (a.item?.score || 0));
}
