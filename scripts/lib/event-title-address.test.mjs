import test from "node:test";
import assert from "node:assert/strict";

import { cleanTitle, trimMeetupCapTruncation } from "../generate-events.mjs";

test("Meetup's title cap does not cut a destination or person at an abbreviation", () => {
  for (const title of [
    "💚Green Excises Wellness 🥾Hike St. Joseph's Hill Preserve🏞️ Rain☔or Shine 🌞",
    "Join our weekend outdoor wellness walk near St. Joseph's Hill Preserve with friends",
    "Join our weekend outdoor wellness walk near Mt. Hamilton with friends and neighbors",
    "Join our community science conversation with Dr. Rivera and all our curious neighbors",
    "Join our community science conversation with A. Rivera and all our curious neighbors",
  ]) {
    assert.ok(title.length >= 78);
    assert.equal(trimMeetupCapTruncation(title), title);
  }
});

test("Meetup's title cap still drops a dangling fragment after a complete sentence", () => {
  const complete = "Join our weekend kite flying meetup and fly for fun! All levels welcome.";
  assert.equal(trimMeetupCapTruncation(`${complete} Bayland`), complete);
  const withPlace = "Join our weekend wellness walk near St. Joseph's Hill Preserve with friends.";
  assert.equal(trimMeetupCapTruncation(`${withPlace} Neighbo`), withPlace);
  for (const title of ["A short title. More", `${complete} All welcome!`, null, ""]) {
    assert.equal(trimMeetupCapTruncation(title), title);
  }
});

// ---------------------------------------------------------------------------
// Mailing addresses concatenated onto event titles
// ---------------------------------------------------------------------------
// SJSU's Localist feed publishes some events with the room and the building's
// full street address glued onto the event name. On a card that renders as a
// 140-character title that repeats what `venue` and `city` already show, and it
// arrived on the Today tab twice in one week ("Weeks of Welcome!" on Sep 8 and
// Sep 9, 2026). cleanTitle cuts the address tail at ingest.

test("strips a room + street address concatenated onto an SJSU title", () => {
  assert.equal(
    cleanTitle(
      "Weeks of Welcome! at Events Center Aerobics Room (First floor), " +
        "1 Washington Square, Student Union, Suite 1400, San Jose, CA 95192, United States",
    ),
    "Weeks of Welcome!",
  );
});

test("strips the address when no 'at' introduced it", () => {
  assert.equal(
    cleanTitle("Farmers Market, 100 Main St, San Jose, CA 95112"),
    "Farmers Market",
  );
});

test("cuts at the last 'at', keeping title text that legitimately contains one", () => {
  assert.equal(
    cleanTitle("Meet at Dawn at the Gardens, 100 Main St, San Jose, CA 95112"),
    "Meet at Dawn",
  );
});

test("accepts a spelled-out state and no country suffix", () => {
  assert.equal(
    cleanTitle("Job Fair at City Hall, 200 E Santa Clara St, San Jose, California 95113"),
    "Job Fair",
  );
});

test("leaves venue names in titles alone when there is no address tail", () => {
  // The guard on the rule: an " at <venue>" title is common and legitimate, and
  // only a real state + ZIP terminator may trigger the cut.
  assert.equal(cleanTitle("Hike at Calero County Park"), "Hike at Calero County Park");
  assert.equal(
    cleanTitle("Bird Walk at Lake Cunningham Park (San Jose)"),
    "Bird Walk at Lake Cunningham Park (San Jose)",
  );
  assert.equal(
    cleanTitle("Concert at the Mountain Winery, Saratoga"),
    "Concert at the Mountain Winery, Saratoga",
  );
  // "CA <digits>" mid-title is not a terminator either.
  assert.equal(
    cleanTitle("Talk: Life in CA 95112 and Beyond"),
    "Talk: Life in CA 95112 and Beyond",
  );
});
