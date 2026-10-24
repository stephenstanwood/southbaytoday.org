import test from "node:test";
import assert from "node:assert/strict";

import { cleanTitle, polishDescription } from "../generate-events.mjs";
import { cleanDescription as cleanPermitDescription } from "../generate-permits.mjs";

test("preserves source-published SMASH, MSET and SJYS initials in titles and prose", () => {
  for (const title of ["SMASH Maker Fair", "MSET Cuttlefish Robotics Team", "SJYS presents Philharmonic Orchestra's 26-27 Season Opener"]) {
    assert.equal(cleanTitle(title), title);
    assert.equal(cleanTitle(cleanTitle(title)), title);
  }
  assert.equal(polishDescription("Hosted by the MSET Cuttlefish Robotics Team."), "Hosted by the MSET Cuttlefish Robotics Team.");
  assert.equal(polishDescription("Hear the SJYS Philharmonic Orchestra."), "Hear the SJYS Philharmonic Orchestra.");
  assert.equal(cleanTitle("Smash some pumpkins"), "Smash some pumpkins");
});

test("preserves Stanford's source-supplied SLE program initials", () => {
  const title = "SLE Salon: Haleh Gafori";
  assert.equal(cleanTitle(title), title);
  assert.equal(cleanTitle(cleanTitle(title)), title);
  assert.equal(polishDescription("Meet in the SLE Main Lounge."), "Meet in the SLE Main Lounge.");
  assert.equal(cleanTitle("ANNUAL Salon"), "Annual Salon");
});

// ---------------------------------------------------------------------------
// Local agency acronyms in event titles
// ---------------------------------------------------------------------------
// cleanTitle downcases ALL-CAPS runs so shouted source titles don't scream on a
// card. Anything not in its KEEP_UPPER allowlist gets title-cased, which is
// wrong for the initialisms South Bay agencies actually publish under. The Town
// of Los Gatos newsletter ships "LGMSPD Community Police Academy" (Los
// Gatos-Monte Sereno Police Department) and it published as "Lgmspd Community
// Police Academy" until LGMSPD was added to the list.

test("keeps South Bay public-safety agency acronyms uppercase in titles", () => {
  assert.equal(
    cleanTitle("LGMSPD Community Police Academy"),
    "LGMSPD Community Police Academy",
  );
  // The rest of the local public-safety family, so a KEEP_UPPER edit that drops
  // one of them fails here rather than on a live card.
  assert.equal(cleanTitle("SJPD Open House"), "SJPD Open House");
  assert.equal(cleanTitle("SJFD Station Tour"), "SJFD Station Tour");
  assert.equal(cleanTitle("SCCFD Pancake Breakfast"), "SCCFD Pancake Breakfast");
  assert.equal(cleanTitle("LGPNS Big Truck Day"), "LGPNS Big Truck Day");
});

test("still downcases shouted words that are not known acronyms", () => {
  // The guard on the rule above: preserving LGMSPD must not amount to keeping
  // every all-caps run, which is the whole point of the downcasing pass.
  assert.equal(
    cleanTitle("AWESOME Community Police Academy"),
    "Awesome Community Police Academy",
  );
  assert.equal(cleanTitle("ANNUAL Pancake Breakfast"), "Annual Pancake Breakfast");
});

test("refresh preserves organizer, safety-program and mapping/tool initials", () => {
  for (const title of [
    "Community Emergency Response Team (CERT) Academy",
    "CLA Presents Barbara Kingsolver Receiving the Steinbeck Award",
    "LWV- 14 State Propositions",
    "From Silent Data Failures to Enforceable CI/CD Gates",
    "ROS By-The-Bay October Meetup at Intrinsic: Swift for ROS + ROSCon Global Recap",
    "WGSS Lecture: Drag Story Time as a Site of Resistance",
    "Get Started with Mapping: StoryMap JS, ArcGIS, Leaflet",
    "Adventure Skeletons TTRPG",
  ]) {
    assert.equal(cleanTitle(title), title);
    assert.equal(cleanTitle(cleanTitle(title)), title);
  }
  assert.equal(polishDescription("Meetup event by SF Bay ACM Chapter."), "Meetup event by SF Bay ACM Chapter.");
  assert.equal(polishDescription("The WGSS Lecture Series hosts a talk."), "The WGSS Lecture Series hosts a talk.");
  assert.equal(polishDescription("Play TTRPG games at the library."), "Play TTRPG games at the library.");
  assert.equal(cleanTitle("Ros reads with her family"), "Ros reads with her family");
  assert.equal(cleanTitle("A CERTAIN Halloween Story"), "A Certain Halloween Story");
});

test("keeps agency acronyms uppercase in body copy too", () => {
  assert.match(
    polishDescription("The LGMSPD hosts an eight-week academy each fall."),
    /\bLGMSPD\b/,
  );
});

