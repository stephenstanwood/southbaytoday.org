import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { polishCivicCopy, polishCivicModifiers, polishCivicTopic } from "./lib/civic-copy.mjs";

const scripts = dirname(fileURLToPath(import.meta.url));
const cities = ["campbell", "saratoga", "los-altos", "los-gatos", "san-jose", "mountain-view", "sunnyvale", "cupertino", "santa-clara", "milpitas", "palo-alto"];
const CAMPBELL_NOV_17_ID = "2d32a975-87ba-41aa-9897-6233cdfc7e72";
function run({ publishedDate = "2026-10-15", unavailable = false, runs = 1, campbellRecord = null, losGatosRecord = null,
  campbellPdEoc = false, santaClaraDate = null,
  keyTopics = ['Review of winter storm preparedness activities', 'Proposed stream corridor protection changes'],
  summary = "The agenda listed winter storm preparedness and proposed changes to stream corridor protection." } = {}) {
  const root = mkdtempSync(join(tmpdir(), "sbt-digest-source-"));
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "src/data/south-bay"), { recursive: true });
    copyFileSync(join(scripts, "generate-digests.mjs"), join(root, "scripts/generate-digests.mjs"));
    symlinkSync(join(scripts, "lib"), join(root, "scripts/lib"));
    const previous = Object.fromEntries(cities.map((city) => [city, {
      city, cityName: city, body: "City Council", meetingDateIso: "2026-10-26",
      title: `${city} previous digest`, summary: "Previously verified agenda", keyTopics: ["Original topic"],
      sourceUrl: "https://example.test/previous", generatedAt: "2026-10-27T01:00:00.000Z",
    }]));
    previous["palo-alto"] = { ...previous["palo-alto"], body: "Architectural Review Board", meetingDateIso: publishedDate };
    if (campbellPdEoc) Object.assign(previous.campbell, {
      meetingDateIso: "2026-11-02", carriedForward: true,
      carryForwardReason: "source-unverified", carriedForwardRuns: 3,
    });
    const output = join(root, "src/data/south-bay/digests.json");
    writeFileSync(output, JSON.stringify(previous));
    const capture = join(root, "prompts.json");
    const fixture = join(scripts, "fixtures/primegov");
    let fixtureNow = campbellRecord ? "2026-11-16T03:40:00Z" : "2026-10-29T03:40:00Z";
    if (campbellPdEoc || santaClaraDate || losGatosRecord) fixtureNow = "2026-11-25T04:40:00Z";
    writeFileSync(join(root, "source-mocks.mjs"), `
      import fs from 'node:fs';
      const RealDate = Date;
      const now = ${JSON.stringify(fixtureNow)};
      globalThis.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return new RealDate(now).getTime(); }
      };
      const fixture = ${JSON.stringify(fixture)};
      const prompts = [];
      globalThis.fetch = async (input, init) => {
        const url = new URL(String(input));
        if (url.hostname === 'www.stoa.works' && url.pathname === '/api/council-meetings') {
          const campbell = ${JSON.stringify(campbellRecord)};
          if (url.searchParams.get('city') === 'Campbell' && campbell) {
            return Response.json({records: [campbell]});
          }
          const losGatos = ${JSON.stringify(losGatosRecord)};
          if (url.searchParams.get('city') === 'Los Gatos' && losGatos) {
            return Response.json({records: [losGatos]});
          }
          const santaClaraDate = ${JSON.stringify(santaClaraDate)};
          if (url.searchParams.get('city') === 'Santa Clara' && santaClaraDate) {
            return Response.json({records: [{
              id: 131, city: 'Santa Clara', date: santaClaraDate, meetingType: 'City Council', source: 'ingest',
              title: 'ZOOM WEBINAR FOR THE PUBLIC, REGISTRATION',
              excerpt: 'The agenda explains how to register for the Zoom webinar. The Stevens Creek Corridor Steering Committee is scheduled to review current corridor activities.',
              keywords: ['corridor'],
            }]});
          }
          const records = url.searchParams.get('city') === 'Palo Alto' ? [{
            id: 215, city: 'Palo Alto', date: '2026-10-22', meetingType: 'City Council', source: 'ingest',
            title: 'Review Fiscal Year 2026 Actuals and 2027 Adopted – No Action Needed (10 min)',
            excerpt: 'Review Fiscal Year 2026 Actuals and 2027 Adopted – No Action Needed (10 min). Memorandum for Fiscal Year 2026 Actual Expenditures – Action Needed (10 min). Capital Update – No Action Needed (15 min)',
            keywords: ['budget'],
          }] : [];
          return Response.json({records});
        }
        if (url.hostname === 'pub-campbell.escribemeetings.com' && ${campbellPdEoc}) {
          const id = ${JSON.stringify(CAMPBELL_NOV_17_ID)};
          if (url.pathname.endsWith('/PastMeetings')) {
            const { type } = JSON.parse(init.body);
            const meetings = type === 'City Council Regular Session Meeting - PD EOC'
              ? [{ Id: id, Start: '/Date(' + Date.parse('2026-11-18T03:00:00Z') + ')/', HasAgenda: true }]
              : [];
            return Response.json({ d: { Meetings: meetings } });
          }
          if (url.searchParams.get('Id') === id) return new Response(
            '<div class="AgendaItemTitle"><a>Urgency Ordinance for Detention or Custodial Facilities</a></div>' +
            '<div class="AgendaItemTitle"><a>Community Center Pool Replacement Project Design Services</a></div>',
          );
        }
        if (url.hostname === 'webapi.legistar.com' && url.pathname === '/v1/santaclara/Events' && ${JSON.stringify(santaClaraDate)}) {
          return Response.json([{ EventBodyName: 'Stevens Creek Corridor Steering Committee' }]);
        }
        if (url.hostname === 'cityofpaloalto.primegov.com') {
          if (${unavailable}) return new Response('source unavailable', {status: 503});
          if (url.pathname.includes('ListArchivedMeetings')) return Response.json(JSON.parse(fs.readFileSync(fixture + '/archive-2026.json')));
          const id = url.searchParams.get('compiledMeetingDocumentFileId');
          if (id === '21874' || id === '21819') return new Response(fs.readFileSync(fixture + (id === '21874' ? '/council-oct26.html' : '/stormwater-oct22.html')));
        }
        if (url.hostname === 'api.anthropic.com') {
          prompts.push(JSON.parse(init.body)); fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify(prompts));
          return Response.json({ stop_reason: 'end_turn', content: [{type: 'text', text: JSON.stringify({
            summary: ${JSON.stringify(summary)},
            keyTopics: ${JSON.stringify(keyTopics)},
          })}] });
        }
        // Other cities retain their own published cards; no live I/O in this fixture.
        return new Response('unavailable in offline fixture', {status: 503});
      };
    `);
    let log = "";
    const requestCounts = [];
    for (let attempt = 0; attempt < runs; attempt++) {
    rmSync(capture, { force: true });
    log = execFileSync(process.execPath, ["--import", join(root, "source-mocks.mjs"), join(root, "scripts/generate-digests.mjs")], {
      cwd: root, encoding: "utf8", timeout: 30_000,
      env: { ...process.env, ANTHROPIC_API_KEY: "offline-fixture", SBT_NOTIFICATION_TEST_DIR: join(root, "notifications"), SBT_GENERATION_CACHE_DIR: join(root, "cache") },
      stdio: ["ignore", "pipe", "pipe"],
    });
    try { requestCounts.push(JSON.parse(readFileSync(capture)).length); } catch { requestCounts.push(0); }
    }
    const digests = JSON.parse(readFileSync(output));
    let prompts = [];
    try { prompts = JSON.parse(readFileSync(capture)); } catch {}
    return { previous, digests, prompts, log, requestCounts };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("the real digest generator recovers Council content from a fresh mislabeled committee record", () => {
  const { previous, digests, prompts, log } = run();
  const card = digests["palo-alto"];
  assert.equal(card.body, "City Council");
  assert.equal(card.meetingDateIso, "2026-10-26");
  assert.equal(card.sourceUrl, "https://cityofpaloalto.primegov.com/Portal/Meeting?compiledMeetingDocumentFileId=21874");
  assert.equal(card.carriedForward, undefined);
  assert.equal(prompts.length, 1);
  assert.match(JSON.stringify(prompts), /Winter Storm Preparedness/);
  assert.match(JSON.stringify(prompts), /Chapter 18\.20/);
  assert.doesNotMatch(JSON.stringify(prompts), /Review Fiscal Year 2026 Actuals/);
  assert.match(log, /recovered verified City Council agenda \(2026-10-26\) from PrimeGov/);
  for (const city of cities.filter((city) => city !== "palo-alto")) {
    assert.equal(digests[city].summary, previous[city].summary);
    assert.equal(digests[city].generatedAt, previous[city].generatedAt);
  }
});

