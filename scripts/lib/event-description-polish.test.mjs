import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  cleanTitle,
  cleanVenue,
  inferCategory,
  looksLikeEmbedCode,
  polishAttendanceNote,
  polishDescription,
} from "../generate-events.mjs";
import { canonicalHistorySjUrl, inferHistorySjCost } from "./history-sj.mjs";
import { libraryEventDetails } from "./library-event-details.mjs";

test("corrects Books Inc's Ilze Duarte typo in raw titles and cached copy", () => {
  // The organizer's event heading says IIZE, but its guest bio and the
  // translator's own website identify her as Ilze Duarte.
  const title = "Best Literary Translations: Wendy Call, Dmitri Manin, Ilze Duarte";
  assert.equal(cleanTitle(title.toUpperCase().replace("ILZE", "IIZE")), title);
  assert.equal(cleanTitle(title.replace("Ilze", "Iize")), title);
  const body = "Hear Wendy Call, Dmitri Manin, and Ilze Duarte discuss literary translations.";
  assert.equal(polishDescription(body.replace("Ilze", "Iize")), body);
  assert.equal(polishDescription(body), body);
});

test("Hammer Images copy is repaired on the first raw-source pass", () => {
  const expected = "SJSU Dance presents Images, the annual fall showcase of student choreography and performance.";
  // The first two source sentences precede a clipped preview in Hammer's
  // EventIntroText. Testing only the published Images/And form hid the miss.
  for (const source of [
    "SJSU Dance presents IMAGES the annual Fall showcase of student choreography. and performance.",
    "SJSU Dance presents IMAGES the annual Fall showcase of student choreography. and performance. Featuring new and original works created and performed by SJSU Dance Majors and Minors as well as…",
    "SJSU Dance presents Images the annual Fall showcase of student choreography. And performance.",
    expected,
  ]) {
    assert.equal(polishDescription(source), expected);
    assert.equal(polishDescription(polishDescription(source)), expected);
  }
});

test("attendance copy fixes typos without removing capacity or appointment instructions", () => {
  const cases = [
    [
      "No appointment is needed, we help patrons on a first come first served basis. A clipboard for singing-up is at the 2nd floor reference desk starting at 2:30PM.",
      "No appointment is needed; we help patrons on a first-come, first-served basis. A clipboard for signing up is at the 2nd-floor reference desk starting at 2:30 PM.",
    ],
    [
      "Free, with limited capacity. *Child must be be present to receive a ticket.* Tickets available 30-minutes before program starts. Free, 50 person maximum.",
      "Free, with limited capacity. Child must be present to receive a ticket. Tickets available 30 minutes before the program starts. Free, 50-person maximum.",
    ],
    [
      "Sign ups are first come, first serve and every act will be limited to 6 minutes. REGISTRATION IS REQUIRED.",
      "Sign-ups are first-come, first-served; every act will be limited to 6 minutes. Registration is required.",
    ],
    [
      "De martes a sábado. Por cita únicamente. Por favor contactar a Marlene Sanchez por correo, marlene.sanchez@sjlibrary.org o telefono, 408.808.3033 para agendar su cita.",
      "De martes a sábado. Por cita únicamente. Por favor contactar a Marlene Sanchez por correo, marlene.sanchez@sjlibrary.org o teléfono, 408.808.3033 para agendar su cita.",
    ],
  ];
  for (const [source, expected] of cases) {
    assert.equal(polishAttendanceNote(source), expected);
    assert.equal(polishAttendanceNote(expected), expected);
  }
});

test("attendance cleanup retains registration state, eligibility, contacts and exact URLs", () => {
  for (const source of [
    "Register in advance for faster check-in. No registration required. Walk-ins subject to availability.",
    "Registration is now closed. This class session is for beginner and intermediate ESL students (must have basic conversational skills). Check back in January.",
    "We're sorry, this event is full. Contact Charlie Roos: charlie.roos@lib.sccgov.org",
    "For ages 9-12. Register here: https://example.org/4pm/first-come-first-serve?code=singing-up&name=MacArthur. Email singing-up@example.org or call 408.808.3033.",
    "Details: www.example.org/4pm and example.org/4pm. Magik*Magik performs at 4 PM.",
  ]) {
    assert.equal(polishAttendanceNote(source), source);
  }
});

test("description cleanup preserves the source's MacArthur foundation name on repeat passes", () => {
  const source = "Funding was provided by the I. Roderick MacArthur Foundation. Bring a friend.";
  assert.equal(polishDescription(source), source);
  assert.equal(polishDescription(polishDescription(source)), source);
});

test("library copy stays consistent across body and attendance without changing access details", () => {
  const source = "Join us for Sign and Sing for Babies in our first floor program room! This program is for infants and prewalking babies only, ages 0-12 months. Adult Caregivers will learn basic American Sign Language signs to communicate with their babies.";
  const expected = "Join us for Sign and Sing for Babies in our first-floor program room! This program is for infants and prewalking babies only, ages 0-12 months. Adult caregivers will learn basic American Sign Language signs to communicate with their babies.";
  for (const normalize of [polishDescription, polishAttendanceNote]) {
    assert.equal(normalize(source), expected);
    assert.equal(normalize(expected), expected);
  }

  const requirements = "School age children. Space is limited. Registration opens September and closes the day before the first session. Advanced registration required, drop-ins not available. Call 408.808.3033 or email staff@example.org. Details: https://example.org/SchoolAge?room=101&time=4pm.";
  const corrected = "School-age children. Space is limited. Registration opens in September and closes the day before the first session. Advance registration required; drop-ins not available. Call 408.808.3033 or email staff@example.org. Details: https://example.org/SchoolAge?room=101&time=4pm.";
  assert.equal(polishAttendanceNote(requirements), corrected);
  assert.equal(polishAttendanceNote(corrected), corrected);
});

test("library grammar fixes preserve literal names and the floor when it is not a modifier", () => {
  const source = "We meet on the first floor. Adult Caregivers Forum presents School Age Children. Bring a friend.";
  for (const normalize of [polishDescription, polishAttendanceNote]) {
    assert.equal(normalize(source), source);
  }
  const sourceCopy = "We meet at the first floor program room. School age children can play with age appropriate toys. Winners get a prize and since it is Halloween we will also be holding a costume contest.";
  const expected = "We meet in the first-floor program room. School-age children can play with age-appropriate toys. Winners get a prize, and since it is Halloween, we will also be holding a costume contest.";
  for (const normalize of [polishDescription, polishAttendanceNote]) {
    assert.equal(normalize(sourceCopy), expected);
    assert.equal(normalize(expected), expected);
  }
});

