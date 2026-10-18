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
import { libraryEventDetails } from "./library-event-details.mjs";

test("keeps an inline Chinese language option through library ingestion and display cleanup", () => {
  // SJPL's October 20 Edenvale Tech Mentor occurrence, verified 2026-10-18.
  const details = libraryEventDetails({ definition: { description:
    "<p><strong>Free.</strong> Offered in-person, in<strong> English or&nbsp;中文.</strong></p><p>Would you like to find out more about computers? Learn at your own pace! 您想了解更多关于计算机的信息吗？按照自己的节奏学习！</p><p>No registration or appointment required. Just drop by and ask for assistance.</p>",
  } });
  const actual = polishDescription(details.description);
  assert.match(actual, /Offered in-person, in English or Chinese\./);
  assert.match(actual, /No registration or appointment required\./);
  assert.doesNotMatch(actual, /Mandarin|中文|您想/);
  assert.equal(polishDescription(actual), actual);
  assert.doesNotMatch(polishDescription("Offered in-person, in English or. Bring your computer."), /Chinese/);
  const url = "https://example.org/in-English-or-中文?language=中文";
  assert.equal(polishDescription(`Details: ${url}`), `Details: ${url}`);
});

test("preserves Stanford's Contemplation by Design acronym on refresh", () => {
  // Official occurrence titles: events.stanford.edu/event/cbd-2026-
  // mindfulness-embodied-self-awareness-and-disembodied-ai-with-shaun-gallagher
  // and /event/cbd-2026-interbeing-meditation-with-kaira-jewel-lingo.
  const titles = [
    "CBD 2026: Mindfulness, Embodied Self-awareness, and Disembodied AI with Shaun Gallagher, PhD, Hon DPhil",
    "CBD 2026: Interbeing Meditation: Touching Our Source and Growing Our Connection with Kaira Jewel Lingo",
  ];
  for (const title of titles) {
    assert.equal(cleanTitle(title), title);
    assert.equal(cleanTitle(cleanTitle(title)), title);
  }
  assert.equal(cleanTitle("Learn about cbd and mindfulness"), "Learn about cbd and mindfulness");
});

test("repairs verified orchestra and cafe names without changing other names", () => {
  const title = "A Night with Beethoven, Mozart & Dvořák in Palo Alto Philarmonic";
  assert.match(cleanTitle(title), /Palo Alto Philharmonic$/);
  assert.equal(cleanTitle("Palo Alto Philharmonic"), "Palo Alto Philharmonic");
  assert.equal(cleanVenue("Chromatic Cafeun"), "Chromatic Coffee");
  assert.equal(cleanVenue("Chromatic Coffee"), "Chromatic Coffee");
  assert.equal(cleanVenue("Another Chromatic Cafeun Studio"), "Another Chromatic Cafeun Studio");
});

test("preserves the official BentPeter performer spelling", () => {
  assert.equal(
    polishDescription("Free outdoor concert featuring The BentPeter Band."),
    "Free outdoor concert featuring The BentPeter Band.",
  );
});

test("preserves Palo Alto library's NeuroSphere group name through prose cleanup", () => {
  // First-party occurrence: paloalto.bibliocommons.com/events/6a384108c134422d50e9a7b1
  const source = "Come join teen-led group NeuroSphere! NeuroSphere is a community for curious 2nd-7th graders about medicine!";
  assert.equal(polishDescription(source), source);
  assert.equal(polishDescription(polishDescription(source)), source);
  const url = "https://example.org/NeuroSphere?group=NeuroSphere";
  assert.equal(polishDescription(`Meet NeuroSphere. Details: ${url}`), `Meet NeuroSphere. Details: ${url}`);
});

test("preserves verified community and maker names through prose cleanup", () => {
  const cases = [
    ["FabMo", "Fab Mo"],
    ["Billy DeFrank LGBTQ+ Community Center", "Billy De Frank LGBTQ+ Community Center"],
    ["ChompSaw", "Chomp Saw"],
    ["ArtSEE Expression", "Art See Expression"],
    ["CalMatters", "Cal Matters"],
  ];
  for (const [canonical, split] of cases) {
    const expected = `Learn more about ${canonical}.`;
    assert.equal(polishDescription(expected), expected, canonical);
    assert.equal(polishDescription(`Learn more about ${split}.`), expected, split);
    assert.equal(polishDescription(polishDescription(expected)), expected, `${canonical} idempotence`);
    const url = `https://example.org/${canonical.replaceAll(" ", "")}?name=${split.replaceAll(" ", "%20")}`;
    assert.equal(polishDescription(`Details: ${url}`), `Details: ${url}`, `${canonical} URL`);
  }
  assert.equal(polishDescription("Art See is an unrelated name. Meet Billy De Marco."),
    "Art See is an unrelated name. Meet Billy De Marco.");
});

