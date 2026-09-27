const MACINTALKERS_GROUP = "d101tm";
const MACINTALKERS_PROFILE_URL =
  "https://www.toastmasters.org/Find-a-Club/00007430-macintalkers-club";

// Meetup currently publishes 5:30-7:30 for these occurrences. The club's own
// site and Toastmasters profile both publish the meeting start as 5:40 PM; the
// club site also gives the 7 PM end. Keep Meetup as the date-specific
// occurrence source, but normalize these durable club facts.
export function applyVerifiedMeetupEventOverride(event, { groupUrlname = "" } = {}) {
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