test("refresh preserves university seminar, donor and opponent initials", () => {
  for (const title of [
    "ESE Seminar - Inês Azevedo",
    "ISA Research Seminar: Vahid Akbari (University of Nottingham)",
    // Stanford's /event/reds-seminar-europe-in-the-face-of-war source title.
    "REDS Seminar- Milada Vachudova: Europe in the Face of War",
    "REDS Seminar - Milada Vachudova: Europe in the Face of War",
    "ST Lee Lecture featuring Former Congressman and Ambassador to Turkey Jeff Flake",
    "Santa Clara University Men's Water Polo vs LIU",
    "Women's Volleyball - San Jose State vs. UTEP",
    "An Intimate Evening with Dr. Samuel Waymon at DAAAS",
    "Designing for Safety with Caitlin Burke, PhD, JD",
  ]) {
    assert.equal(cleanTitle(title), title);
    assert.equal(cleanTitle(cleanTitle(title)), title);
    assert.equal(polishDescription(`Hear the ${title} presentation.`), `Hear the ${title} presentation.`);
  }
  assert.equal(cleanTitle("Isa and Liu read together"), "Isa and Liu read together");
  assert.equal(cleanTitle("Reds fans meet at the library"), "Reds fans meet at the library");
  assert.equal(polishDescription("Meet Isa and Liu at Main St."), "Meet Isa and Liu at Main St.");
});

test("preserves SJPL partner AACI YTI in titles and workshop descriptions", () => {
  // SJPL's October 20, 2026 listing: /events/6ac530c9377296003a4a18fa.
  const title = "Halloween Crafts with AACI YTI";
  assert.equal(cleanTitle(title), title);
  assert.equal(cleanTitle(cleanTitle(title)), title);
  assert.equal(
    polishDescription("Join AACI YTI for a Halloween themed crafts workshop."),
    "Join AACI YTI for a Halloween themed crafts workshop.",
  );
  assert.equal(polishDescription("Join YTI Volunteers for crafts."), "Join YTI Volunteers for crafts.");
});

test("newsletter and ticket titles retain published organization and artist initials", () => {
  for (const title of [
    "SUSD Board Candidate Forum", "CSA Homecoming", "CEFCU Halloween Movie Night",
    "Santa Clara Broncos Women's Volleyball vs. USF Dons Women's Volleyball", "Chad & JT",
  ]) assert.equal(cleanTitle(title), title);
  assert.match(polishDescription("Hear candidates for the three SUSD Board seats."), /\bSUSD\b/);
  assert.match(polishDescription("Movie Night is presented by CEFCU."), /\bCEFCU\b/);
  assert.match(polishDescription("The CSA Homecoming celebration."), /\bCSA\b/);
});

test("permit descriptions strip feed flags and keep permit acronyms", () => {
  assert.equal(cleanPermitDescription("Axis (BEM100%) Ste 500 TI", "Tenant Improvement", "Office"), "Axis Ste 500 TI");
  assert.equal(cleanPermitDescription("(BEMP 100%) Block A Family Affordable Apts", "New Construction", "Apartments"), "Block A Family Affordable Apts");
  assert.equal(cleanPermitDescription("(BEPM100%) Example", "New Construction", "Apartments"), "Example");
  assert.equal(cleanPermitDescription("(BEM100%) Teresa Attorney Office FI", "Finish Interior", "Office"), "Teresa Attorney Office");
  assert.equal(cleanPermitDescription("JADU", "New Construction", "ADU"), "JADU");
});

// ---------------------------------------------------------------------------
// Institution and clinical acronyms (added 2026-09-06)
// ---------------------------------------------------------------------------
// All five shipped downcased in upcoming-events.json, where a title-cased
// initialism reads as a misspelled proper noun: JMZ is Palo Alto's Junior
// Museum & Zoo, UNAFF the United Nations Association Film Festival whose
// screenings Rinconada Library hosts, and MRI/PD/MD come off Stanford
// Medicine's Localist feed.

test("keeps institution acronyms uppercase in titles", () => {
  assert.equal(
    cleanTitle("Family Storytime: Meet a JMZ Animal Ambassador!"),
    "Family Storytime: Meet a JMZ Animal Ambassador!",
  );
  assert.equal(
    cleanTitle("Documentary: UNAFF presents Lessons in Fear"),
    "Documentary: UNAFF presents Lessons in Fear",
  );
  assert.equal(cleanTitle("Queer American Memorials at the ICA"), "Queer American Memorials at the ICA");
  assert.equal(cleanTitle("Feedback Loop: SCC Artist Census Mini-Fest"), "Feedback Loop: SCC Artist Census Mini-Fest");
  assert.equal(cleanTitle("BAGI Night Live!"), "BAGI Night Live!");
  assert.equal(cleanTitle("CHCP Double Happiness Celebration"), "CHCP Double Happiness Celebration");
});

test("keeps clinical and post-nominal acronyms uppercase in titles", () => {
  assert.equal(
    cleanTitle("MRI: Clinical Updates and Practical Physics"),
    "MRI: Clinical Updates and Practical Physics",
  );
  assert.equal(
    cleanTitle("PD Bootcamp | How to Give a Great Presentation"),
    "PD Bootcamp | How to Give a Great Presentation",
  );
  assert.equal(
    cleanTitle("Fireside Chat with Tara Narula Cangello, MD"),
    "Fireside Chat with Tara Narula Cangello, MD",
  );
  assert.equal(cleanTitle("Adult ACL Update"), "Adult ACL Update");
  assert.equal(cleanTitle("Bird ID and Guided Hike"), "Bird ID and Guided Hike");
});