test("preserves verified OneInMath, NieR, MathWorks, and TeenHQ names on refresh", () => {
  const cases = [
    ["OneInMath", ["One In Math", "One in Math", "OneinMath", "Onein Math"]],
    ["NieR", ["Nie R"]],
    ["YoRHa", ["Yo RHa"]],
    ["MathWorks", ["Math Works", "Mathworks"]],
    ["TeenHQ", ["Teen HQ", "Teen Hq"]],
    ["BISH Bash", ["Bish Bash"]],
  ];
  for (const [canonical, variants] of cases) {
    const expected = `Learn more about ${canonical}.`;
    for (const name of [canonical, ...variants]) {
      assert.equal(polishDescription(`Learn more about ${name}.`), expected, name);
      assert.equal(cleanTitle(`Meet ${name}`), `Meet ${canonical}`, `${name} title`);
    }
    assert.equal(polishDescription(expected), expected);
    assert.equal(polishDescription(polishDescription(expected)), expected, `${canonical} idempotence`);
    assert.equal(cleanTitle(cleanTitle(`Meet ${canonical}`)), `Meet ${canonical}`);
    const url = `https://example.org/${canonical.replaceAll(" ", "")}?name=${variants[0].replaceAll(" ", "%20")}`;
    assert.equal(polishDescription(`Details: ${url}`), `Details: ${url}`, `${canonical} URL`);
  }
  assert.equal(polishDescription("One in math class. Math works for us. Bish reads a book."),
    "One in math class. Math works for us. Bish reads a book.");
});

test("keeps Cherie Dimaline's VenCo title intact through prose cleanup", () => {
  // Publisher: penguinrandomhouse.ca/books/600424/venco-by-cherie-dimaline/9780735277236
  const expected = "Discuss VenCo, a novel by Cherie Dimaline.";
  for (const title of ["VenCo", "Ven Co", "Venco"]) {
    assert.equal(polishDescription(`Discuss ${title}, a novel by Cherie Dimaline.`), expected);
  }
  assert.equal(polishDescription(polishDescription(expected)), expected);
  const url = "https://example.org/VenCo?title=VenCo";
  assert.equal(polishDescription(`Discuss VenCo. Details: ${url}`), `Discuss VenCo. Details: ${url}`);
});

test("corrects the sourced award names in Funeral Songs for Dying Girls copy", () => {
  // CSFFA's 2024 results and AILA's 2024 Honor Books both list the novel.
  const expected = "Other titles include Funeral Songs for Dying Girls (AILA Honor Book, Aurora Award winner).";
  assert.equal(
    polishDescription("Other titles include Funeral Songs for Dying Girls (Aila Honor Book, Aura Award winner)."),
    expected,
  );
  assert.equal(polishDescription(expected), expected);
  assert.equal(polishDescription("A different Aura Award ceremony."), "A different Aura Award ceremony.");
});

test("preserves SideXSide Studios and its TransMilitary film title", () => {
  // Studio credits: sidexsidestudios.com/project/transmilitary/
  const expected = "SideXSide Studios made TransMilitary. TransMilitary won the SXSW Audience Award.";
  assert.equal(polishDescription(expected), expected);
  assert.equal(
    polishDescription("Side XSide Studios made Transmilitary. Trans Military won the SXSW Audience Award."),
    expected,
  );
  assert.equal(polishDescription(polishDescription(expected)), expected);
  assert.equal(polishDescription("A discussion of trans military service."), "A discussion of trans military service.");
});

test("keeps Pyet DeSpain and Gordon Ramsay correct through title and prose polishing", () => {
  assert.equal(cleanTitle("Online Author Talk: Pyet Despain"), "Online Author Talk: Pyet DeSpain");
  const expected = "Pyet DeSpain won Gordon Ramsay's Next Level Chef.";
  for (const name of ["Pyet DeSpain", "Pyet De Spain", "Pyet Despain"]) {
    assert.equal(polishDescription(`${name} won Gordon Ramsey's Next Level Chef.`), expected);
  }
  assert.equal(polishDescription(expected), expected);
  const url = "https://example.org/PyetDeSpain/GordonRamsey?name=PyetDespain";
  assert.equal(polishDescription(`Meet Pyet DeSpain. Details: ${url}`), `Meet Pyet DeSpain. Details: ${url}`);
  assert.equal(polishDescription("Jane De Spain reads Ramsey Campbell."), "Jane De Spain reads Ramsey Campbell.");
});