test("a rerun recovers before the published-date guard instead of becoming stuck again", () => {
  const { digests, prompts } = run({ publishedDate: "2026-10-26" });
  assert.equal(digests["palo-alto"].meetingDateIso, "2026-10-26");
  assert.equal(digests["palo-alto"].body, "City Council");
  assert.equal(digests["palo-alto"].carriedForward, undefined);
  assert.equal(prompts.length, 1);
});

test("the Campbell transcript keeps the verified agenda link for its record and meeting date", () => {
  const record = {
    id: 7378, city: "Campbell", date: "2026-11-02", meetingType: "City Council", source: "ingest",
    title: "Campbell City Council",
    excerpt: "Public hearing on the Campbell Technology Park project and an agreement for police recruitment advertising.",
    fullAgendaText: "The Council considered the Campbell Technology Park project and the All Star Talent agreement.",
    keywords: ["Campbell Technology Park", "All Star Talent"],
  };
  const { digests } = run({ campbellRecord: record });
  assert.equal(digests.campbell.meetingDateIso, record.date);
  assert.equal(digests.campbell.sourceUrl, "https://pub-campbell.escribemeetings.com/Meeting.aspx?Id=dc3aba52-7cf5-4d1a-b3d6-d8a3315e9ee0&Agenda=Agenda&lang=English");

  for (const unrelated of [{ ...record, id: 7380 }, { ...record, date: "2026-11-03" }]) {
    assert.equal(run({ campbellRecord: unrelated }).digests.campbell.sourceUrl, "https://pub-campbell.escribemeetings.com/");
  }
});

