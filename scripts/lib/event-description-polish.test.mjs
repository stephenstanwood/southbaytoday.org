import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanTitle,
  cleanVenue,
  inferCategory,
  looksLikeEmbedCode,
  polishDescription,
} from "../generate-events.mjs";
import { canonicalHistorySjUrl, inferHistorySjCost } from "./history-sj.mjs";

test("preserves the official BentPeter performer spelling", () => {
  assert.equal(
    polishDescription("Free outdoor concert featuring The BentPeter Band."),
    "Free outdoor concert featuring The BentPeter Band.",
  );
});

test("classifies one-on-one technology help as education", () => {
  assert.equal(
    inferCategory(
      "Digital Skills: One-On-One Tech Help for Seniors",
      "Get help using Libby to read ebooks.",
      "",
      "Almaden Library",
    ),
    "education",
  );
});

test("strips a complete inline address from a display venue", () => {
  assert.equal(
    cleanVenue("History Park, 635 Phelan Ave, San Jose, CA 95112"),
    "History Park",
  );
});

test("History San Jose costs come only from explicit listing evidence", () => {
  assert.equal(inferHistorySjCost("Cost: Free, Register Online"), "free");
  assert.equal(inferHistorySjCost("Cost: $5 – $10"), "paid");
  assert.equal(inferHistorySjCost("Pumpkin supplies included in ticket price"), "paid");
  assert.equal(inferHistorySjCost("Stay tuned for ticket information!"), null);
  assert.equal(
    inferHistorySjCost("", "https://www.chcp.org/event-6795488"),
    "free",
  );
});

test("History San Jose generic listings resolve to first-party event pages", () => {
  assert.equal(
    canonicalHistorySjUrl("San José Roots", "https://historysanjose.org/programs-events/"),
    "https://historysanjose.org/event/san-jose-roots/",
  );
  assert.equal(
    canonicalHistorySjUrl("Children’s Halloween Haunt 2026", "https://historysanjose.org/programs-events/"),
    "https://historysanjose.org/event/childrens-halloween-haunt/",
  );
});

test("restores missing-apostrophe possessives in titles", () => {
  assert.equal(
    cleanTitle("Stanford Cardinal Womens Volleyball vs. Marquette Golden Eagles Womens Volleyball"),
    "Stanford Cardinal Women's Volleyball vs. Marquette Golden Eagles Women's Volleyball",
  );
  assert.equal(cleanTitle("Mens Basketball vs. Cal"), "Men's Basketball vs. Cal");
  assert.equal(cleanTitle("Childrens Storytime"), "Children's Storytime");
});

test("leaves apostrophe-free proper nouns and already-correct copy alone", () => {
  // "Veterans Day" takes no apostrophe by convention.
  assert.equal(cleanTitle("Veterans Day Ceremony"), "Veterans Day Ceremony");
  assert.equal(cleanTitle("Women's March"), "Women's March");
  // Intentional repetition in a stage name, not a duplicated-word typo.
  assert.equal(cleanTitle("Gimme Gimme Disco"), "Gimme Gimme Disco");
});

test("restores missing-apostrophe contractions in body copy", () => {
  assert.equal(
    polishDescription("We dont have tickets yet, but youre welcome to join."),
    "We don't have tickets yet, but you're welcome to join.",
  );
});

test("does not touch words that are valid without an apostrophe", () => {
  // "lets" (permits) and "wont" (accustomed) are real words — never rewritten.
  assert.equal(
    polishDescription("The venue lets us in early and he wont mind."),
    "The venue lets us in early and he wont mind.",
  );
});

test("restores the official RuPaul's Drag Race spelling", () => {
  // Ticketmaster ships "Ru Pauls"; the fix must survive the camel-case splitter.
  const polished = polishDescription("Jane Dont, breakout star of Ru Pauls Drag Race.");
  assert.equal(polished, "Jane Don't, breakout star of RuPaul's Drag Race.");
  // Idempotent: re-polishing generated output must not drift.
  assert.equal(polishDescription(polished), polished);
});

test("flags a ticketing widget snippet scraped in place of a description", () => {
  assert.equal(
    looksLikeEmbedCode(
      "Var example Callback = function { console. Log('Order complete!'); }; " +
        "window. EB Widgets. Create Widget({ // Required widget Type: 'checkout', " +
        "event Id: '1993870955702', iframe Container Id:…",
    ),
    true,
  );
});

test("leaves ordinary event prose alone", () => {
  assert.equal(
    looksLikeEmbedCode(
      "Taste chile, mole, and pozole dishes while celebrating regional Mexican " +
        "cuisine at the School of Arts and Culture. Tickets at the door.",
    ),
    false,
  );
  assert.equal(
    looksLikeEmbedCode(
      "A talk on how a public library actually functions as a civic institution.",
    ),
    false,
  );
});

test("drops a dangling separator left by an empty concatenated field", () => {
  assert.equal(cleanTitle("Bolly EDM Dance Night |"), "Bolly EDM Dance Night");
  assert.equal(
    cleanTitle("Into the Body: A Drum, Voice & Gong Sound Experience |"),
    "Into the Body: A Drum, Voice & Gong Sound Experience",
  );
  // Separators inside a title, and hyphenated words, stay put.
  assert.equal(
    cleanTitle("Tech Mentor / Computer & iPad Assistance"),
    "Tech Mentor / Computer & iPad Assistance",
  );
  assert.equal(cleanTitle("Movie Night: Spider-Man"), "Movie Night: Spider-Man");
  // A trailing "+" is an age/grade range, not a dangling separator.
  assert.equal(
    cleanTitle("Lego Spike Robotics & Engineering for Grades 6+"),
    "Lego Spike Robotics & Engineering for Grades 6+",
  );
});

