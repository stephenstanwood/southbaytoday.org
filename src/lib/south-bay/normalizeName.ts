// ---------------------------------------------------------------------------
// normalizeName — canonical form for dedup-matching venue/event/place names.
//
// Matches "Hakone Estate & Gardens" against "Hakone Estate and Gardens",
// "O'Flaherty's" against "O\u2019Flaherty's", etc. Used by the day-plan blocked-names
// set and by post-gen-review's venue-repeat detection so a rewritten name
// from Claude still dedups against the original.
// ---------------------------------------------------------------------------

export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).toLowerCase();
  // Straighten curly quotes/apostrophes/dashes.
  s = s.replace(/[\u2018\u2019\u02BC]/g, "'");
  s = s.replace(/[\u201C\u201D]/g, '"');
  s = s.replace(/[\u2013\u2014]/g, "-");
  // Collapse " & " <-> " and " so both spell the same canonical form.
  s = s.replace(/\s+&\s+/g, " and ");
  // Strip possessive/regular apostrophes: "O'Flaherty's" → "oflahertys"
  s = s.replace(/'/g, "");
  // Collapse punctuation to spaces.
  s = s.replace(/[^a-z0-9]+/g, " ");
  // Collapse whitespace and trim.
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export default normalizeName;
