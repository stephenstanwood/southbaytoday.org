import test from "node:test";
import assert from "node:assert/strict";

import {
  parseLindenTreeHeadingLines,
  resolveLindenTreeOffsiteVenue,
  lindenTreeIsTicketed,
  lindenTreeEventFacts,
} from "./linden-tree-heading.mjs";

test("Linden Tree's book-club body retains email RSVP and its advertised age without inventing free admission", () => {
  const facts = lindenTreeEventFacts("Middle Grade Book Club: The Wish Ring Cipher\nSunday, November 29 at 4pm",
    "It's the next meeting of our middle grade book club for ages 9+! This month's book is The Wish Ring Cipher. Please email the bookseller to RSVP.");
  assert.deepEqual(facts, { cost: null, registration: "required", kidFriendly: true, audienceAge: "kids" });
  assert.deepEqual(lindenTreeEventFacts("Author Talk"), { cost: null });
});

test("Linden Tree keeps explicit free admission separate from paid tickets and optional reminders", () => {
  assert.equal(lindenTreeEventFacts("Author Talk", "This event is free, but purchase a book to enter the signing line.").cost, "free");
  assert.equal(lindenTreeEventFacts("Book Launch\nBuy Tickets Now »", "Free parking.").cost, "paid");
  assert.equal(lindenTreeEventFacts("Author Talk", "Free parking and free refreshments.").cost, null);
  assert.equal(lindenTreeEventFacts("Author Talk", "No RSVP required. Sign up for a reminder.").registration, undefined);
  assert.equal(lindenTreeEventFacts("Author Talk", "Registration is at full capacity.").registration, "full");
  assert.equal(lindenTreeEventFacts("Workshop", "A workshop for ages 50+.").audienceAge, undefined);
});

// ---------------------------------------------------------------------------
// parseLindenTreeHeadingLines
// ---------------------------------------------------------------------------

test("a single-line heading is the title unchanged", () => {
  const { title, offsiteVenueText } = parseLindenTreeHeadingLines([
    "Storytime with Claire Wrenn Bobrow",
  ]);
  assert.equal(title, "Storytime with Claire Wrenn Bobrow");
  assert.equal(offsiteVenueText, null);
});

test("a subtitle line joins the title with an em dash instead of welding to it", () => {
  // The exact heading that shipped as "…and GalaxiesYA Fantasy Author Panel…".
  const { title } = parseLindenTreeHeadingLines([
    "To the Stars and Back: Love Across Eons and Galaxies",
    "YA Fantasy Author Panel with T.A. Chan, Samantha Chong, and S.G. Prince",
  ]);
  assert.equal(
    title,
    "To the Stars and Back: Love Across Eons and Galaxies — YA Fantasy Author Panel with T.A. Chan, Samantha Chong, and S.G. Prince",
  );
  assert.ok(!/GalaxiesYA/.test(title));
});

test("the second glued heading in the feed also separates", () => {
  const { title } = parseLindenTreeHeadingLines([
    "Book Launch with Mike Chen",
    "In conversation with Randy Ribay",
  ]);
  assert.equal(title, "Book Launch with Mike Chen — In conversation with Randy Ribay");
});

test("an 'at <Venue>' line is pulled out of the title as an off-site venue", () => {
  const { title, offsiteVenueText } = parseLindenTreeHeadingLines([
    "Book Launch with Raina Telgemeier and Gale Galligan",
    "at Gunn High School’s Spangenberg Theater",
  ]);
  assert.equal(title, "Book Launch with Raina Telgemeier and Gale Galligan");
  assert.equal(offsiteVenueText, "Gunn High School’s Spangenberg Theater");
});

test("a subtitle that merely contains 'at' is not read as a venue", () => {
  const { title, offsiteVenueText } = parseLindenTreeHeadingLines([
    "Middle Grade Book Club",
    "A look at The Missing Magic of Sparrow Xia",
  ]);
  assert.equal(offsiteVenueText, null);
  assert.equal(title, "Middle Grade Book Club — A look at The Missing Magic of Sparrow Xia");
});

test("blank and whitespace-only lines are dropped, inner whitespace collapses", () => {
  const { title } = parseLindenTreeHeadingLines([
    "  Book   Launch  ",
    "",
    "   ",
    "with James Ponti",
  ]);
  assert.equal(title, "Book Launch — with James Ponti");
});

test("only the first venue line is treated as a venue", () => {
  const { title, offsiteVenueText } = parseLindenTreeHeadingLines([
    "Author Night",
    "at Spangenberg Theatre",
    "at 6pm sharp",
  ]);
  assert.equal(offsiteVenueText, "Spangenberg Theatre");
  assert.equal(title, "Author Night — at 6pm sharp");
});

test("empty and non-array input yields an empty title, not a crash", () => {
  assert.deepEqual(parseLindenTreeHeadingLines([]), { title: "", offsiteVenueText: null });
  assert.deepEqual(parseLindenTreeHeadingLines(null), { title: "", offsiteVenueText: null });
  assert.deepEqual(parseLindenTreeHeadingLines([null, undefined]), {
    title: "",
    offsiteVenueText: null,
  });
});

// ---------------------------------------------------------------------------
// resolveLindenTreeOffsiteVenue
// ---------------------------------------------------------------------------

test("Spangenberg resolves to its verified Palo Alto address", () => {
  const v = resolveLindenTreeOffsiteVenue("Gunn High School’s Spangenberg Theater");
  assert.equal(v.city, "palo-alto");
  assert.equal(v.address, "780 Arastradero Rd, Palo Alto, CA 94306");
  assert.equal(v.venue, "Spangenberg Theatre at Gunn High School");
});

test("an unverified off-site venue resolves to null so the caller can drop it", () => {
  assert.equal(resolveLindenTreeOffsiteVenue("Some Hall We Have Not Checked"), null);
  assert.equal(resolveLindenTreeOffsiteVenue(null), null);
  assert.equal(resolveLindenTreeOffsiteVenue(""), null);
});

test("the resolved venue carries no regex field into event data", () => {
  const v = resolveLindenTreeOffsiteVenue("Spangenberg");
  assert.deepEqual(Object.keys(v).sort(), ["address", "city", "venue"]);
});

// ---------------------------------------------------------------------------
// lindenTreeIsTicketed
// ---------------------------------------------------------------------------

test("'Buy Tickets Now' marks an event as ticketed", () => {
  assert.equal(
    lindenTreeIsTicketed(
      "Book Launch with Raina Telgemeier\nSunday, September 13 at 4pm\nBuy Tickets Now »",
    ),
    true,
  );
});

test("'RSVP Now' is a free event, not a ticketed one", () => {
  assert.equal(
    lindenTreeIsTicketed("Book Launch with James Ponti\nThursday, September 10 at 6pm\nRSVP Now »"),
    false,
  );
});

test("a plain heading is not ticketed, and bad input does not throw", () => {
  assert.equal(lindenTreeIsTicketed("Storytime with Alison Kim"), false);
  assert.equal(lindenTreeIsTicketed(null), false);
  assert.equal(lindenTreeIsTicketed(undefined), false);
});