test("garden lessons and band presentations outrank incidental arts words", () => {
  assert.equal(inferCategory("Growing Great Garlic and Shallots",
    "Learn soil preparation and the patient art of harvesting and curing.", "", "Rose Garden Library"), "education");
  assert.equal(inferCategory("San Jose Metropolitan Band presents 'Tis the Season", "", "", "Hammer Theatre Center"), "music");
  assert.equal(inferCategory("Painting Garlic and Shallots", "Explore the art of growing garlic.", "", "Art Gallery"), "arts");
  assert.equal(inferCategory("Growing Herbs in Watercolor", "An art class.", "", "Art Gallery"), "arts");
  assert.equal(inferCategory("Ensemble Portrait Drawing", "An art class.", "", "Art Gallery"), "arts");
});

// Reviewed public listings captured on October 20, 2026. Exercise the exported
// normalizers directly so the next refresh cannot undo the source spellings.
const reviewedCopy = JSON.parse(readFileSync(
  new URL("./fixtures/reviewed-event-normalization.json", import.meta.url), "utf8",
));
for (const { id, field, text } of reviewedCopy) {
  test(`reviewed ${field} survives repeated normalization: ${id}`, () => {
    const normalize = field === "title" ? cleanTitle : polishDescription;
    assert.equal(normalize(text), text);
    assert.equal(normalize(normalize(text)), text);
  });
}

test("preserves LinkedIn spelling in prose and identifiers without joining ordinary words", () => {
  for (const source of [
    "LinkedIn hosts a workshop. Learn about LinkedIn's safety tools.",
    "Details: https://www.linkedin.com/in/CaseSensitive?name=LinkedIn&mode=STAR.",
    "The accounts are linked in the handout. Bring paper.",
  ]) {
    assert.equal(polishDescription(source), source);
    assert.equal(polishDescription(polishDescription(source)), source);
  }
});

test("shared acronym guards preserve published credentials, programs and place initials", () => {
  for (const acronym of ["STAR", "SJ", "LCSW", "CMEMS"]) {
    const title = `Discuss ${acronym} with Anne`;
    const description = `Join ${acronym} Volunteers. Ask about ${acronym}!`;
    assert.equal(cleanTitle(title), title);
    assert.equal(cleanTitle(cleanTitle(title)), title);
    assert.equal(polishDescription(description), description);
    assert.equal(polishDescription(polishDescription(description)), description);
  }
  assert.equal(cleanTitle("A BRIGHT Star over San Jose"), "A Bright Star over San Jose");
  assert.equal(polishDescription("See a BRIGHT star. bring a friend."), "See a Bright star. Bring a friend.");
  assert.equal(polishDescription("Meet Star and Sj at the library."), "Meet Star and Sj at the library.");
});

test("reviewed AI, analysis and vehicle initials survive all casing passes", () => {
  for (const acronym of ["AI", "SWOT", "UAV", "USV", "UUV"]) {
    const title = `Discuss ${acronym} with Anne`;
    const description = `Join ${acronym} Volunteers. Ask about ${acronym}!`;
    assert.equal(cleanTitle(title), title);
    assert.equal(cleanTitle(cleanTitle(title)), title);
    assert.equal(polishDescription(description), description);
    assert.equal(polishDescription(polishDescription(description)), description);
  }
  const title = "Silicon Valley Physical AI Meetup: Drones, UAV, USV, UUV & Supply Chains";
  assert.equal(cleanTitle(title), title);
  assert.equal(cleanTitle(cleanTitle(title)), title);
  for (const description of [
    "Meetup event by Silicon Valley Physical AI Builders.",
    "Spotting AI Scams and Fake Messages.",
    "Teens will review: SWOT Analysis.",
  ]) {
    assert.equal(polishDescription(description), description);
    assert.equal(polishDescription(polishDescription(description)), description);
  }
  assert.equal(polishDescription("Meet Ai and Swot. bring a friend."),
    "Meet Ai and Swot. Bring a friend.");
  assert.equal(cleanTitle("A BRIGHT Idea about AI"), "A Bright Idea about AI");
});

test("keeps ChatGPT, SketchUp and the FIRST Robotics Competition intact on refresh", () => {
  for (const title of ["Using ChatGPT", "Design with SketchUp", "FIRST Robotics Competition"]) {
    assert.equal(cleanTitle(title), title);
    assert.equal(cleanTitle(cleanTitle(title)), title);
  }
  for (const [source, expected] of [
    ["Using ChatGPT to summarize.", "Using ChatGPT to summarize."],
    ["Tinkercad or SketchUp. Students will learn.", "Tinkercad or SketchUp. Students will learn."],
    ["in the FIRST Robotics Competition", "In the FIRST Robotics Competition"],
    ["ChatGPT and SketchUp are tools. bring your first robotics project.",
      "ChatGPT and SketchUp are tools. Bring your first robotics project."],
    ["Tools: https://example.org/ChatGPT/SketchUp/FIRST?name=Emily-W.&topic=SWOT.",
      "Tools: https://example.org/ChatGPT/SketchUp/FIRST?name=Emily-W.&topic=SWOT."],
  ]) {
    assert.equal(polishDescription(source), expected);
    assert.equal(polishDescription(expected), expected);
  }
  assert.equal(cleanTitle("Our FIRST robotics project"), "Our First robotics project");
});

test("volunteer initials continue lists without suppressing real sentence boundaries", () => {
  for (const continuation of ["and Emily L.", "or Emily L.", "y Emilia L.", "e historias", "o más juegos", "u otras opciones"]) {
    const source = `Led by volunteers Emily W. ${continuation}! bring a friend.`;
    const expected = `Led by volunteers Emily W. ${continuation}! Bring a friend.`;
    assert.equal(polishDescription(source), expected);
    assert.equal(polishDescription(expected), expected);
  }
  assert.equal(polishDescription("Meet Emily W. bring a friend."), "Meet Emily W. Bring a friend.");
  assert.equal(polishDescription("Meet Emily W. You can bring a friend."), "Meet Emily W. You can bring a friend.");
});

test("name abbreviations preserve English and Spanish list continuations, then capitalize new sentences", () => {
  for (const continuation of ["and Mario Kart", "or Mario Kart", "y Super Mario", "e historias", "o más juegos", "u otras opciones"]) {
    const source = `Play Super Smash Bros. ${continuation}. bring a friend.`;
    const expected = `Play Super Smash Bros. ${continuation}. Bring a friend.`;
    assert.equal(polishDescription(source), expected);
    assert.equal(polishDescription(expected), expected);
  }
  assert.equal(polishDescription("Play Super Smash Bros. bring a friend."),
    "Play Super Smash Bros. Bring a friend.");
  assert.equal(polishDescription("Mario Kart, Super Smash Bros., and Super Mario Party. Free. No registration required."),
    "Mario Kart, Super Smash Bros., and Super Mario Party. Free. No registration required.");
  assert.equal(polishDescription("Meet Martin Luther King Jr. and his family. bring a book."),
    "Meet Martin Luther King Jr. and his family. Bring a book.");
});