test("the Los Gatos digest cites the exact agenda for its verified regular meeting record", () => {
  const record = {
    id: 7412, city: "Los Gatos", date: "2026-11-17", meetingType: "City Council", source: "ingest",
    title: "Approve the Minutes of the October 28, 2026, Closed Session Town Council Meeting.",
    excerpt: "Adopt an ordinance on objective design standards and consider adding a full-time Senior Planner to the fiscal year budget.",
    keywords: ["objective design standards", "Senior Planner"],
  };
  const card = run({ losGatosRecord: record }).digests["los-gatos"];
  assert.equal(card.meetingDateIso, record.date);
  assert.equal(card.sourceUrl, "https://mccmeetings.blob.core.usgovcloudapi.net/losgatos-pubu/MEET-Agenda-0a1f648faf904226ba2223be87ebbdb8.pdf");

  const unrelated = run({ losGatosRecord: { ...record, id: 7413 } }).digests["los-gatos"];
  assert.equal(unrelated.sourceUrl, "https://losgatos-ca.municodemeetings.com/");
});

test("Campbell recovers the November 17 council agenda from the PD EOC meeting type", () => {
  const { digests, prompts } = run({
    campbellPdEoc: true,
    campbellRecord: {
      id: 7451, city: "Campbell", date: "2026-11-17", meetingType: "City Council", source: "ingest",
      title: "These are the minutes of the regular council meeting of November 2, 2026",
      excerpt: "These are the minutes of the regular council meeting of November 2, 2026. Unattributed transcript preview.",
      keywords: ["minutes"],
    },
    summary: "The agenda listed a proposed detention-facility moratorium and design services for the community pool.",
    keyTopics: ["Proposed detention-facility moratorium", "Design services for the community pool"],
  });
  const card = digests.campbell;
  assert.equal(card.meetingDateIso, "2026-11-17");
  assert.equal(card.body, "City Council");
  assert.equal(
    card.sourceUrl,
    `https://pub-campbell.escribemeetings.com/Meeting.aspx?Id=${CAMPBELL_NOV_17_ID}&Agenda=Agenda&lang=English`,
  );
  assert.equal(card.carriedForward, undefined);
  assert.equal(card.carryForwardReason, undefined);
  assert.equal(card.carriedForwardRuns, undefined);
  const prompt = prompts.find(call => call.messages[0].content.includes("Campbell, CA City Council"));
  assert.ok(prompt, "Campbell agenda was sent to the summarizer");
  assert.match(prompt.messages[0].content, /Agenda highlights: Urgency Ordinance for Detention or Custodial Facilities/);
  assert.match(prompt.messages[0].content, /Community Center Pool Replacement Project/);
  assert.doesNotMatch(prompt.messages[0].content, /Unattributed transcript preview/);
});

