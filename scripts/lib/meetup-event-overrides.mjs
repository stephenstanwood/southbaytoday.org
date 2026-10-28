const MACINTALKERS_GROUP = "d101tm";
const MACINTALKERS_PROFILE_URL =
  "https://www.toastmasters.org/Find-a-Club/00007430-macintalkers-club";

// Meetup currently publishes 5:30-7:30 for these occurrences. The club's own
// site and Toastmasters profile both publish the meeting start as 5:40 PM; the
// club site also gives the 7 PM end. Keep Meetup as the date-specific
// occurrence source, but normalize these durable club facts.
export function applyVerifiedMeetupEventOverride(event, { groupUrlname = "", sourceDescription = "" } = {}) {
  // The title and route details disagree on mileage. Preserve the organizer's
  // title, disclose both figures, and avoid repeating either as a verified
  // distance in generated copy. Recheck the fresh body so a resolved conflict
  // does not leave a stale warning. Evidence: docs/qa/2026-10-28-1007-fact-check.md.
  if (event?.date === "2026-11-14"
    && /\/events\/317099274\/?(?:\?|$)/.test(String(event?.url || ""))) {
    const distanceConflict = /\b7\.3\s+Mile\b/i.test(event.title || "")
      && /Total Distance:\*{0,2}\s*7\.6\s+miles\b/i.test(sourceDescription);
    const waiverRequired = /please sign this waiver\b/i.test(sourceDescription)
      && /online prior to arriving\b/i.test(sourceDescription);
    const notes = [
      distanceConflict && "The organizer's title says 7.3 miles, but its route description says 7.6 miles. Confirm the route length before going.",
      waiverRequired && "Sign the organizer's event waiver online before arriving.",
    ].filter(Boolean);
    return {
      ...event,
      category: "outdoor",
      ...(notes.length ? { attendanceNote: notes.join(" ") } : {}),
      ...(distanceConflict ? { blurb: "Join Sleep Late and Hike for a moderate hike at Almaden Quicksilver, starting from the Hacienda entrance." } : {}),
    };
  }
  // The header ends at 9 PM while the organizer's body says 8:30 PM. Keep
  // the source clocks and disclose the disagreement only while it persists.
  // https://www.meetup.com/sf-mcp-devs/events/316977267/
  // Evidence: docs/qa/2026-10-27-1107-fact-check.md (authenticated exact ID).
  if (event?.date === "2026-11-10"
    && /\/events\/316977267\/?(?:\?|$)/.test(String(event?.url || ""))
    && event.time === "6:00 PM" && event.endTime === "9:00 PM"
    && /\b6:00\s*[-–—]\s*8:30\s*PM\b/i.test(sourceDescription)) {
    return {
      ...event,
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The organizer's event header lists 6–9 PM, but its description says 6–8:30 PM. Confirm the end time with the organizer before going.",
    };
  }
  // The November 3 header says 6–7:15 PM; the organizer's body says
  // 7–8:30 PM. Preserve the clocks and disclose the disagreement only while
  // the fresh source still conflicts. Evidence: docs/qa/2026-10-26-0707-fact-check.md.
  if (event?.date === "2026-11-03"
    && /\/events\/316989193\/?(?:\?|$)/.test(String(event?.url || ""))
    && event.time === "6:00 PM" && event.endTime === "7:15 PM"
    && /7:00\s*[-–—]\s*8:30\s*PM/i.test(sourceDescription)) {
    return {
      ...event,
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The organizer's event header lists 6–7:15 PM, but its description says 7–8:30 PM. Confirm the session time with Mantra Room before going.",
    };
  }
  // Both verified occurrences repeat an October 19 date in their bodies.
  // Keep the source's header and disclose the disagreement. A fresh, corrected
  // body must stop triggering this warning.
  // https://www.meetup.com/san-jose-friends-roommate-finder/events/316998975/
  // Evidence: docs/qa/2026-10-24-1707-fact-check.md and
  // docs/qa/2026-10-27-0307-fact-check.md (authenticated exact-ID API records).
  const roommateOccurrence = [
    ["2026-10-26", "316998975", "October 26"],
    ["2026-11-09", "316998965", "November 9"],
  ].find(([date, id]) => event?.date === date
    && String(event?.url || "").match(/\/events\/(\d+)\/?(?:\?|$)/)?.[1] === id);
  if (roommateOccurrence
    && /\bMon(?:day)?\s+Oct(?:ober)?\.?\s+19\b/i.test(sourceDescription)) {
    return {
      ...event,
      attendanceStatus: "needs-confirmation",
      attendanceNote: `The organizer's event header says Monday, ${roommateOccurrence[2]}, but its description says Monday, October 19. Confirm the date with the organizer before going.`,
    };
  }

  // The venue field contains only a street address; the same occurrence's
  // body explicitly supplies the business name. Preserve revised source venues.
  // https://www.meetup.com/nvst-capital-real-estate-meetup/events/316660427/
  if (event?.date === "2026-11-10"
    && /\/events\/316660427\/?(?:\?|$)/.test(String(event?.url || ""))
    && !event.venue
    && /\bAlphaX RE Capital,\s*10275 N De Anza Blvd\b/i.test(sourceDescription)) {
    return { ...event, venue: "AlphaX RE Capital" };
  }

  // The organizer's occurrence venue is John D. Morgan Park, but its body
  // refers to Baylands Park. Do not choose a park for the reader. Test the
  // fresh source body so consistent revised instructions retain their terms.
  // https://www.meetup.com/connected-through-music/events/317105031/
  // Evidence: docs/qa/2026-10-24-1007-fact-check.md.
  if (event?.date === "2026-11-14"
    && /\/events\/317105031\/?(?:\?|$)/.test(String(event?.url || ""))
    && /^John D\. Morgan Park$/i.test(event?.venue || "")
    && /\bBaylands\s+park\b/i.test(sourceDescription)) {
    return {
      ...event,
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The organizer's venue field lists John D. Morgan Park in Campbell, while its description refers to Baylands Park. Confirm the meeting location with the organizer before going.",
    };
  }

  // The source calls this a Vasona Lake walk but explicitly meets at Oak Meadow
  // Park's entrance parking lot by the airplane. The generic "Parking lot"
  // venue was discarded at ingest and replaced with the organizing club.
  // https://www.meetup.com/bay-area-hiking-walking-wellness-club/events/316788593/
  if (event?.date === "2026-11-07"
    && /\/events\/316788593\/?(?:\?|$)/.test(String(event?.url || ""))) {
    return { ...event, venue: "Oak Meadow Park parking lot" };
  }

  // The organizer's title names the festival, but this listing is a group walk
  // from Safeway to the festival at Civic Center Lawn. Keep the meetup time and
  // URL; label its actual meeting point so readers do not go to Safeway for the
  // festival itself. Source: https://www.meetup.com/30-chill-women-trying-to-figure-shit-out-make-friends/events/316047950/
  if (/\/events\/316047950\/?(?:\?|$)/.test(String(event?.url || ""))) {
    return {
      ...event,
      title: "Group walk to Los Gatos Art & Wine Festival",
      venue: "Safeway meetup point",
      description: "Meet at Safeway on North Santa Cruz Avenue for a one-mile group walk to the Los Gatos Art & Wine Festival at Civic Center Lawn.",
    };
  }

  if (String(groupUrlname).toLowerCase() !== MACINTALKERS_GROUP) return event;
  if (!/^macintalkers weekly meeting$/i.test(String(event?.title || "").trim())) return event;

  const atInfiniteLoop = /\b1\s+infinite\s+loop\b/i.test(String(event?.address || ""));

  return {
    ...event,
    title: "MacinTalkers Toastmasters",
    time: "5:40 PM",
    endTime: "7:00 PM",
    ...(atInfiniteLoop
      ? {
          venue: "Apple, Inc.",
          address: "1 Infinite Loop, Cupertino, CA 95014",
        }
      : {}),
    description: atInfiniteLoop
      ? "MacinTalkers meets in person at Apple and welcomes guests; contact the club because the meeting room may change."
      : "MacinTalkers meets in person and welcomes guests; contact the club because the meeting room may change.",
    organizerName: "MacinTalkers Club",
    organizerUrl: MACINTALKERS_PROFILE_URL,
  };
}