test("preserves OpenAI in prose while leaving source links byte-identical", () => {
  for (const source of [
    "Read OpenAI's Model Spec.",
    "OpenAI publishes the Model Spec. Discuss OpenAI and AI safety.",
    "Read OpenAI's Model Spec at https://example.org/OpenAI?month=Nov.&name=OpenAI.",
  ]) {
    assert.equal(polishDescription(source), source);
    assert.equal(polishDescription(polishDescription(source)), source);
  }
  assert.equal(polishDescription("An open AI discussion follows. Join us!"),
    "An open AI discussion follows. Join us!");
  assert.equal(polishDescription("Read Open AI's Model Spec."), "Read OpenAI's Model Spec.");
});

test("month abbreviations keep following prose lowercase through repeated polishing", () => {
  for (const month of ["Jan", "Feb", "Mar", "Apr", "Jun", "Jul", "Aug", "Sep", "Sept", "Oct", "Nov", "Dec"]) {
    const source = `A perfect follow-up to The Women (our ${month}. selection). Registration required.`;
    assert.equal(polishDescription(source), source);
    assert.equal(polishDescription(polishDescription(source)), source);
    assert.equal(polishDescription(`Meet on ${month}. 21 at 4:30 p.m. Bring a book.`),
      `Meet on ${month}. 21 at 4:30 p.m. Bring a book.`);
  }
  assert.equal(polishDescription("The November selection is here. bring a book."),
    "The November selection is here. Bring a book.");
});

test("removes invisible spacing outside identifiers without breaking joined emoji", () => {
  const source = "Homework Club. \u200b No registration is required. Bring\u200bpaper. A\u2060rt \uFEFFsupplies. 👩‍👧";
  const expected = "Homework Club. No registration is required. Bring paper. Art supplies. 👩‍👧";
  assert.equal(polishDescription(source), expected);
  assert.equal(polishDescription(expected), expected);
  const url = "https://example.org/OpenAI\u200b?month=Nov.\u2060&item=SD";
  assert.equal(polishDescription(`Details: ${url}`), `Details: ${url}`);
});

test("preserves separated equipment and repairs previously split meridiems", () => {
  const list = "Please bring: Laptop; SD Card; USB Drive.";
  assert.equal(polishDescription(list), list);
  assert.equal(polishDescription("Free homework help from 4:30p. M. - 6:00p. M."),
    "Free homework help from 4:30 p.m. - 6:00 p.m.");
  for (const source of [
    "Free homework help from 4:30p.m. - 6:00p.m.",
    "Free homework help from 4:30p. m. - 6:00p. m.",
    "Free homework help from 4:30 p.m. - 6:00 p.m.",
  ]) assert.equal(polishDescription(source), "Free homework help from 4:30 p.m. - 6:00 p.m.");
  assert.equal(polishDescription("Doors at 9:30a.m. No registration required."),
    "Doors at 9:30 a.m. No registration required.");
});

test("plain-text descriptions retain emphasized wording without raw markup", () => {
  for (const [source, expected] of [
    ["Read **The Book** before the Nov. discussion. *Registration required.*",
      "Read The Book before the Nov. discussion. Registration required."],
    ["***Please note the room change.*** No registration required.",
      "Please note the room change. No registration required."],
    ["**Note: The November 7th session is at the Art Center. ** Join us.",
      "Note: The November 7th session is at the Art Center. Join us."],
    ["Meetup event by South Bay *Brazilian* Portuguese Conversation and Culture.",
      "Meetup event by South Bay Brazilian Portuguese Conversation and Culture."],
  ]) {
    assert.equal(polishDescription(source), expected);
    assert.equal(polishDescription(expected), expected);
  }
  const source = "Magik*Magik performs. Calculate 2 * 3 * 4. Seats* are limited. Details: https://example.org/**Book**?name=*Brazilian*";
  assert.equal(polishDescription(source), source);
});

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

test("corrects Fei-Fei Li's name through library ingestion without rewriting links or attendance", () => {
  // Macmillan's The Worlds I See author credit confirms the hyphenated name.
  const details = libraryEventDetails({ definition: { description:
    "<p>Read <em>The Worlds I See</em> by Fei Fei Li.</p><p>You don't have to register.</p><p>Details: https://example.org/FeiFeiLi?author=Fei%20Fei%20Li</p>",
  } });
  const expected = "Read The Worlds I See by Fei-Fei Li. You don't have to register. Details: https://example.org/FeiFeiLi?author=Fei%20Fei%20Li";
  assert.equal(polishDescription(details.description), expected);
  assert.equal(polishDescription(expected), expected);
  assert.equal(cleanTitle("Meet Fei Fei Li"), "Meet Fei-Fei Li");
  assert.equal(cleanTitle("Meet Fei-Fei Li"), "Meet Fei-Fei Li");
  assert.equal(polishDescription("Read a book by Fei Li. Meet Fei Fei Chen."),
    "Read a book by Fei Li. Meet Fei Fei Chen.");
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

test("punctuates tech-help services while preserving optional and required appointments", () => {
  // Two SJPL occurrences share a flattened list but have different booking
  // rules and contacts. Copy repairs must not turn either into the other.
  const list = "Basic smartphone, tablet, and computer help Setting up and using Email Downloading and using apps Making video calls (Zoom, FaceTime, Google Meet, etc.) Browsing the internet (search engine basics, making simple searches, etc.) Navigating the SJPL website and digital resources";
  for (const [extra, condition] of [
    [" How to use 311 app", "Appointments are recommended. Call (408) 808-3033 or email marlene.sanchez@sjlibrary.org."],
    ["", "Appointments are required. Call 408-808-3073 or email caitlin.bosworth@sjlibrary.org."],
  ]) {
    const actual = polishDescription(`Our Tech Mentor can help you with: ${list}${extra} *Please note: Tech Mentor support is limited to basic technology questions. ${condition}`);
    assert.match(actual, /computer help; setting up and using email; downloading and using apps; making video calls/);
    assert.match(actual, /Google Meet, etc\.\); browsing the internet/);
    assert.match(actual, /simple searches, etc\.\); navigating the SJPL website/);
    assert.match(actual, /\. Please note: Tech Mentor support is limited to basic technology questions\./);
    assert.ok(actual.endsWith(condition), "booking rules and contact bytes survive");
    assert.equal(actual.includes("; how to use the 311 app."), Boolean(extra));
    assert.equal(polishDescription(actual), actual);
  }
});