test("Santa Clara regeneration preserves the November 23 venue and remote option from the verified agenda", () => {
  const { digests, log } = run({
    santaClaraDate: "2026-11-23",
    summary: "The agenda lists a Stevens Creek Corridor Steering Committee meeting dated November 23, 2026, held over a Zoom webinar.",
    runs: 2,
  });
  const card = digests["santa-clara"];
  assert.equal(card.meetingDateIso, "2026-11-23");
  assert.equal(card.body, "Stevens Creek Corridor Steering Committee");
  assert.equal(card.carriedForward, undefined);
  assert.match(card.summary, /Council Chambers at San José City Hall \(200 E Santa Clara St\.\)/);
  assert.match(card.summary, /Zoom webinar for remote participation with advance registration/);
  assert.doesNotMatch(card.summary, /held over a Zoom webinar/);
  assert.equal(new URL(card.sourceUrl).searchParams.get("ID"), "1462004");
  assert.match(log, /digest-cache.+santa-clara.+reused result/);

  const summary = "The agenda listed updates to the committee's corridor study.";
  const later = run({ santaClaraDate: "2026-11-24", summary }).digests["santa-clara"];
  assert.equal(later.meetingDateIso, "2026-11-24");
  assert.equal(later.summary, summary);
});

test("unavailable sources and older recovered agendas preserve the published digest", () => {
  for (const args of [{ unavailable: true }, { publishedDate: "2026-10-27" }]) {
    const { previous, digests, prompts } = run(args);
    const card = digests["palo-alto"];
    for (const key of ["meetingDateIso", "body", "summary", "generatedAt", "sourceUrl"]) {
      assert.equal(card[key], previous["palo-alto"][key]);
    }
    assert.equal(card.carriedForward, true);
    assert.equal(prompts.length, 0);
  }
});


test("the real digest rerun verifies sources but avoids a second unchanged-input API call", () => {
  const { digests, requestCounts, log } = run({ runs: 2 });
  assert.deepEqual(requestCounts, [1, 0]);
  assert.equal(digests["palo-alto"].body, "City Council");
  assert.match(log, /trying PrimeGov.*got 2026-10-26/);
  assert.match(log, /unchanged verified source\/prompt\/model; reused result/);
});

test("civic generation preserves the complete reviewed area summary and its facts", () => {
  const before = "The October 26 Planning Commission study session agenda listed a proposal at 536 Hawthorn Avenue to demolish a 1,360 square foot duplex on a 0.29-acre R-3 lot and build three townhome-style condominiums in one two-story building. It also listed a tentative parcel map to split the lot into three.";
  const after = "The October 26 Planning Commission study session agenda listed a proposal at 536 Hawthorn Avenue to demolish a 1,360-square-foot duplex on a 0.29-acre R-3 lot and build three townhome-style condominiums in one two-story building. It also listed a tentative parcel map to split the lot into three.";
  const { digests } = run({ summary: before });
  assert.equal(digests["palo-alto"].summary, after);
  assert.deepEqual(after.match(/\d+(?:[,.]\d+)*/g), before.match(/\d+(?:[,.]\d+)*/g));
  assert.equal(polishCivicCopy(after), after);

  const replacement = "A revised proposal lists a 2,450.5 square foot duplex at 900 New Avenue. Staff requested a continuance to December 14, 2026. See https://example.org/proposal/2450.";
  assert.equal(polishCivicCopy(replacement), replacement.replace("2,450.5 square foot duplex", "2,450.5-square-foot duplex"));
});