test("restores Montalvo's Mariachi Viajero ensemble spelling", () => {
  assert.equal(polishDescription("Mariachi Viejero"), "Mariachi Viajero");
});

test("corrects the Tokyo concert hall without changing another Santori name", () => {
  assert.equal(
    polishDescription("She has performed at Santori Hall in Tokyo and with the Santori Quartet."),
    "She has performed at Suntory Hall in Tokyo and with the Santori Quartet.",
  );
});

test("repairs recurring performance-copy typos and compounds", () => {
  assert.equal(
    polishDescription(
      "An evening of Choral Music featuring pefromances from two acapella groups!",
    ),
    "An evening of choral music featuring performances from two a cappella groups!",
  );
  assert.equal(
    polishDescription("A coming of age story behind the fairytale."),
    "A coming-of-age story behind the fairy tale.",
  );
  assert.equal(
    polishDescription("Stanley Clarke performs with the PUBLIQuartet."),
    "Stanley Clarke performs with the PUBLIQuartet.",
  );
});

test("repairs recurring library-description grammar", () => {
  assert.equal(
    polishDescription(
      "At the Almaden Branch you can make a 30-minute appointment to assist you with: e Books. BY Appointment Only One appointment per week.",
    ),
    "At the Almaden Branch, you can make a 30-minute appointment for assistance with: e-books. By appointment only. One appointment per week.",
  );
  assert.equal(
    polishDescription("Preschool age children can join. Sign-up today for our e Newsletter."),
    "Preschool-age children can join. Sign up today for our e-newsletter.",
  );
});

test("removes orphaned bilingual scrape debris while preserving English copy", () => {
  assert.equal(
    polishDescription(
      'This is an open rehearsal featuring the Chinese erhu. Ask questions during the Q&A. 「 」 ， 。 Harmony Orchestra 。12/15, (Overdrive). Overdirve:,, Hoopla:',
    ),
    "This is an open rehearsal featuring the Chinese erhu. Ask questions during the Q&A.",
  );
  assert.equal(
    polishDescription("30 。:,, (Overdrive). Overdirve:,,. Hoopla: (ADA) 6/24/2027"),
    "",
  );
  assert.equal(
    polishDescription(
      "Free. Offered in-person, in English or. Would you like help with computers? Learn at your own pace! ？ ！ No registration required.",
    ),
    "Free. Would you like help with computers? Learn at your own pace! No registration required.",
  );
});

