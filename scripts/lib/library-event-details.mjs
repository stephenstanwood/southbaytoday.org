// Library attendance instructions often appear after the opening paragraph.
// Preserve them before display-copy shortening or blurb generation, and keep
// the source's audience labels separate from guesses based on the prose.
import { stripHtml } from "./event-html.mjs";

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
  const attendanceNote = uniqueSentences(`${html}\n${instructions}`
    .split(/<\/(?:p|li|div)>|<br\s*\/?>|\n/gi)
    .map(text)
    .filter((paragraph) => /\b(?:tickets?|first[-\s]come|space is limited|limited (?:space|seating))\b/i.test(paragraph)));
  return {
    description: text(html),
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