test("civic area copy preserves measurements, prices, existing hyphens, and non-text values", () => {
  for (const value of [
    "The building measures 1,360 square feet and costs $300 per square foot.",
    "Allow 1 square foot per resident and measure 1 square foot of floor space.",
    "The 1,360-square-foot duplex is listed for review.",
    null, undefined, 1360,
  ]) assert.equal(polishCivicCopy(value), value);
  assert.equal(polishCivicCopy("The November 3, 2026 meeting listed a 900 square foot building."),
    "The November 3, 2026, meeting listed a 900-square-foot building.");
});

test("Campbell civic copy restores sourced transportation measures without renaming the project", () => {
  const before = "Campbell Technology Park adds 1,368 trips. The only required mitigation is a mid-block crosswalk and an upgraded crossing on Campbell Technology Park and McGlinchey Lane.";
  const after = "Campbell Technology Park adds 1,368 trips. Required transportation measures include a mid-block crosswalk on Campbell Technology Parkway and another at East McGlincy Lane.";
  const headline = "Campbell Technology Park homes: traffic fixes limited to crosswalks, no vehicle mitigation";
  const correctedHeadline = "Campbell Technology Park housing plan includes pedestrian crossing upgrades";
  assert.equal(polishCivicCopy(before, { cityId: "campbell" }), after);
  assert.equal(polishCivicCopy(after, { cityId: "campbell" }), after);
  assert.equal(polishCivicModifiers(headline, { cityId: "campbell" }), correctedHeadline);
  assert.equal(polishCivicModifiers(correctedHeadline, { cityId: "campbell" }), correctedHeadline);
  assert.deepEqual(after.match(/\d[\d,]*/g), before.match(/\d[\d,]*/g));
  for (const cityId of [undefined, "san-jose"]) {
    assert.equal(polishCivicCopy(before, { cityId }), before);
    assert.equal(polishCivicModifiers(headline, { cityId }), headline);
  }
  assert.equal(polishCivicCopy("Campbell Technology Park and McGlinchey Lane residents discussed 14 homes.", { cityId: "sunnyvale" }),
    "Campbell Technology Park and McGlinchey Lane residents discussed 14 homes.");
  assert.equal(polishCivicCopy("Campbell Technology Park and nearby streets.", { cityId: "campbell" }),
    "Campbell Technology Park and nearby streets.");
});

test("refreshed Campbell digest keeps the reviewed transcript and fence wording", () => {
  const summary = "The source for the November 2, 2026, Campbell City Council meeting is a video transcript, so this describes what the transcript shows was before the Council. The agenda centered on a 290-home housing development.";
  const topic = "The proposal would increase fence/wall height to 8 ft along Highway 17. Staff described it as a 'builder's remedy' project.";
  const reviewedSummary = "A video transcript shows what was before the Campbell City Council at its November 2, 2026, meeting. The agenda centered on a 290-home housing development.";
  const reviewedTopic = "The proposal would increase fence and wall height to 8 ft along Highway 17. Staff described it as a \"builder's remedy\" project.";
  assert.equal(polishCivicCopy(summary), reviewedSummary);
  assert.equal(polishCivicTopic(topic), reviewedTopic);
  assert.equal(polishCivicCopy(reviewedSummary), reviewedSummary);
  assert.equal(polishCivicTopic(reviewedTopic), reviewedTopic);
});