test("normalizes internal underscore separators in titles", () => {
  assert.equal(
    cleanTitle("2nd_Mandarin Stories and Songs"),
    "2nd Mandarin Stories and Songs",
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

test("preserves case-sensitive signup URLs through prose cleanup", () => {
  // SCCLD's Teen Coffeehouse page supplies this exact shortlink. The camel-case
  // splitter used to insert a space into its path: tinyurl.com/TA Bcoffeehouse.
  const copy = "Teen performers: sign up at tinyurl.com/TABcoffeehouse to perform.";
  assert.equal(polishDescription(copy), copy);
  assert.equal(polishDescription(polishDescription(copy)), copy);

  const links = "Join at https://example.org/JoinNow?group=TABcoffeehouse&key=ABCdef#NextStep. Bring a friend!";
  assert.equal(polishDescription(links), links);
  assert.equal(polishDescription(polishDescription(links)), links);
  assert.equal(
    polishDescription("Try www.example.org/ArtClub and example.org/ABCdef.pdf. MeetTheArtist afterward."),
    "Try www.example.org/ArtClub and example.org/ABCdef.pdf. Meet The Artist afterward.",
  );
  assert.equal(
    polishDescription("Join at tinyurl.com/TABcoffeehouse. Register online at https://example.org/JoinNow. Bring water."),
    "Join at tinyurl.com/TABcoffeehouse. Bring water.",
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

test("cleans recurring scrape-tail punctuation and spacing artifacts", () => {
  assert.equal(
    polishDescription("Jungle themed social event at Sigma Nu Event Details:"),
    "Jungle themed social event at Sigma Nu.",
  );
  assert.equal(
    polishDescription("Tickets are $10 Resident | $13 Non-resident Register"),
    "Tickets are $10 Resident | $13 Non-resident",
  );
  assert.equal(
    polishDescription("Art,crafts at 4:30PM. Visit sccld. org/accessibility."),
    "Art, crafts at 4:30 PM. Visit sccld.org/accessibility.",
  );
  assert.equal(
    polishDescription("This is Blueys show with Face Time and Early Veune Entry."),
    "This is Bluey's show with FaceTime and Early Venue Entry.",
  );
  assert.equal(
    polishDescription("Child must be be present; email c aitlin.bosworth@sjlibrary.org after signing-up."),
    "Child must be present; email caitlin.bosworth@sjlibrary.org after signing up.",
  );
});

test("drops bracketed truncation and flattened San Jose Theaters navigation", () => {
  assert.equal(
    polishDescription("A complete sentence. This fragment stops in a […]"),
    "A complete sentence.",
  );
  assert.equal(
    polishDescription("Tickets are on sale. > San Jose Civic Events Calendar > Visitor FAQs"),
    "Tickets are on sale.",
  );
});

test("drops a truncated San Jose Theaters navigation tail", () => {
  assert.equal(
    polishDescription('Tickets are on sale Friday at 10 AM. > San Jose…'),
    "Tickets are on sale Friday at 10 AM.",
  );
});

test("normalizes recurring age and first-come copy", () => {
  assert.equal(
    polishDescription("For Ages 3-5. Seats are first come first served."),
    "For ages 3-5. Seats are first-come, first-served.",
  );
  assert.equal(
    polishDescription("For babies (02) and your babys earliest learning."),
    "For babies (0–2) and your baby's earliest learning.",
  );
});

test("preserves JavaScript and W.A.S.P. capitalization through word splitting", () => {
  assert.equal(
    polishDescription("Learn Java Script. W. A. S. P. Is performing."),
    "Learn JavaScript. W.A.S.P. is performing.",
  );
});

test("drops dangling-reference CTA sentences the reader cannot follow", () => {
  // Palo Alto / SCCLD library bodies keep the words of a link that stayed
  // behind on the source page. Each of these is the whole sentence.
  assert.equal(
    polishDescription(
      "The Monday Morning book club meets in the Library Conference Room. Sign up for our newsletter.",
    ),
    "The Monday Morning book club meets in the Library Conference Room.",
  );
  assert.equal(
    polishDescription(
      "Come ready to talk about what you made. Don't forget to sign up for our Cookbook Club newsletter to get the latest updates! You can sign up for any of our newsletters here.",
    ),
    "Come ready to talk about what you made.",
  );
  assert.equal(
    polishDescription(
      "Registration is required to use this service. Please read this document to learn more about the scanning service. Register below for a 90-minute session.",
    ),
    "Registration is required to use this service.",
  );
  assert.equal(
    polishDescription(
      "Registration is required. Sign up below to receive the Zoom information on the morning of the event. Presented by the Asian Art Museum.",
    ),
    "Registration is required. Presented by the Asian Art Museum.",
  );
  assert.equal(
    polishDescription(
      "Each machine has limitations. Please see below for more information. Pre-registration is recommended.",
    ),
    "Each machine has limitations. Pre-registration is recommended.",
  );
  assert.equal(
    polishDescription(
      "Join local yoga teacher Patricia Becker in the Embarcadero Room. Read more about Patricia and her classes on her website. Registration is not required.",
    ),
    "Join local yoga teacher Patricia Becker in the Embarcadero Room. Registration is not required.",
  );
});

test("keeps real copy a newsletter CTA is mashed onto", () => {
  // BiblioCommons concatenates the CTA onto the previous sentence with no
  // terminator; the reading list must survive the drop.
  assert.equal(
    polishDescription(
      "Our reading list follows: The Frozen River by Ariel Lawhon - September What We Can Know by Ian McEwan - November Sign up for the library newsletter and never miss another program! You don't have to register.",
    ),
    "Our reading list follows: The Frozen River by Ariel Lawhon - September What We Can Know by Ian McEwan - November. You don't have to register.",
  );
  // A lowercase mid-sentence mention is prose, not a mashed CTA.
  assert.equal(
    polishDescription(
      "Attendees who sign up for our newsletter receive the reading list early.",
    ),
    "Attendees who sign up for our newsletter receive the reading list early.",
  );
});

test("keeps dotted initialisms intact and collapses comma runs", () => {
  assert.equal(
    polishDescription("Their 2026 U.S. and Canada Tour hits San Jose. She holds a B.F.A. and M.A. in theater."),
    "Their 2026 U.S. and Canada Tour hits San Jose. She holds a B.F.A. and M.A. in theater.",
  );
  assert.equal(
    polishDescription("Stories in English and Mandarin Chinese.,,, For accommodations, ask staff."),
    "Stories in English and Mandarin Chinese. For accommodations, ask staff.",
  );
});