test("keeps bilingual tech-help list items and attendance text through punctuation repair", () => {
  const source = "Nuestra asistencia de Tech Mentor puede incluir, pero no se limita a: Ayuda básica con teléfonos inteligentes, tabletas y computadoras Configurar y usar el correo electrónico Descargar y usar aplicaciones Hacer videollamadas (Zoom, FaceTime, Google Meet, etc.) Navegar por internet (conceptos básicos de motores de búsqueda, hacer búsquedas simples, etc.) Navegar el sitio web y los recursos digitales de SJPL Cómo usar la aplicación 311 * Ten en cuenta: el apoyo de Tech Mentor se limita a preguntas básicas de tecnología. Se recomienda hacer una cita. Llame al (408) 808-3033 o escriba a marlene.sanchez@sjlibrary.org.";
  const actual = polishDescription(source);
  assert.match(actual, /computadoras; configurar y usar el correo electrónico; descargar y usar aplicaciones; hacer videollamadas/);
  assert.match(actual, /Google Meet, etc\.\); navegar por internet/);
  assert.match(actual, /recursos digitales de SJPL; cómo usar la aplicación 311\. Ten en cuenta:/);
  assert.ok(actual.endsWith("Se recomienda hacer una cita. Llame al (408) 808-3033 o escriba a marlene.sanchez@sjlibrary.org."));
  const words = (text) => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}@]+/gu, " ").trim();
  assert.equal(words(actual), words(source), "only punctuation and capitalization change");
  assert.equal(polishDescription(actual), actual);
});