test("refreshed council summaries keep their reviewed agenda wording", () => {
  const examples = [
    [
      "The agenda for the November 17, 2026, Campbell City Council meeting listed several resolutions honoring longtime city staff, including the retirement of Chief Gary Berg after more than 32 years.",
      "The agenda for the November 17, 2026, Campbell City Council meeting listed several resolutions honoring longtime city staff, including one recognizing Chief Gary Berg's retirement after more than 32 years.",
    ],
    [
      "The agenda included a contract for designing a replacement of the Community Center pool.",
      "The agenda included a contract to design a replacement for the Community Center pool.",
    ],
    [
      "The agenda listed an urgency ordinance to set a temporary moratorium on approving applications for, and the establishment or operation of, detention or custodial detention facilities and custodial processing facilities.",
      "The agenda listed an urgency ordinance for a temporary moratorium on approving applications for detention facilities, custodial detention facilities, or custodial processing facilities. The moratorium would also cover establishing or operating those facilities.",
    ],
    [
      "The agenda listed a $417,400 contract with ELECCO of Milpitas to replace the Police Department's backup generator, with up to 15% for construction contingency.",
      "The agenda listed a $417,400 contract with ELECCO of Milpitas to replace the Police Department's backup generator, with a construction contingency of up to 15%.",
    ],
    [
      "Also listed were several council-sponsored community events seeking approval to spend city funds and accept donations, and a proposal to establish the La Avenida Cultural District.",
      "The agenda also listed a proposal to establish the La Avenida Cultural District and requests to spend city funds and accept donations for several council-sponsored community events.",
    ],
    [
      "The November 18 Planning Commission agenda listed a public hearing on a recommendation for a General Plan amendment and rezone at 400 Saratoga Avenue.",
      "The November 18 Planning Commission agenda listed a public hearing on whether to recommend amending the General Plan and rezoning 400 Saratoga Avenue.",
    ],
    [
      "The proposal would build a five-story, 316-unit apartment building, reconfigure the existing nine-hole golf course, and dedicate land for a public park.",
      "The proposal calls for constructing a five-story, 316-unit apartment building, reconfiguring the existing nine-hole golf course, and dedicating land for a public park.",
    ],
    [
      "It also listed updates to Council Policy 030, on adding an item to the agenda, which had been deferred from June 1.",
      "It also listed updates to Council Policy 030, which governs how items are added to the agenda. Consideration of those updates had been deferred from June 1.",
    ],
    [
      "The project is a 590-unit residential and 15,000-square-foot commercial mixed-use project at 2610 El Camino Real.",
      "The project is a mixed-use project at 2610 El Camino Real with 590 residential units and 15,000 square feet of commercial space.",
    ],
    [
      "The agenda listed authorizing a Request for Proposals and a local funding contribution for an affordable housing development at 340 Portage Avenue (Matadero Creek).",
      "The agenda listed a proposal to authorize a request for proposals and a local funding contribution for an affordable housing development at 340 Portage Avenue (Matadero Creek).",
    ],
  ];
  for (const [before, after] of examples) {
    assert.equal(polishCivicCopy(before), after);
    assert.equal(polishCivicCopy(after), after);
  }
  const proposal = "The agenda listed a proposal to establish the La Avenida Cultural District, brought by Councilmembers Ortiz, Mahan, Campos, Tordillos, and Candelas.";
  const reviewed = "The agenda listed a proposal to establish the La Avenida Cultural District, brought by Mayor Mahan and Councilmembers Ortiz, Campos, Tordillos, and Candelas.";
  assert.equal(polishCivicTopic(proposal, { cityId: "san-jose" }), reviewed);
  assert.equal(polishCivicTopic(reviewed, { cityId: "san-jose" }), reviewed);
});

test("civic modifiers keep numbers, identifiers, headline dates, and standalone terms exact", () => {
  const copy = "The fee for below market rate in-lieu fees would become a square footage-based fee. A City Council sponsored special event costs $25. See https://example.org/below-market-rate or email fee@example.org.";
  const reviewed = copy.replace("below market rate", "below-market-rate")
    .replace("square footage-based", "square-footage-based").replace("City Council sponsored", "City Council-sponsored");
  assert.equal(polishCivicCopy(copy), reviewed);
  assert.equal(polishCivicCopy(reviewed), reviewed);
  assert.deepEqual(reviewed.match(/\d+/g), copy.match(/\d+/g));
  const headline = "November 4, 2026 agenda: below market rate in-lieu fee changes";
  assert.equal(polishCivicModifiers(headline), headline.replace("below market rate", "below-market-rate"));
  for (const value of ["Fees remain below market rate.", "Measure the square footage.", null]) {
    assert.equal(polishCivicModifiers(value), value);
  }
});

test("Los Gatos digest restores the official name of the 2026 curb maintenance project", () => {
  const topic = "The agenda listed a request to authorize a Certificate of Acceptance and Notice of Completion for the 2026 Annual Curb project.";
  const corrected = polishCivicTopic(topic, { cityId: "los-gatos" });
  assert.match(corrected, /the 2026 Annual Curb, Gutter, and Sidewalk Maintenance Project\.$/);
  assert.equal(polishCivicTopic(corrected, { cityId: "los-gatos" }), corrected);
  assert.equal(polishCivicTopic(topic, { cityId: "campbell" }), topic);
});

