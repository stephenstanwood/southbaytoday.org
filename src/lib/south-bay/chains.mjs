// ---------------------------------------------------------------------------
// Chain detection and editorial-interest signals for recommendation surfaces.
//
// The day-plan "field guide" and newsletter are supposed to read like a local
// friend's picks — a Peet's or an Elements Massage as a recommended stop reads
// as filler (both actually shipped in the 2026-07-14 email, and the newsletter
// editorial memory had flagged chains for weeks with no effect because the
// guidance never reached plan generation). places.json carries ~100 chain
// entries because Google text search returns them; there is no chain flag in
// the data, so we detect by brand name here.
//
// Scope: identify commodity brands nobody needs a local briefing to discover,
// then require a branch-specific interest signal downstream. Borderline
// destination chains (e.g. Topgolf, Somi Somi) remain outside the detector.
// ---------------------------------------------------------------------------

const CHAIN_PATTERNS = [
  // Coffee / bakery / juice
  /\bstarbucks\b/, /\bpeet'?s coffee\b/, /\bphilz coffee\b/, /\bblue bottle\b/,
  /\bdunkin'?\b/, /\bkrispy kreme\b/, /\bpanera\b/, /\bjamba\b/,
  /\b85 ?°?c bakery\b/, /\bparis baguette\b/, /\btous les jours\b/,
  /\bnoah'?s (new york )?bagels\b/, /\beinstein bros\b/, /\bboudin\b/,
  /\bspecialty'?s\b/, /\bcoffee bean & tea leaf\b/,
  // Boba / dessert
  /\bkung fu tea\b/, /\bgong cha\b/, /\bsharetea\b/, /\bhappy lemon\b/,
  /\bding tea\b/, /\btp tea\b/, /\b7 leaves\b/, /\bquickly\b/,
  /\bbaskin[- ]?robbins\b/, /\bcold stone\b/, /\bben & jerry'?s\b/,
  /\bh[äa]agen[- ]?dazs\b/, /\bmenchie'?s\b/, /\byogurtland\b/, /\bpinkberry\b/,
  // Fast food / fast casual
  /\bmcdonald'?s\b/, /\bburger king\b/, /\bwendy'?s\b/, /\btaco bell\b/,
  /\bkfc\b/, /\bpopeyes\b/, /\bchick[- ]?fil[- ]?a\b/, /\bin[- ]?n[- ]?out\b/,
  /\bfive guys\b/, /\bshake shack\b/, /\bhabit burger\b/, /\bsmashburger\b/,
  /\bchipotle\b/, /\bqdoba\b/, /\bel pollo loco\b/, /\bpanda express\b/,
  /\bwingstop\b/, /\braising cane'?s\b/, /\bsubway\b/, /\bjersey mike'?s\b/,
  /\btogo'?s\b/, /\bjimmy john'?s\b/, /\bsweetgreen\b/, /\bmendocino farms\b/,
  /\bmod pizza\b/, /\bblaze pizza\b/, /\bpieology\b/, /\bround table\b/,
  /\bdomino'?s\b/, /\bpizza hut\b/, /\bpapa john'?s\b/, /\blittle caesars\b/,
  /\bmountain mike'?s\b/, /\blee'?s sandwiches\b/, /\bcrumbl\b/,
  /\bfosters freeze\b/, /\bthe melt\b/,
  // Sit-down chains
  /\bolive garden\b/, /\bcheesecake factory\b/, /\bapplebee'?s\b/, /\bchili'?s\b/,
  /\bdenny'?s\b/, /\bihop\b/, /\boutback\b/, /\bred lobster\b/,
  /\bbj'?s restaurant\b/, /\bbuffalo wild wings\b/, /\bp\.? ?f\.? ?chang'?s\b/,
  /\byard house\b/, /\bcalifornia pizza kitchen\b/, /\bdave & buster'?s\b/,
  /\bchuck e\.? cheese\b/, /\bblack bear diner\b/, /\bfirst watch\b/,
  // Wellness / fitness / services
  /\belements massage\b/, /\bmassage envy\b/, /\borangetheory\b/,
  /\b24 hour fitness\b/, /\bplanet fitness\b/, /\bcrunch fitness\b/,
  /\bequinox\b/, /\bcorepower\b/, /\bclub pilates\b/, /\bdrybar\b/,
  /\beuropean wax\b/, /\bhand & stone\b/, /\bstretchlab\b/,
  // Retail (as "activity" picks)
  /\bbarnes & noble\b/, /^target( grocery)?$/, /\bwalmart\b/, /\bcostco\b/,
  /\bbest buy\b/, /\bdick'?s sporting\b/, /^rei( co-?op)?$/, /\bikea\b/,
  /^michaels$/, /\bhobby lobby\b/, /\bdaiso\b/,
  // Cinema chains (indie theaters stay)
  /\bamc \w+/, /\bcinemark\b/, /\bcentury (theatres|theaters|cinemas?)\b/, /\bregal \w+/,
];

function normalizeForChainMatch(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True if a place name reads as a national/commodity chain. Detection is not
 * a blanket ban: an individual branch can still qualify when it is new,
 * distinctive, unusually well-regarded, or backed by a real editorial note.
 * Events HOSTED at a chain are not this function's concern.
 */
export function isNationalChain(name) {
  const n = normalizeForChainMatch(name);
  if (!n) return false;
  return CHAIN_PATTERNS.some((re) => re.test(n));
}

const LOCATION_SUFFIXES = [
  "campbell", "cupertino", "los altos", "los gatos", "milpitas",
  "mountain view", "palo alto", "san jose", "santa clara", "saratoga",
  "sunnyvale", "willow glen", "downtown",
];

/** Normalize location-suffixed names so local multi-location brands count as
 * one family ("Aqui Campbell" / "Aqui Cupertino", "Bill's Cafe - Willow"). */
export function chainBrandKey(name) {
  let value = String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[‘’']/g, "'")
    .replace(/\s+[-–—]\s+.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const suffix of LOCATION_SUFFIXES) {
    if (value.endsWith(` ${suffix}`)) {
      value = value.slice(0, -(suffix.length + 1)).trim();
      break;
    }
  }
  return value.replace(/[^a-z0-9]+/g, " ").trim();
}

/** Why a specific chain branch earns editorial consideration. An empty list
 * means it is just a convenient generic branch and should not be a pick. */
export function chainInterestReasons(place = {}) {
  const reasons = [];
  if (place.newlyOpened === true) reasons.push("verified new opening");
  if (Number(place.foodDistinctiveness || 0) >= 6) reasons.push("distinctive format or cuisine");
  if ((place.category || "food") === "food" && Number(place.rating || 0) >= 4.6 && Number(place.ratingCount || 0) >= 500) {
    reasons.push("standout branch reputation");
  }
  const note = String(place.blurb || place.description || "").trim();
  if (place.curated === true && note.length >= 70) reasons.push("specific editorial note");
  return reasons;
}
