/**
 * Normalize an absolute HTTP(S) URL, rejecting malformed concatenated origins.
 *
 * `new URL()` alone accepts strings such as
 * `https://volunteer.openspace.orghttps//s3.amazonaws.com/image.jpg` by
 * interpreting `volunteer.openspace.orghttps` as the hostname. Those values
 * look absolute to downstream schema/render code but are not fetchable URLs.
 */
export function normalizeAbsoluteHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname || /https?$/i.test(url.hostname) || url.pathname.startsWith("//")) return null;
    return url.href;
  } catch {
    return null;
  }
}