test("Los Gatos digest keeps the adoption and separate authorizations clear", () => {
  const options = { cityId: "los-gatos" };
  const examples = [
    [
      "The agenda listed an ordinance amending Chapter 29 (Zoning Regulations) of the Town Code for adoption.",
      "The agenda listed adoption of an ordinance amending Chapter 29 (Zoning Regulations) of the Town Code.",
    ],
    [
      "The agenda listed authorizing a Certificate of Acceptance and Notice of Completion for the 2026 Annual Curb project, and the Town Manager's authority to execute a certificate of acceptance and notice of completion for another project.",
      "The agenda listed a request to authorize a Certificate of Acceptance and Notice of Completion for the 2026 Annual Curb, Gutter, and Sidewalk Maintenance Project. It also listed a request to authorize the Town Manager to execute a certificate of acceptance and notice of completion for another project.",
    ],
  ];
  for (const [before, after] of examples) {
    assert.equal(polishCivicTopic(before, options), after);
    assert.equal(polishCivicTopic(after, options), after);
    assert.equal(polishCivicTopic(before, { cityId: "another-city" }), before);
  }
});

test("San José's holiday book drive keeps the district in the published agenda", () => {
  const shortTopic = "A proclamation and council-sponsored special event for the Holiday Children Book Drive in Council District 11 (Kamei).";
  const eventApprovals = "Council District 6 (Mulcahy) had an item seeking retroactive approval and approval of various council-sponsored events, and District 11 (Kamei) had an item seeking approval of a proclamation and a Holiday Children Book Drive event";
  const publishedTopic = "The agenda listed approval of a Holiday Children Book Drive proclamation and event sponsored by Council District 1 (Kamei)";
  const retroactiveApprovals = "Council District 9 (Foley) and District 7 (Doan) each had an item seeking retroactive approval of a Senior Symposium and a bus visit to the Vietnam Traveling Memorial Wall, respectively, as council-sponsored events using city funds and donated materials and services";
  for (const [topic, reviewed] of [
    [shortTopic, shortTopic.replace("District 11", "District 1")],
    [eventApprovals, "Council District 6 (Mulcahy) sought approval for several council-sponsored events, including retroactive approval for some. District 1 (Kamei) sought approval for the Holiday Children Book Drive and its proclamation."],
    [`${publishedTopic}, plus retroactive approval and approval of various events sponsored by Council District 6 (Mulcahy).`,
      `${publishedTopic}. It also listed several events sponsored by Council District 6 (Mulcahy) for approval, some retroactively.`],
    [retroactiveApprovals, `${retroactiveApprovals}.`],
  ]) {
    const corrected = polishCivicTopic(topic, { cityId: "san-jose" });
    assert.equal(corrected, reviewed);
    assert.equal(polishCivicTopic(corrected, { cityId: "san-jose" }), corrected);
    assert.equal(polishCivicTopic(topic, { cityId: "another-city" }), topic);
  }
});