test("promotes a billing line mis-joined as a support act", () => {
  assert.equal(
    cleanTitle("Peter Hook & The Light with Performing 'Get Ready' live and in full"),
    "Peter Hook & The Light — Performing 'Get Ready' live and in full",
  );
  // A real opener keeps "with".
  assert.equal(
    cleanTitle("Pat Benatar & Neil Giraldo with Lee DeWyze"),
    "Pat Benatar & Neil Giraldo with Lee DeWyze",
  );
});

test("strips fused ADA accommodation link labels wherever they sit", () => {
  assert.equal(
    polishDescription("Free. No registration required ADA Accommodation Requests"),
    "Free. No registration required",
  );
  assert.equal(
    polishDescription(
      "Registration is required. ADA Accommodation Requests --- ¡Comienza tu camino! Solicitudes de Acomodación ADA",
    ),
    "Registration is required. ¡Comienza tu camino!",
  );
  assert.equal(
    polishDescription("Gratis. No es necesario registrarse. Accommodation Requests"),
    "Gratis. No es necesario registrarse.",
  );
});

test("keeps email local-part dots intact through sentence splitting", () => {
  assert.equal(
    polishDescription("Email Caitlin Bosworth at caitlin.bosworth@sjlibrary.org. Priority given."),
    "Email Caitlin Bosworth at caitlin.bosworth@sjlibrary.org. Priority given.",
  );
  assert.equal(
    polishDescription("Contact jocelyn.bringas(@)sjlibrary.org for review."),
    "Contact jocelyn.bringas(@)sjlibrary.org for review.",
  );
});

test("normalizes doubled periods, fused age tags, doubled prepositions, and padded quotes", () => {
  assert.equal(
    polishDescription("Sessions at 3:30 and 5:30 p.m.. Free, with limited capacity."),
    "Sessions at 3:30 and 5:30 p.m. Free, with limited capacity.",
  );
  assert.equal(polishDescription("Please note that this is for ages12+"), "Please note that this is for ages 12+");
  assert.equal(
    polishDescription("Fill out the form 7+days prior to the event."),
    "Fill out the form 7+ days prior to the event.",
  );
  assert.equal(
    polishDescription("Members vote on on them. Located at at 50 N. Fourth St."),
    "Members vote on them. Located at 50 N. Fourth St.",
  );
  assert.equal(
    polishDescription('Te invitan a leer " Mi nombre es Emilia ", de Isabel Allende.'),
    'Te invitan a leer "Mi nombre es Emilia", de Isabel Allende.',
  );
  assert.equal(
    polishDescription('A relaxed "book club" for fans. June 25th- "The Shroud" by Banu Mushtaq.'),
    'A relaxed "book club" for fans. June 25th- "The Shroud" by Banu Mushtaq.',
  );
});

test("lowercases a URL scheme that sentence capitalization upcased", () => {
  assert.equal(
    polishDescription("No portion is tax deductible. https://www.plus1.org/"),
    "No portion is tax deductible. https://www.plus1.org/",
  );
});

test("keeps Mc-prefixed surnames closed up through the camel-case splitter", () => {
  assert.equal(
    polishDescription("Third Thursdays is hosted by local poet Mighty Mike McGee! Open mic to follow."),
    "Third Thursdays is hosted by local poet Mighty Mike McGee! Open mic to follow.",
  );
  assert.equal(
    polishDescription("Drop by the Environmental Education Center at McClellan Ranch Preserve every Saturday."),
    "Drop by the Environmental Education Center at McClellan Ranch Preserve every Saturday.",
  );
  // The guard protects only a source-closed "Mc"; genuine run-together words still split.
  assert.equal(
    polishDescription("Bestselling author Kelly McGonigal shows us how to find joy at Music in the ParkSaturday."),
    "Bestselling author Kelly McGonigal shows us how to find joy at Music in the Park Saturday.",
  );
});

test("reunites SJPL's VietSteps dance group after the splitter", () => {
  assert.equal(
    polishDescription("Mooncakes will also be served during the event. Stay for VietSteps! Happy Moon Festival!"),
    "Mooncakes will also be served during the event. Stay for VietSteps! Happy Moon Festival!",
  );
});

test("strips LibCal newsletter query debris and repairs its fused book-club copy", () => {
  const raw = "Join Librarian Rachael for a lively discussion ofanother exciting book. "
    + "Drop in to the Conference Room at 5 PM to join the discussion in person, or join in on Zoom here: "
    + "Join from PC, Mac, Linux, iOS or Android: https://losgatosca-gov.zoom.us/j/92703658806 "
    + "To sign up for the Tuesday Evening Book Club newsletter, click here: "
    + "http://libraryaware.com/36/Subscribers/Subscribe?showonlynewsletterlists=true";

  assert.equal(
    polishDescription(raw),
    "Join Librarian Rachael for a lively discussion of another exciting book.",
  );
});