test("copy fixes retain technical slash pairs, artwork titles, and URL identifiers", () => {
  for (const title of [
    "From Silent Data Failures to Enforceable CI/CD Gates",
    "SJSU Music presents SJSU Wind Ensemble: Dark/Night",
    "Hands-Only CPR/AED & Choking Relief Training",
  ]) {
    assert.equal(cleanTitle(title), title);
  }
  assert.equal(cleanTitle("Bilingual Storytime: Mandarin/English"), "Bilingual Storytime: Mandarin / English");
  assert.equal(cleanTitle("Gaming Club (Grade 4 - 8)"), "Gaming Club (Grades 4-8)");
  const url = "https://example.org/Human/Agent?text=Time-magazine,one-of-the-Best-Ya-Books-of-All-Time";
  assert.equal(polishDescription(`Details: ${url}`), `Details: ${url}`);
  assert.equal(polishDescription("Best YA Books of All Time."), "Best YA Books of All Time.");
  assert.equal(polishDescription("See ya at the library."), "See ya at the library.");
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
  assert.equal(polishDescription("Please note that this is for ages12+"), "Please note that this is for ages 12+.");
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
    "The Monday Morning Book Club meets in the Library Conference Room.",
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

test("preserves corrected source initials and venue names in titles and descriptions", () => {
  const descriptions = [
    "RSVP is required.",
    "RSVP for the Lowrider Art Showcase.",
    "The ghosts are out at MOAH this Halloween! Grab your costumes for a night of eerie vibes and spine-tingling fun. Click to RSVP.",
    "At 7:30 p.m. Created by SBMT.",
    'At 7:30 p.m. Created and directed by Brad Handshy. From Brad Handshy, the creator of SBMT\'s beloved "Broadway By The Decade" series, comes a new concert with a twist: every song will be funny.',
    "Meetup event by Bay Area Social Hub (BASH).",
    "Meet at BJ's for happy hour.",
  ];
  const titles = [
    "Wednesday Happy Hour at BJ's!",
    "Wednesday Happy Hour at BJ’s!",
    "RSVP for the Museum Tour",
    "A Night with SBMT and MOAH",
  ];
  for (const description of descriptions) {
    assert.equal(polishDescription(description), description);
    assert.equal(polishDescription(polishDescription(description)), description);
  }
  for (const title of titles) {
    const expected = title.replaceAll("’", "'");
    assert.equal(cleanTitle(title), expected);
    assert.equal(cleanTitle(cleanTitle(title)), expected);
  }
  // Initials are protected as supplied, never guessed from ordinary words.
  assert.equal(polishDescription("Meet Bj at the museum."), "Meet Bj at the museum.");
});

test("preserves Roman numerals through every title and description casing pass", () => {
  const copy = "Join us in honoring the World War II Japanese American veterans who fought in World War II with a community gathering and monument dedication.";
  assert.equal(polishDescription(copy), copy);
  assert.equal(polishDescription(polishDescription(copy)), copy);
  for (const numeral of ["II", "III", "IV", "VIII", "XII", "XXI", "XLII", "LX"]) {
    const title = `Community Concert Part ${numeral}`;
    const description = `Hear Part ${numeral} Performed Live.`;
    assert.equal(cleanTitle(title), title);
    assert.equal(cleanTitle(cleanTitle(title)), title);
    assert.equal(polishDescription(description), description);
    assert.equal(polishDescription(polishDescription(description)), description);
  }
});

test("preserves complete quoted subtitles across sentence boundaries", () => {
  const stanford = 'Fireside Chat: "What is the Stanford Woods Institute for the Environment? A journey into the world\'s most pressing environmental problems"';
  const descriptions = [
    stanford,
    'A conversation: "What comes next? A journey together! An evening of discovery"',
    'Hear "What comes next? A journey together" and "Why now? A shared future"',
    'A complete sentence. "What comes next? A journey together"',
    'Hear "A new beginning." A complete subtitle',
  ];
  for (const description of descriptions) {
    assert.equal(polishDescription(description), description);
    assert.equal(polishDescription(polishDescription(description)), description);
  }
  assert.equal(polishDescription(stanford.replaceAll('"', '“').replace(/“$/, '”')), stanford);
});

test("still removes genuinely incomplete quote tails and scraper metadata", () => {
  for (const [raw, expected] of [
    ['A complete sentence. This fragment has an "unfinished quote', 'A complete sentence.'],
    ['Hear "A new beginning." This fragment has an "unfinished quote', 'Hear "A new beginning."'],
    ['A complete sentence. This fragment stops in a […]', 'A complete sentence.'],
    ['Hear "A new beginning." Wheelchair Accessible', 'Hear "A new beginning."'],
    ['A complete sentence. Register', 'A complete sentence.'],
  ]) {
    assert.equal(polishDescription(raw), expected);
    assert.equal(polishDescription(expected), expected);
  }
});

test("still normalizes shouted prose and source punctuation", () => {
  assert.equal(cleanTitle("KID Cudi and ALL Things"), "Kid Cudi and All Things");
  assert.equal(cleanTitle("A CIVIC Conversation"), "A Civic Conversation");
  assert.equal(polishDescription("JOIN us for a SPECIAL PERFORMANCE."), "Join us for a Special Performance.");
  assert.equal(polishDescription("At 7:30 p.m.. RSVP is required."), "At 7:30 p.m. RSVP is required.");
});

test("preserves source names, initials, honorifics and Spanish ordinals on repeated cleanup", () => {
  const descriptions = [
    "WVCS offers fresh produce at the Park-It Market.",
    "Using iPads and FlipaClip, animate a scene inspired by DreamWorks.",
    "iPad devices will be provided to all participants.",
    "Join Mr. and Mrs. Tweedy for a screening.",
    "Meet Dr. Chen and Prof. Wilson.",
    "Ayuda de lectura para estudiantes de 1.º a 3.º grado.",
    "See the exhibition. patty chang: surfacing engages the ocean as a symbolic space.",
  ];
  for (const source of descriptions) {
    assert.equal(polishDescription(source), source);
    assert.equal(polishDescription(polishDescription(source)), source);
  }
  for (const title of ["OCD Awareness Event", "[SV] Enterprise AI Showcase", "WVCS Park-It Market"]) {
    assert.equal(cleanTitle(title), title);
    assert.equal(cleanTitle(cleanTitle(title)), title);
  }
  const url = "https://example.org/iPads/FlipaClip?studio=DreamWorks";
  assert.equal(polishDescription(`Details: ${url}`), `Details: ${url}`);
});

test("separates flattened schedules and attendance text without changing their facts", () => {
  const cases = [
    [
      "Doors open at 2:00 PM, and movie begins at 2:10 PM Adults need to stay in the room with their children.",
      "Doors open at 2:00 PM, and the movie begins at 2:10 PM. Adults need to stay in the room with their children.",
    ],
    [
      "Materials will be provided, recommended for ages 7+ Free. Limited iPads available.",
      "Materials will be provided. Recommended for ages 7+. Free. Limited iPads available.",
    ],
    [
      "Storytime 5:30-6:00 PM Stay & Play 6:00-6:30 PM Free, with limited capacity.",
      "Storytime: 5:30-6:00 PM; Stay & Play: 6:00-6:30 PM. Free, with limited capacity.",
    ],
    [
      "Storytime 11:00-11:30 AM Stay & Play 11:30 AM-12:00 PM This program is developed to align with the Early Education Quality Standards.",
      "Storytime: 11:00-11:30 AM; Stay & Play: 11:30 AM-12:00 PM. This program is developed to align with the Early Education Quality Standards.",
    ],
    [
      "Lapsit Storytime 11:00 - 11:30 am Stay & Play 11:30 am - 12:00 pm Please note that this will be an indoor program.",
      "Lapsit Storytime: 11:00 - 11:30 am; Stay & Play: 11:30 am - 12:00 pm. Please note that this will be an indoor program.",
    ],
    [
      "Children and caregivers continue the fun together Storytime: 11:30 a.m. to noon Stay & Play: noon to 12:30 p.m.",
      "Children and caregivers continue the fun together. Storytime: 11:30 a.m. to noon; Stay & Play: noon to 12:30 p.m.",
    ],
    [
      "October 24 - October 25, 2026 Saturday, October 24 | 10:00 AM – 1:00 PM Sunday, October 25 | 12:00 PM – 2:00 PM Wearing signature orange overalls, Farmer Mike carves pumpkins.",
      "October 24 - October 25, 2026. Saturday, October 24 | 10:00 AM – 1:00 PM; Sunday, October 25 | 12:00 PM – 2:00 PM. Wearing signature orange overalls, Farmer Mike carves pumpkins.",
    ],
    [
      "Saturday Hours: Bargain Room 9:30 AM – 4 PM Children's Room 10 AM – 4 PM Main Room 11 AM – 4 PM Sunday Hours: All Rooms 1 PM – 4 PM",
      "Saturday Hours: Bargain Room: 9:30 AM – 4 PM; Children's Room: 10 AM – 4 PM; Main Room: 11 AM – 4 PM. Sunday Hours: All Rooms: 1 PM – 4 PM.",
    ],
    [
      "October 21st at 11:00 AM In Our Program Room October 22nd at 7:30 PM In Our Program Room Classic Library copies are available. For Adults, Ages 18+ We thank the Friends of the Library.",
      "October 21st at 11:00 AM in our program room; October 22nd at 7:30 PM in our program room. Classic Library copies are available. For adults, ages 18+. We thank the Friends of the Library.",
    ],
    [
      "When: Wednesdays, 1:00 PM – 2:00 PM Where: Los Altos Library, Orchard Room For accessibility accommodations, use the form at sccld.org/accessibility 7+ days prior to the event.",
      "When: Wednesdays, 1:00 PM – 2:00 PM; Where: Los Altos Library, Orchard Room. For accessibility accommodations, use the form at sccld.org/accessibility 7+ days prior to the event.",
    ],
    [
      "The program has an interactive 20 minutes of: Catchy Songs & Silly Rhymes Gentle Movement & Baby Sign Language Short Books perfect for little eyes Stick around afterward!",
      "The program has an interactive 20 minutes of catchy songs & silly rhymes; gentle movement & baby sign language; and short books perfect for little eyes. Stick around afterward!",
    ],
    [
      "Homework Help will not be held on the following dates: September 7 October 12 November 2 November 11 November 23 to November 26 December 21 to January 4 Are you interested in volunteering for Homework Help?",
      "Homework Help will not be held on the following dates: September 7; October 12; November 2; November 11; November 23 to November 26; December 21 to January 4. Are you interested in volunteering for Homework Help?",
    ],
    [
      "Saturday, June 20, King Plaza Saturday, July 18, King Plaza Saturday, August 8, Downtown Library Saturday, September 12, Downtown Library Workshops supported by the Palo Alto Public Art Program.",
      "Saturday, June 20, King Plaza; Saturday, July 18, King Plaza; Saturday, August 8, Downtown Library; Saturday, September 12, Downtown Library. Workshops supported by the Palo Alto Public Art Program.",
    ],
    [
      "Starting Time: 2:30 pm Ending Time: 4:00 pm Community Room 201A On the first Friday of each month we will meet in Room 201B On Friday, October 30, we will meet in the Library Think Tank.",
      "Starting Time: 2:30 pm; Ending Time: 4:00 pm; Community Room 201A. On the first Friday of each month we will meet in Room 201B. On Friday, October 30, we will meet in the Library Think Tank.",
    ],
    [
      "The Spooky Movies Festival hosts a Triple feature. Sunday, October 18th - Funny movies 11:00 AM - Abbott and Costello Meet Frankenstein 1:00 PM - Little Shop of Horrors (1986) 3:00 PM - Gremlins Sunday, October 25th - Haunted House movies 11:00 AM - The Innocents 1:00 PM - The Haunting (1963) 3:00 PM - The Others.",
      "The Spooky Movies Festival hosts a triple feature. Sunday, October 18th - Funny movies: 11:00 AM - Abbott and Costello Meet Frankenstein; 1:00 PM - Little Shop of Horrors (1986); 3:00 PM - Gremlins. Sunday, October 25th - Haunted House movies: 11:00 AM - The Innocents; 1:00 PM - The Haunting (1963); 3:00 PM - The Others.",
    ],
  ];
  for (const [source, expected] of cases) {
    const actual = polishDescription(source);
    assert.equal(actual, expected);
    assert.equal(polishDescription(actual), expected);
    assert.deepEqual(actual.match(/\d+(?:[:.]\d+)?\+?/g), source.match(/\d+(?:[:.]\d+)?\+?/g));
  }
});

test("separates class labels while preserving course numbers, contact addresses and instructor names", () => {
  const source = "Submit the registration form To schedule your assessment, email marcela.guevara@sjlibrary.org ESL 502 Course Information: Starts: August 25, 2026 Ends: December 10, 2026 Class Days: Tuesday, Wednesday, and Thursday Time: 5:15 PM – 6:45 PM Instructor: TBD We will assist you in person.";
  const expected = "Submit the registration form. To schedule your assessment, email marcela.guevara@sjlibrary.org. ESL 502 Course Information: Starts: August 25, 2026; Ends: December 10, 2026; Class Days: Tuesday, Wednesday, and Thursday; Time: 5:15 PM – 6:45 PM; Instructor: TBD. We will assist you in person.";
  assert.equal(polishDescription(source), expected);
  assert.equal(polishDescription(expected), expected);
  const reading = "ESL 501 Reading & Writing 1 What will you learn? Course Information Starts: August 25, 2026 Ends: December 10, 2026 Meeting Days: Tuesday, Wednesday, and Thursday Time: 10:30 AM - 12:30 PM Instructor: Michelle N. Henninger Before the classes start, complete a Guided Self-Placement (GSP).";
  const actual = polishDescription(reading);
  assert.match(actual, /ESL 501 Reading & Writing 1\. What will you learn\?/);
  assert.match(actual, /Course Information: Starts: August 25, 2026; Ends: December 10, 2026;/);
  assert.match(actual, /Instructor: Michelle N\. Henninger\. Before the classes start,/);
  assert.equal(polishDescription(actual), actual);
});

test("leaves ordinary clock, room, age and date prose intact", () => {
  for (const source of [
    "Until 12 PM the storytime librarian will be in the Children's Room.",
    "Meet in the Children's Room for stories at 10 AM with a caregiver.",
    "For ages 7+ with an adult. Free materials will be provided.",
    "The project runs from November 23 to November 26 and December 21 to January 4.",
    "The movie begins at 2:10 PM and adults are welcome.",
    "Starting Time: 2:30 pm. Story Time: 4:00 pm.",
    "The evening ended. And then we went home.",
  ]) assert.equal(polishDescription(source), source);
});

test("keeps recurring title copy corrections through refreshes", () => {
  for (const [source, expected] of [
    ["How to Identify and Avoid Becoming a Victim to Common Scams", "How to Identify and Avoid Becoming a Victim of Common Scams"],
    ["2000's Night", "2000s Night"],
  ]) {
    assert.equal(cleanTitle(source), expected);
    assert.equal(cleanTitle(expected), expected);
  }
  assert.equal(cleanTitle("A Night's Journey"), "A Night's Journey");
});

test("repairs library music copy while retaining supplies, eligibility and act duration", () => {
  for (const [source, expected] of [
    [
      "Bring your own guitar or ukulele, all other materials will be provided. Intermediate players and above are welcome.",
      "Bring your own guitar or ukulele; all other materials will be provided. Intermediate players and above are welcome.",
    ],
    [
      "Sign ups for the open mic are first-come, first-served and every act will be limited to 6 minutes.",
      "Sign-ups for the open mic are first-come, first-served; every act will be limited to 6 minutes.",
    ],
    ["Enjoy a reading and a sing-a-long! Registration required.", "Enjoy a reading and a sing-along! Registration required."],
  ]) {
    assert.equal(polishDescription(source), expected);
    assert.equal(polishDescription(expected), expected);
  }
  const url = "https://example.org/sing-a-long/sign-ups?title=2000%27sNight";
  assert.equal(polishDescription(`Details: ${url}`), `Details: ${url}`);
});

test("finishes complete source sentences without closing off links or cut-off prose", () => {
  const dance = "SJSU Dance presents Emerging by SJSU University Dance Theater, featuring choreography by Resident Dance Artist Monica Bill Barnes and SJSU Dance faculty Jenni Hong and Chafin Seymour";
  for (const [source, expected] of [
    ["Please note that this is for ages12+", "Please note that this is for ages 12+."],
    [dance, `${dance}.`],
    ['Reviews: "researched" (Washington Post);"outstanding" (Boston Globe).', 'Reviews: "researched" (Washington Post); "outstanding" (Boston Globe).'],
  ]) {
    assert.equal(polishDescription(source), expected);
    assert.equal(polishDescription(expected), expected);
  }
  for (const source of [
    "Please note that this is for ages 12+ with a caregiver",
    "Please note that this is for ages",
    "Questions? Email library@example.org",
    "Details: https://example.org/review;name",
  ]) assert.equal(polishDescription(source), source);
});

test("repairs library follow-up and supply sentences while preserving attendance instructions", () => {
  const cases = [
    [
      "Limited registration is intentional to allow readers rewarding one-on-one reading time with a therapy dog. More details on your confirmed time-slot, and instruction to follow once registered. Ages 8-12.",
      "Limited registration is intentional to allow readers rewarding one-on-one reading time with a therapy dog. More details on your confirmed time slot and instructions will follow once you register. Ages 8-12.",
    ],
    [
      "Come craft beautiful, handmade cards. No experience needed, we'll have all the supplies on hand, just bring your creativity and a warm heart! Drop by and be part of a year filled with kindness.",
      "Come craft beautiful, handmade cards. No experience needed. We'll have all the supplies on hand; just bring your creativity and a warm heart! Drop by and be part of a year filled with kindness.",
    ],
  ];
  for (const [source, expected] of cases) {
    const actual = polishDescription(source);
    assert.equal(actual, expected);
    assert.equal(polishDescription(actual), expected);
  }
  for (const source of [
    "More details on your confirmed appointment will follow. Registration required.",
    "No experience needed, but registration is required. Bring your own supplies.",
    "Details: https://example.org/More-details-on-your-confirmed-time-slot?supplies=No-experience-needed",
  ]) assert.equal(polishDescription(source), source);
});

test("keeps refreshed community titles readable without changing identifiers or acronyms", () => {
  const cases = [
    ["1-on-1 Tech Help/ Asistencia Tecnológica", "1-on-1 Tech Help / Asistencia Tecnológica"],
    ["Asistencia tecnologica y ayuda personalizada", "Asistencia tecnológica y ayuda personalizada"],
    ["For New memebers Fine Dining&Conversation in Roger B&R, Mountain View",
      "For New Members: Fine Dining & Conversation in Roger B&R, Mountain View"],
    ["Agentic AI doesnt have an Intelligence problem, it has a Governance problem!",
      "Agentic AI doesn't have an intelligence problem; it has a governance problem!"],
    ["Almaden Quicksilver (Webb Canyon) with Country Inn.",
      "Almaden Quicksilver (Webb Canyon) with Country Inn"],
    ["Korean Indigenous Futures: The Art of Kim Bong-Jun: - K",
      "Korean Indigenous Futures: The Art of Kim Bong-Jun"],
    ["Salsa classes & social dancing at Albertos Night Club, Mountain View",
      "Salsa classes & social dancing at Alberto's Night Club, Mountain View"],
    ["Voices United Against Hate: Group Sing-a-long",
      "Voices United Against Hate: Group Sing-along"],
  ];
  for (const [source, expected] of cases) {
    assert.equal(cleanTitle(source), expected);
    assert.equal(cleanTitle(expected), expected);
  }
  for (const source of ["800 Welch: Flu & COVID-19 Vaccination Clinic", "W.A.S.P.",
    "Hands-Only CPR/AED & Choking Relief Training", "From Silent Data Failures to Enforceable CI/CD Gates",
    "SJSU Music presents SJSU Wind Ensemble: Dark/Night"]) {
    assert.equal(cleanTitle(source), source);
  }
});

test("repairs refreshed library grammar while retaining ages, appointment gates and links", () => {
  const cases = [
    ["This event is program is for ages 18+, it is an adult and senior only program. Registration is required.",
      "This program is for ages 18+; it is for adults and seniors only. Registration is required."],
    ["Our Tech Mentor assistance can include but not limited to: email help. Appointment required.",
      "Our Tech Mentor assistance includes, but is not limited to, email help. Appointment required."],
    ["Walk-ins welcome as spaces allows. Basic school supplies will be provided.",
      "Walk-ins welcome as space allows. Basic school supplies will be provided."],
    ["Participants will be able explore. We'll provide the supplies and brief slime making demo, you bring your energy. We'll make slime while supplies and time lasts. Recommended for ages 5 to 12. Registration required.",
      "Participants will be able to explore. We'll provide the supplies and a brief slime-making demo; you bring your energy. We'll make slime while supplies and time last. Recommended for ages 5 to 12. Registration required."],
    ["Join us for a Halloween-themed roll playing game, Adventure Skeletons.",
      "Join us for a Halloween-themed role-playing game, Adventure Skeletons."],
    ["Free. ___________________. For children and their caretakers.;;;, Registration required.",
      "Free. For children and their caretakers. Registration required."],
    ["Join our line dance. First-time participants will need to sign a waiver form. bolg:,, (Overdrive). Overdirve:,, Hoopla: (ADA)",
      "Join our line dance. First-time participants will need to sign a waiver form."],
  ];
  for (const [source, expected] of cases) {
    assert.equal(polishDescription(source), expected);
    assert.equal(polishDescription(expected), expected);
  }
  const source = "Bring paper for dyeing. Details: https://example.org/roll-playing-game?word=Durateion&name=Showcasre";
  assert.equal(polishDescription(source), source);
});

test("removes clipped preview tails without fabricating completions or stranding initials", () => {
  const lead = "The East Asia Library at Stanford University will host a print exhibition by Kim Bong-Jun, a leading figure in Korean Minjung (People's) Art, from September 29 to December 11, 2026.";
  assert.equal(polishDescription(`${lead} Active since the…`), lead);
  const incomplete = "Stanford University Libraries presents A Vision of Paris: the Roxane Debuisson Collection at Stanford, on view in the Peterson Gallery and Munger Rotunda of the Cecil H. Green Library from September…";
  assert.equal(polishDescription(incomplete), "");
  assert.equal(polishDescription("…"), "");
  const abbreviation = "Legendary heavy metal band W.A.S.P. brings their 1984 to Headless 2026 U.S. and Canada Tour to the San Jose Civic on Tuesday, October 27 with KK's Priest joining as special guest.";
  assert.equal(polishDescription(`${abbreviation} Tickets are…`), abbreviation);
  for (const source of [lead, abbreviation, "Who knows…", "Stay tuned...", "Free. Registration required. Visit https://example.org/show?item=1.5&group=U.S."]) {
    assert.equal(polishDescription(source), source);
  }
});

test("completes clipped attendance and schedule clauses before trimming previews", () => {
  for (const age of [18, 21]) {
    const lead = `This event is ${age} and over. Any ticket holder unable to present valid identification indicating that they are at least ${age} years of age will not be admitted to this event`;
    const actual = polishDescription(`${lead}, and will not be eligible for…`);
    assert.equal(actual, `${lead}.`);
    assert.equal(polishDescription(actual), actual);
  }
  assert.equal(polishDescription("Flex Schedule: Please be aware that there are certain games that are subject to flexible scheduling and the date and time of those games may be changed from what is currently reflected on the…"),
    "Flex Schedule: Some games are subject to flexible scheduling, so their dates and times may change.");
  assert.equal(polishDescription("Doors: 7:30 PM | Show: 8:00 PM Run Time: 90 minutes with no…"),
    "Doors: 7:30 PM | Show: 8:00 PM Run Time: 90 minutes.");
  assert.equal(polishDescription("San Jose Open Mic -When is the Open Mic? Second Wednesday of the month with a few exceptions. What time is the Open Mic? 8:00 PM to 9:30 PM with sign-ups starting…"),
    "San Jose Open Mic -When is the Open Mic? Second Wednesday of the month with a few exceptions. What time is the Open Mic? 8:00 PM to 9:30 PM.");
});

test("restores Santana Row schedule boundaries without changing clocks or venues", () => {
  const source = "Entertainment Schedule: 10:30 AM – 10 PM: Brunch at Zazil & contribute to the Community Ofrendas (Altars)12 – 5 PM: Cultural Pop-Up Market12 – 3 PM: Día de los Muertos Catrina Photo Ops in Oak Tree Lounge (by Blue Bottle Coffee)12 – 3 PM: Face Painting in Santana Row Park1 – 3 PM: Mariachi & Dance Performances in Santana Row Park3– 4:30 PM: Mariachi & Face Painting at El Jardín Tequila Bar4:30 – 6 PM: Mariachi at Zazil";
  const actual = polishDescription(source);
  assert.equal(actual.split("; ").length, 7);
  assert.deepEqual(actual.match(/\d+(?::\d+)?|\b[AP]M\b/g), source.match(/\d+(?::\d+)?|\b[AP]M\b/g));
  for (const place of ["Zazil", "Community Ofrendas (Altars)", "Cultural Pop-Up Market", "Oak Tree Lounge (by Blue Bottle Coffee)", "Santana Row Park", "El Jardín Tequila Bar"]) {
    assert.equal(actual.split(place).length, source.split(place).length, place);
  }
  assert.match(actual, /Park; 1 – 3 PM:/);
  assert.match(actual, /Park; 3 – 4:30 PM:/);
  assert.match(actual, /Mariachi at Zazil\.$/);
  assert.equal(polishDescription(actual), actual);
  const unrelated = "Concert at Park3– 4:30 PM. Details: https://example.org/Park3–4:30?room=12";
  assert.equal(polishDescription(unrelated), unrelated);
});

test("separates tech-help and VIP lists while preserving participation and ticket details", () => {
  const source = "Offered in English, or Tiếng Việt. They can assist you with basic tech issues, such as: Setting up an email account, composing & sending emails, using email attachments Web searches and basic data entry Learning the basics of Microsoft Word and Excel and web-based productivity software such as Google docs Using the library's pay-for-print and photocopy machines Downloading apps on your phone or tablet And much more! Free, No Registration Required";
  const actual = polishDescription(source);
  for (const service of ["email account", "email attachments", "web searches", "basic data entry", "Microsoft Word and Excel", "Google Docs", "pay-for-print and photocopy machines", "apps on your phone or tablet"]) {
    assert.ok(actual.toLowerCase().includes(service.toLowerCase()), service);
  }
  assert.match(actual, /^Offered in English or Tiếng Việt\./);
  assert.match(actual, /Free\. No registration required\.$/);
  assert.equal(actual.split("; ").length, 6);
  assert.equal(polishDescription(actual), actual);

  const ticket = polishDescription("Modern Hel Tour Pre-Show VIP M&G Ticket Includes:- GA Ticket & Early Venue Entry (1 hour prior to doors)- Early Merch Access- Exclusive Poster- Photo / Signing Opportunity- Acoustic Set");
  assert.equal(ticket.split("; ").length, 5);
  assert.match(ticket, /VIP M&G ticket includes: GA ticket & early venue entry \(1 hour prior to doors\)/);
  assert.match(ticket, /early merch access; exclusive poster; photo \/ signing opportunity; acoustic set\.$/);
  assert.equal(polishDescription(ticket), ticket);
  const url = "Details: https://example.org/snacks-feel-free?project=Scarfs&question=Como-participar";
  assert.equal(polishDescription(url), url);
});

test("keeps media-lab appointments, equipment and booking identifiers through list repair", () => {
  for (const branch of ["Mitchell Park", "Rinconada"]) {
    const source = `How to Access Check the Vintage Media Lab page. Click Book@${branch}. Appointments are limited to a single two-hour appointment per week per person. Because space and time in the Vintage Media Lab is limited, we appreciate your cooperation. What to Bring Laptop Sd Card, Memory Card USB Drive, Flash Drive or Memory Stick External Hard Drive Your Vintage Media! Details: https://example.org/What-to-Bring?branch=${branch.replaceAll(" ", "%20")}`;
    const actual = polishDescription(source);
    assert.match(actual, /How to access: Check/);
    assert.match(actual, /space and time in the Vintage Media Lab are limited/);
    assert.match(actual, /What to bring: laptop; SD card, memory card; USB drive, flash drive or memory stick; external hard drive; your vintage media!/);
    assert.ok(actual.includes(`Book@${branch}`));
    assert.ok(actual.includes("a single two-hour appointment per week per person"));
    assert.equal(actual.match(/https:\/\/\S+/)[0], source.match(/https:\/\/\S+/)[0]);
    assert.equal(polishDescription(actual), actual);
  }
});

test("preserves volunteer eligibility and event clocks when separating flattened source copy", () => {
  const volunteer = "Details and Requirements: Must arrive by 4:45 p.m. to sign-in at the Information Desk Must sign a waiver form provided (parents must sign for those under the age of 18) Must be able to commit to the full session (5:00 p.m. to 6:00 p.m.) Anyone under the age of 15 must volunteer alongside a parent/guardian No experience or special skills necessary Training and supplies will be provided For more information, please call 408-808-3036.";
  const actual = polishDescription(volunteer);
  assert.deepEqual(actual.match(/\d+/g), volunteer.match(/\d+/g));
  for (const fact of ["Must arrive by 4:45 p.m.", "must sign a waiver form provided", "parents must sign for those under the age of 18", "must be able to commit to the full session (5:00 p.m. to 6:00 p.m.)", "anyone under the age of 15 must volunteer alongside a parent/guardian", "Training and supplies will be provided.", "408-808-3036"]) {
    assert.ok(actual.includes(fact), fact);
  }
  assert.match(actual, /sign in at the Information Desk; must sign/);
  assert.equal(polishDescription(actual), actual);

  const awards = "Doors open at 5:30 p.m., program starts at 6 p.m. RSVP is required, registration will open for the public on Monday, September 21.";
  assert.equal(polishDescription(awards), "Doors open at 5:30 p.m. The program starts at 6 p.m. RSVP is required. Registration will open for the public on Monday, September 21.");
  for (const miles of ["8.5", "5.5"]) {
    const title = miles === "8.5" ? "Summiting in Search of Manzanitas" : "Winter Ramble at Rancho";
    assert.equal(polishDescription(`${title} | Midpeninsula Regional Open Space District Skip to main content Show Mobile Menu Approximately ${miles} miles.`), `Approximately ${miles} miles.`);
  }
  const unrelated = "A landscape illustration of Skip to main content. This display has space and time as its theme. Details: https://example.org/Register-Registration-opens?text=raffles-prizes";
  assert.equal(polishDescription(unrelated), unrelated);
});

test("repairs academic-event grammar without changing names, affiliations or access", () => {
  const cases = [
    ["The Department of Surgery invited Dr. Herb Chen, Chair of the Department of Surgery at University of Alabama at Birmingham, will present this year's Armanini Lecture.",
      "The Department of Surgery invited Dr. Herb Chen, Chair of the Department of Surgery at University of Alabama at Birmingham, to present this year's Armanini Lecture."],
    ["The Stanford Department of African and African American Studies in collaboration with the African Connections Research and Education Fund, Inc. Present an Intimate Evening with Dr. Samuel Waymon.",
      "The Stanford Department of African and African American Studies, in collaboration with the African Connections Research and Education Fund, Inc., presents an Intimate Evening with Dr. Samuel Waymon."],
    ["This is a free class for Stanford students, faculty and staff who would like to learn all about bike gears as well as the opportunity to ask a seasoned bike mechanic any questions.",
      "This is a free class for Stanford students, faculty and staff who would like to learn all about bike gears and have the opportunity to ask a seasoned bike mechanic any questions."],
  ];
  for (const [source, expected] of cases) {
    assert.equal(polishDescription(source), expected);
    assert.equal(polishDescription(expected), expected);
  }
});

test("keeps supplied library dates and clock values when fixing prose range connectors", () => {
  const cases = [
    ["LEGOs will be supplied Join the building fun on three dates: Wednesday, August 26 Wednesday, September 30 Wednesday, October 28 This event is generously sponsored by the Friends of the Mountain View Library.",
      "LEGOs will be supplied. Join the building fun on three dates: Wednesday, August 26; Wednesday, September 30; Wednesday, October 28. This event is generously sponsored by the Friends of the Mountain View Library."],
    ["Drop in between 4:00 pm - 5:00 pm to decorate your own trick-or-treat bag. One bag per child.",
      "Drop in between 4:00 pm and 5:00 pm to decorate your own trick-or-treat bag. One bag per child."],
    ["Walk-ins starting between 3 p.m. to 4:30 p.m. are also welcome.",
      "Walk-ins starting between 3 p.m. and 4:30 p.m. are also welcome."],
    ["Participants will learn about propulsion and list then create their own rockets.",
      "Participants will learn about propulsion, then create their own rockets."],
  ];
  for (const [source, expected] of cases) {
    assert.equal(polishDescription(source), expected);
    assert.deepEqual(expected.match(/\d+/g), source.match(/\d+/g));
    assert.equal(polishDescription(expected), expected);
  }
});