test("San José's November 18 agenda review names the council date under review", () => {
  const options = { cityId: "san-jose" };
  const clarified = "The agenda listed the committee's review of the November 24, 2026, City Council agenda as canceled.";
  const summary = "The committee listed several proposals. The November 24, 2026, final agenda review was marked canceled.";
  assert.equal(polishCivicCopy(summary, options), `The committee listed several proposals. ${clarified}`);
  assert.equal(polishCivicTopic("The agenda marked the November 24, 2026, final agenda review as canceled.", options), clarified);
  assert.equal(polishCivicCopy("It listed the November 24, 2026, final agenda as cancelled and the December 1, 2026, draft agenda for review.", options),
    clarified + " It also listed the December 1, 2026, draft agenda for review.");
  assert.match(polishCivicTopic("The November 24, 2026, final agenda was listed as cancelled; the December 1 draft was listed for review.", options),
    /the committee's review of the November 24, 2026, City Council agenda as canceled/);
  assert.equal(polishCivicTopic(clarified, options), clarified);

  const refreshedSummary = "The committee listed several proposals. It listed the November 24, 2026, final agenda as cancelled and the December 1, 2026, draft agenda for review.";
  const refreshedTopic = "The November 24, 2026, final agenda was listed as cancelled; the December 1, 2026, draft agenda was listed for review, including adding new items and setting 'time certain' slots for specific items.";
  const expectedSummary = `The committee listed several proposals. ${clarified} It also listed the December 1, 2026, draft agenda for review.`;
  const expectedTopic = clarified + " It also listed the December 1, 2026, draft agenda for review, including adding new items and scheduling specific items at set times.";
  assert.equal(polishCivicCopy(refreshedSummary, options), expectedSummary);
  assert.equal(polishCivicTopic(refreshedTopic, options), expectedTopic);
  assert.equal(polishCivicTopic(expectedTopic, options), expectedTopic);
  assert.equal(polishCivicCopy(refreshedSummary, { cityId: "another-city" }), refreshedSummary);
});

test("refreshed planning copy identifies what the preschool hearing covered and gives the apartment count once", () => {
  const summary = "A hearing continued from November 9 was listed on the November 23 Planning Commission agenda for a 16,000-square-foot, two-story childcare and preschool at 855 E. Homestead Road It would replace a vacant commercial building, and the plan includes a new eight-foot masonry wall along the western property line and part of the southern property line.";
  const reviewed = "The November 23 Planning Commission agenda listed a hearing, continued from November 9, on a proposed 16,000-square-foot, two-story childcare and preschool facility at 855 E. Homestead Road. It would replace a vacant commercial building, and the plan includes a new eight-foot masonry wall along the western property line and part of the southern property line.";
  const headline = "Planning Commission agenda: 316-unit apartments at 400 Saratoga Avenue golf course";
  assert.equal(polishCivicCopy(summary, { cityId: "sunnyvale" }), reviewed);
  assert.equal(polishCivicCopy(reviewed, { cityId: "sunnyvale" }), reviewed);
  assert.equal(polishCivicModifiers(headline, { cityId: "santa-clara" }),
    "Planning Commission agenda: 316 apartments at 400 Saratoga Avenue golf course");
  assert.equal(polishCivicModifiers("400 Saratoga Avenue: 316-unit apartment building"),
    "400 Saratoga Avenue: 316-unit apartment building");
});

test("refreshed Golden Oak Court copy identifies the site being divided", () => {
  const options = { cityId: "sunnyvale" };
  assert.equal(polishCivicModifiers("Nine townhomes proposed on Golden Oak Court single-family lot", options),
    "Nine townhomes proposed for a single-family lot on Golden Oak Court");
  const summary = "The 0.35-acre site is zoned medium density residential (R-3), and the project would be subdivided into three lots including a common lot.";
  const reviewed = "The 0.35-acre site is zoned medium-density residential (R-3). The proposal would divide the site into three lots, including a common lot.";
  assert.equal(polishCivicCopy(summary, options), reviewed);
  assert.equal(polishCivicCopy(reviewed, options), reviewed);
});

test("the real digest generator finishes sentence topics but preserves fragments and identifiers", () => {
  const keyTopics = [
    "The agenda listed a proposed agreement not to exceed $165,000 for fiscal year 2026-27",
    "The Consent Calendar included the 2026 Annual Code Update",
    "A revised Citywide Records Retention Schedule was listed for adoption by resolution on the Consent Calendar",
    "The Consent Calendar also listed the Treasurer's Report for the month ended September 30, 2026",
    "Review of the November 10, 2026, final City Council agenda",
    "The agenda listed details at https://example.org/agenda/2026",
  ];
  const { digests } = run({ keyTopics });
  assert.deepEqual(digests["palo-alto"].keyTopics, keyTopics.map((topic, i) => i < 4 ? topic + "." : topic));
  for (const topic of keyTopics) {
    const next = polishCivicTopic(topic);
    assert.equal(polishCivicTopic(next), next);
    assert.deepEqual(next.match(/\d+/g), topic.match(/\d+/g));
  }
  for (const value of ["The agenda listed a request to email fee@example.org", "The agenda listed a public hearing.", "The agenda listed:", null]) {
    assert.equal(polishCivicTopic(value), value);
  }
});
