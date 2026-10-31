import test from "node:test";
import assert from "node:assert/strict";
import { applyVerifiedEventFacts, eventCopyFactConflict } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const storytime = {
  id: "inbound-18a47ddd3c8b3ca7",
  title: "Museum Minis: Storytime and Art for Ages 5 and Younger",
  date: "2026-11-16",
  time: "11:15 AM",
  endTime: "12:15 PM",
  venue: "Anderson Collection at Stanford University",
  city: "palo-alto",
  category: "family",
  url: "https://events.stanford.edu/event/November-museum-minis-storytime-at-the-anderson",
  source: "City Newsletter",
  description: "Storytime and art for young children and caregivers featuring the book Ruby's Sword. No RSVP needed; walk-ins welcome.",
  blurb: "Listen to a reading of Ruby's Sword, then make art with your kids ages five and under; walk-ins are welcome.",
};

test("Museum Minis publication preserves storytime without inventing an art-making activity", async () => {
  const input = structuredClone(storytime), events = [structuredClone(input)];
  await resolveEventBlurbs(events, { enabled: false });
  assert.equal(events[0].blurb, "Listen to a reading of Ruby's Sword and explore artworks with your kids ages five and under; walk-ins are welcome.");
  for (const key of Object.keys(input)) if (key !== "blurb") assert.deepEqual(events[0][key], input[key], key);
  assert.deepEqual(storytime, input);
  assert.deepEqual(applyVerifiedEventFacts(events[0]), events[0]);
});

test("Museum Minis checks reject new unsupported art activities while respecting updated organizer copy", () => {
  for (const copy of [storytime.blurb, "Create art with your child.", "Enjoy hands-on art making.", "Draw your own masterpiece."]) {
    assert.equal(eventCopyFactConflict(copy, storytime), "unsupported art-making activity");
  }
  assert.equal(eventCopyFactConflict("Hear Ruby's Sword and look at artworks with your child.", storytime), null);
  assert.equal(eventCopyFactConflict("Museum Minis invites families to look at artworks. Make art at another workshop.", storytime), null);
  assert.equal(eventCopyFactConflict("Make art with your child.", { ...storytime, description: "Storytime and looking closely at a painting." }), "unsupported art-making activity");
  for (const control of [
    { ...storytime, date: "2027-11-16" },
    { ...storytime, url: "https://events.stanford.edu/event/another-program" },
    { ...storytime, description: "Hear Ruby's Sword, then make art with your child." },
    { ...storytime, description: "Storytime followed by a painting workshop for families." },
  ]) {
    assert.deepEqual(applyVerifiedEventFacts(control), control);
    assert.equal(eventCopyFactConflict(control.blurb, control), null);
  }
});
