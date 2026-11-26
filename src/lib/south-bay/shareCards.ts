// Images for link previews and structured data. Google Places photos stay on
// the pages themselves, where they are cached and credited. Previews and
// crawler-read metadata use South Bay Today's own cards instead: preview
// crawlers re-fetch these URLs often, and every fetch of a Google photo is a
// paid download (docs/place-photos.md).

const SITE = "https://southbaytoday.org";

/** Cities with a card in public/og (scripts/generate-og-images.mjs skips santa-cruz). */
export const CITY_SHARE_CARD_IDS: ReadonlySet<string> = new Set([
  "campbell",
  "cupertino",
  "los-altos",
  "los-gatos",
  "milpitas",
  "mountain-view",
  "palo-alto",
  "san-jose",
  "santa-clara",
  "saratoga",
  "sunnyvale",
]);

export const SITE_SHARE_CARD = `${SITE}/images/og-image.png`;

/** The city's share card, or null when the city has none. */
export function cityShareCard(cityId: string | null | undefined): string | null {
  return cityId && CITY_SHARE_CARD_IDS.has(cityId) ? `${SITE}/og/og-city-${cityId}.jpg` : null;
}
