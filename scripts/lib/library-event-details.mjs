// Library attendance instructions often appear after the opening paragraph.
// Preserve them before display-copy shortening or blurb generation, and keep
// the source's audience labels separate from guesses based on the prose.
import { stripHtml } from "./event-html.mjs";
import { displayDate, displayTime, isoDate, parseDatePT } from "./dates.mjs";

/** Correct the district's copied accessibility-form help number in display copy.
 * https://sccld.org/accessibility/ lists 3947. Circulation still uses 3945. */
export function correctSccLibraryAccessibilityContact(event) {
  if (event.source !== "Santa Clara County Library" || typeof event.description !== "string") return event;
  const description = event.description.replace(
    /(sccld\.org\/accessibility\b[^.!?]*\.\s+If you need assistance with the form, speak with a staff member at your local library, call )\(408\) 540-3945\b/gi,
    "$1(408) 540-3947",
  );
  return description === event.description ? event : { ...event, description };
}

// The same resolved window that the library uses for its event listing.
export async function fetchRegistrationWindow(
  { libraryId, eventId },
  { fetchImpl = fetch, timeoutMs = 10_000, log = console.warn } = {},
) {
  try {
    const response = await fetchImpl(
      `https://${libraryId}.bibliocommons.com/events/events/${eventId}/registration_windows?client_scope=events`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const status = String(data?.event?.status || "").toUpperCase();
    if (!["ACTIVE", "UPCOMING", "ENDED"].includes(status)) return null;
    return { status, closesBy: parseDatePT(data.event.window_end) };
  } catch (error) {
    log(`registration re-check: ${libraryId}/${eventId} windows fetch failed (${error?.message || error}) — keeping feed state`);
    return null;
  }
}

export async function fetchRegistrationWindowStatus(ref, options) {
  return (await fetchRegistrationWindow(ref, options))?.status ?? null;
}

// BiblioCommons date-only ranges include their final calendar day. A display
// that opened at midnight must stay listed after that instant, through its
// published end, without turning midnight into visiting hours. Timed classes
// and overnight events keep their ordinary start-time cutoff.
export function biblioEventOccurrence(event, now = new Date()) {
  const startValue = event.start || event.definition?.start;
  const endValue = event.end || event.definition?.end;
  const start = parseDatePT(startValue);
  const end = parseDatePT(endValue);
  if (!start) return null;

  const startDate = isoDate(start);
  const endDate = isoDate(end);
  const today = isoDate(now);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(startValue || "")
    && /^\d{4}-\d{2}-\d{2}$/.test(endValue || "");
  // Compare local calendar days, rather than 24-hour durations, across DST.
  const ongoing = endDate > startDate && displayTime(start) === displayTime(end);
  if (start < now && !ongoing) return null;
  if (ongoing && (dateOnly ? endDate < today : end <= now)) return null;

  const visibleStart = ongoing && startDate < today ? parseDatePT(today) : start;
  return {
    start,
    end,
    fields: {
      date: isoDate(visibleStart),
      displayDate: displayDate(visibleStart),
      time: ongoing ? null : displayTime(start),
      endTime: ongoing ? null : end && end.getTime() !== start.getTime() ? displayTime(end) : null,
      ...(ongoing ? { ongoing: true, startDate, endDate } : {}),
    },
  };
}

const text = (html) => stripHtml(String(html || "").replace(/<!--[^]*?-->/g, ""));

export function libraryEventDetails(event, entities = {}) {
  const definition = event.definition || event;
  const labels = [
    ...(event.audiences || []),
    ...(definition.audienceIds || []).map((id) => entities.eventAudiences?.[id]),
  ];
  const sourceAudiences = [...new Set(labels.map((label) =>
    text(typeof label === "string" ? label : label?.name)).filter(Boolean))];
  const html = event.description || definition.description || event.shortdesc || "";
  const instructions = definition.registrationInfo?.instructions || "";
  // Dedupe at the sentence, not the paragraph: SJPL's After-School STEaM page
  // carries "Free, with limited capacity. Tickets will be distributed starting
  // 60 minutes before the program." once as the series note and again inside
  // the week's own paragraph with an extra age line, so a paragraph-level Set
  // printed the ticket sentence twice in the 2026-09-15 issue.
  const attendanceParagraphs = `${html}\n${instructions}`
    .split(/<\/(?:p|li|div)>|<br\s*\/?>|\n/gi)
    .map(text)
    .filter((paragraph) => {
      // A board-game name and a lesson on booking museum passes do not
      // establish admission instructions for the library event itself.
      // Mask only those phrases so actual ticket rules in the same paragraph
      // still qualify, and preserve the original paragraph when they do.
      const attendanceText = paragraph
        .replace(/\bTicket\s+to\s+Ride\b/gi, "")
        .replace(/\b(?:Using\s+)?Discover\s*(?:&|and)\s*Go\s+to\s+reserve\s+(?:(?:free|reduced)(?:\s+or\s+(?:free|reduced))?\s+)?tickets\s+to\s+(?:local\s+)?museums(?:\s+and\s+attractions)?/gi, "");
      // SJPL's Mandarin story sessions publish their capacity and ticket
      // pickup condition in Chinese. Preserve that original paragraph too.
      return /\b(?:tickets?|first[-\s]come|space is limited|limited (?:space|seating))\b|\b(?:registration|enrollment)\s+(?:is\s+)?(?:now\s+)?closed\b|\bthis\s+(?:event|class|session|program)\s+is\s+(?:now\s+)?full\b|\b(?:by\s+)?appointments?\s+only\b|\b(?:one|1)\s+appointment\s+per\s+(?:week|month)\s+per\s+person\b|\bpor\s+cita\s+(?:únicamente|unicamente|previa)\b|座位数量有限|门票将在故事时间开始前\s*\d+\s*分钟/i.test(attendanceText);
    });
  // An optional appointment must not hide the condition on walk-up access.
  // Select only that sentence, since unused booking directions can name a
  // different branch and the source may HTML-encode its paragraph breaks.
  const walkUpCaveats = text(instructions).split(/(?<=[.!?])\s+/)
    .filter((sentence) => /\b(?:drop[-\s]?ins?|walk[-\s]?ins?)\b[^.!?]*\b(?:availability|space|capacity)\b/i.test(sentence));
  // Book club signup can be in the description alone. Keep the pickup
  // instruction visible even when there is no online registration form.
  const bookPickup = text(html).split(/(?<=[.!?])\s+/)
    .filter((sentence) => /^sign up and pick up a copy\b/i.test(sentence));
  const attendanceNote = uniqueSentences([...attendanceParagraphs, ...walkUpCaveats, ...bookPickup]);
  return {
    description: stripHtml(String(html).replace(/<!--[^]*?-->/g, ""), { preserveLists: true }),
    ...(sourceAudiences.length ? { sourceAudiences } : {}),
    ...(attendanceNote ? { attendanceNote } : {}),
  };
}

function uniqueSentences(paragraphs) {
  const seen = new Set();
  const out = [];
  for (const paragraph of paragraphs) {
    for (const sentence of String(paragraph || "").split(/(?<=[.!?])\s+/)) {
      const clean = sentence.trim();
      if (!clean) continue;
      const key = clean.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
    }
  }
  return out.join(" ");
}
