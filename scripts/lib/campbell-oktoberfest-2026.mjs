// The organizer publishes two dates with different closing times. Newsletter
// extraction kept only Saturday, omitted admission, and lost the family flag.
// https://campbelloktoberfest.com/ — verified October 17, 2026.
// Evidence: docs/qa/2026-10-17-0307-fact-check.md.
const SOURCE_URL = "https://campbelloktoberfest.com";
const CHECKED_AT = "2026-10-17T10:10:09.000Z";
const SCHEDULE = [
  { date: "2026-10-17", displayDate: "Sat, Oct 17", endTime: "6:00 PM", id: "inbound-db1a800a2b149cef" },
  { date: "2026-10-18", displayDate: "Sun, Oct 18", endTime: "5:00 PM", id: "campbell-oktoberfest-2026-10-18" },
];

function isFestivalRow(event) {
  if (!SCHEDULE.some(({ date }) => event?.date === date)) return false;
  if (SCHEDULE.some(({ id }) => event.id === id)) return true;
  if (event.city !== "campbell" || !/^Campbell Oktoberfest$/i.test(event.title || "")) return false;
  try {
    const url = new URL(event.url);
    return url.hostname.replace(/^www\./, "") === "campbelloktoberfest.com" && url.pathname === "/";
  } catch {
    return false;
  }
}

/** Only the two verified 2026 sessions; never infer annual or daily recurrence. */
export function mergeCampbellOktoberfest(events, { fromDate = "0000-01-01" } = {}) {
  const matches = events.filter(isFestivalRow);
  const rest = events.filter((event) => !isFestivalRow(event));
  const canonicalEvents = SCHEDULE.filter(({ date }) => date >= fromDate).map((session) => {
    // Venue art applies to either day; firstSeenAt belongs to its own occurrence.
    const own = matches.find((event) => event.date === session.date);
    const art = own || matches[0] || {};
    const preserved = {};
    for (const key of ["image", "imageAlt", "imageSourceUrl", "photoRef"]) {
      if (art[key]) preserved[key] = art[key];
    }
    if (own?.firstSeenAt) preserved.firstSeenAt = own.firstSeenAt;
    return {
      ...preserved,
      ...session,
      title: "Campbell Oktoberfest",
      time: "10:00 AM",
      venue: "Downtown Campbell",
      address: "Downtown Campbell",
      city: "campbell",
      category: "food",
      cost: "free",
      costNote: "Food, drinks and Kinderplatz tickets sold separately.",
      description: "A free, family-friendly festival in Downtown Campbell with live music, artisan booths, food vendors, and a Kids Zone.",
      url: SOURCE_URL,
      source: "Campbell Chamber of Commerce",
      kidFriendly: true,
      audienceAge: "all",
      blurb: "Sip beer, snack on pretzels, and wander polka bands and vendor booths through Downtown Campbell.",
      occurrenceEvidence: {
        kind: "first-party-occurrence-page", date: session.date,
        sourceUrl: SOURCE_URL, checkedAt: CHECKED_AT,
      },
    };
  });
  return {
    events: [...rest, ...canonicalEvents],
    canonicalEvents,
    replacedCount: matches.length,
    addedCount: canonicalEvents.filter((event) => !matches.some((row) => row.date === event.date)).length,
  };
}