test("preserves Stanford's MASLD initials through title and description cleanup", () => {
  // Stanford's October 23, 2026 clinical seminar uses the disease initialism.
  const title = "The Skinny on MASLD: From Nomenclature to Novel Therapies";
  const description = "A practical framework for metabolic dysfunction-associated steatotic liver disease (MASLD).";
  assert.equal(cleanTitle(title), title);
  assert.equal(cleanTitle(cleanTitle(title)), title);
  assert.equal(polishDescription(description), description);
  assert.equal(polishDescription(polishDescription(description)), description);
  assert.equal(cleanTitle("ANNUAL Clinical Seminar"), "Annual Clinical Seminar");
});

test("preserves WABE's source-published station initials in event copy", () => {
  // Mountain View's Peter Fletcher biography supplies the station's uppercase
  // name, also confirmed by https://www.wabe.org/about/.
  const description = "His radio appearances have included National Public Radio (NPR) and WABE in Atlanta.";
  assert.equal(polishDescription(description), description);
  assert.equal(polishDescription(polishDescription(description)), description);
  assert.equal(cleanTitle("WABE presents Peter Fletcher"), "WABE presents Peter Fletcher");
  assert.equal(polishDescription("The Wabe is a word from a poem."), "The Wabe is a word from a poem.");
});

test("preserves source-published AWS initials in event titles and blurbs", () => {
  const title = "AI Night with AWS, Anthropic, Temporal";
  const copy = "Join an AI night with AWS, Anthropic, and Temporal.";
  assert.equal(cleanTitle(title), title);
  assert.equal(polishDescription(copy), copy);
  assert.equal(polishDescription(polishDescription(copy)), copy);
  assert.equal(polishDescription("Aws is a source-spelled name."), "Aws is a source-spelled name.");
});

test("keeps league and artist initialisms uppercase in titles and body copy", () => {
  assert.equal(cleanTitle("Sharks x PWHL San Jose"), "Sharks x PWHL San Jose");
  assert.equal(cleanTitle("A Tribute to ABBA"), "A Tribute to ABBA");
  assert.match(polishDescription("Hear ABBA songs performed live."), /\bABBA\b/);
});

test("keeps UNAFF uppercase in description body copy", () => {
  assert.match(
    polishDescription("Introduced by UNAFF founder Jasmina Bojic at the library."),
    /\bUNAFF\b/,
  );
});

// ---------------------------------------------------------------------------
// cleanTitle is order-sensitive, so the pipeline runs it again after the
// venue-suffix strip (generate-events.mjs). Its end-anchored rules only see
// what is last in the string, so a CMS bookkeeping marker parked behind the
// venue tail survived the first pass: "Levitt San Jose concert series (Copy)
// at <Venue>" cleaned to "… concert series (Copy)" and shipped that way for
// three days. Guard the idempotence the second pass depends on.
// ---------------------------------------------------------------------------

test("cleanTitle is idempotent, so a second pass is safe and strips exposed markers", () => {
  assert.equal(
    cleanTitle("Levitt San Jose concert series (Copy)"),
    "Levitt San Jose concert series",
  );
  for (const title of [
    "Levitt San Jose concert series",
    "MRI: Clinical Updates and Practical Physics",
    "LGMSPD Community Police Academy",
    "Documentary: UNAFF presents Lessons in Fear",
  ]) {
    assert.equal(cleanTitle(cleanTitle(title)), cleanTitle(title), title);
  }
});

// ---------------------------------------------------------------------------
// College-program abbreviations in schedule listings (added 2026-09-09)
// ---------------------------------------------------------------------------
// The City Newsletter ships Stanford's football slate as mostly-lowercase
// titles ("Stanford football vs. NC State"), which puts cleanTitle on its 2+
// branch and downcased the opponent to "Nc State" — a misspelled school name
// on a live card. SMU/TCU/BYU/LSU/UNC/UCF/VCU arrive through the same feeds
// with the same shape.
// ---------------------------------------------------------------------------

test("keeps college-program abbreviations uppercase in schedule titles", () => {
  assert.equal(
    cleanTitle("Stanford football vs. NC State"),
    "Stanford football vs. NC State",
  );
  assert.equal(cleanTitle("Stanford football vs. SMU"), "Stanford football vs. SMU");
  assert.equal(cleanTitle("Santa Clara men's soccer vs. BYU"), "Santa Clara men's soccer vs. BYU");
  assert.equal(cleanTitle("Stanford women's volleyball vs. UNC"), "Stanford women's volleyball vs. UNC");
  // The guard: adding these must not keep every two-letter shouted run.
  assert.equal(cleanTitle("Stanford football vs. OH State"), "Stanford football vs. Oh State");
});
