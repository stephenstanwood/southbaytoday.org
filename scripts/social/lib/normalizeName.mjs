// ---------------------------------------------------------------------------
// normalizeName (JS mirror of src/lib/south-bay/normalizeName.ts)
// Keep in sync — scripts share this via import rather than reaching into the
// TS file, which is awkward from .mjs.
// ---------------------------------------------------------------------------

export function normalizeName(raw) {
  if (!raw) return "";
  let s = String(raw).toLowerCase();
  s = s.replace(/[\u2018\u2019\u02BC]/g, "'");
  s = s.replace(/[\u201C\u201D]/g, '"');
  s = s.replace(/[\u2013\u2014]/g, "-");
  s = s.replace(/\s+&\s+/g, " and ");
  s = s.replace(/'/g, "");
  s = s.replace(/[^a-z0-9]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export default normalizeName;
