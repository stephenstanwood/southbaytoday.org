// Recover the publisher city when the newsletter extractor omits cityKey.
//
// Keep this intentionally narrow: sender identities are stronger evidence than
// newsletter prose, but only exact, repeatedly observed official addresses are
// allowed to supply the fallback. The event's own location still gets the final
// say in resolveEventCity() when it names one covered city.

const CITY_BY_OFFICIAL_SENDER = new Map([
  ["mountainview@public.govdelivery.com", "mountain-view"],
  ["cityofsunnyvale@public.govdelivery.com", "sunnyvale"],
  ["prcustomerserve@info.santaclaraca.gov", "santa-clara"],
  ["news@info.santaclaraca.gov", "santa-clara"],
  ["cardinal@mail.gostanford.com", "palo-alto"],
  ["latest@email.live.stanford.edu", "palo-alto"],
]);

export function inboundPublisherCity(event) {
  const explicit = String(event?.cityKey ?? "").trim().toLowerCase();
  if (explicit) return explicit;

  const sender = String(event?.fromEmail ?? "").trim().toLowerCase();
  return CITY_BY_OFFICIAL_SENDER.get(sender) ?? null;
}
