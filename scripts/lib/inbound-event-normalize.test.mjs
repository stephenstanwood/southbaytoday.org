import assert from "node:assert/strict";
import test from "node:test";
import { fetchInboundEvents, inferCategory } from "../generate-events.mjs";
import { fuzzyDedupEvents } from "../../src/lib/south-bay/eventFuzzyDedup.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { VIRTUAL_TITLE_SIGNALS } from "../social/lib/content-rules.mjs";

test("Stanford's soccer ticket pages supply real starts and Cagan Stadium before backfill", () => {
  for (const [date, slug, title, time] of [
    ["2026-11-01", "womens-soccer-vs-notre-dame-aqbvne", "Stanford Women's Soccer Home Finale vs. Notre Dame", "1:00 PM"],
    ["2026-10-29", "womens-soccer-vs-nc-state-fgrxdx", "Stanford Women's Soccer vs. NC State", "7:00 PM"],
  ]) {
    const raw = {
      id: slug, cityKey: "palo-alto", title, location: "The Farm, Stanford University",
      startsAt: `${date}T00:00:00-07:00`, endsAt: null,
      sourceUrl: `https://tickets.gostanford.com/events/${slug}`,
      description: "The start time is not given in the email.",
    };
    const [event] = fetchInboundEvents({ today: "2026-10-23", events: [raw] });
    assert.equal(event.time, time);
    assert.equal(event.venue, "Cagan Stadium");
    const published = applyVerifiedEventFacts(event);
    assert.equal(published.address, "641 Nelson Road, Stanford, CA 94305");
    assert.equal(published.cost, "paid");
    assert.equal(published.photoRef, null);
    assert.equal(normalizeInboundEventPresentation({ ...raw, startsAt: raw.startsAt.replace("2026-", "2027-") }).time, null);
  }
});

import {
  inboundClock,
  JEREMY_FREY_EXHIBITION_URL,
  PAPAHUGS_OCCURRENCE_URL,
  SJ_GIANTS_JAPANESE_HERITAGE_2026_07_26_URL,
  SILICON_VALLEY_PRIDE_2026_URL,
  normalizeInboundEventPresentation,
} from "./inbound-event-normalize.mjs";

test("Lakewood's original city advisory restores its public URL without changing the opening schedule", () => {
  const raw = {
    title: "Lakewood Branch Library Grand Opening", cityKey: "sunnyvale",
    startsAt: "2026-10-31T10:00:00-07:00", endsAt: "2026-10-31T17:00:00-07:00",
    location: "Lakewood Branch Library and Learning Center, 760 Lakechime Drive, Sunnyvale, CA 94089",
    sourceUrl: null,
  };
  const result = normalizeInboundEventPresentation(raw);
  assert.equal(result.url, "https://content.govdelivery.com/accounts/CASUNNYVALE/bulletins/42ffcdb");
  assert.equal(result.time, "10:00 AM");
  assert.equal(result.endTime, "5:00 PM");
  assert.equal(normalizeInboundEventPresentation({ ...raw, startsAt: "2026-11-01T10:00:00-08:00" }).url, "");
  assert.equal(raw.sourceUrl, null);
});

test("a stale Willis newsletter date resolves before the past-date gate", () => {
  const raw = {
    id: "stale-willis-newsletter", cityKey: "palo-alto",
    title: "Jontavious Willis Live at The Studio", location: "The Studio, Stanford, CA",
    startsAt: "2026-10-21T19:00:00-07:00", endsAt: null,
    sourceUrl: "https://live.stanford.edu/events/26-27season/studio/jontavious-willis/",
    description: "West Georgia bluesman Jontavious Willis performs live.",
  };
  const [event] = fetchInboundEvents({ today: "2026-10-22", events: [raw] }).map(applyVerifiedEventFacts);
  assert.ok(event);
  assert.equal(event.date, "2026-10-23");
  assert.equal(event.displayDate, "Fri, Oct 23");
  assert.equal(event.time, "7:00 PM");
  assert.equal(event.category, "music");
  assert.deepEqual(applyVerifiedEventFacts(event), event);
  for (const other of [
    { ...raw, startsAt: "2027-10-21T19:00:00-07:00" },
    { ...raw, sourceUrl: "https://live.stanford.edu/events/another-performance/" },
  ]) assert.equal(normalizeInboundEventPresentation(other).date, undefined);
});

test("Saratoga's newsletter puppet show resolves to the official Monday occurrence before deduplication", () => {
  const raw = {
    id: "different-newsletter-id", cityKey: "saratoga",
    title: "Fratello Marionettes Present Spooktacular", location: "Saratoga Library",
    startsAt: "2026-10-17T11:00:00-07:00", endsAt: null,
    description: "A free Halloween-themed marionette puppet show for families at Saratoga Library.",
    sourceUrl: "https://sccl.bibliocommons.com/v2/events?q=halloween&locations=SA",
  };
  const [event] = fetchInboundEvents({ today: "2026-10-17", events: [raw] }).map(applyVerifiedEventFacts);
  assert.equal(event.title, "Fratello Marionettes: Spooktacular");
  assert.equal(event.date, "2026-10-19");
  assert.equal(event.displayDate, "Mon, Oct 19");
  assert.equal(event.time, "4:00 PM");
  assert.equal(event.endTime, "4:30 PM");
  assert.equal(event.cost, "free");
  assert.equal(event.kidFriendly, true);
  assert.equal(event.url, "https://sccl.bibliocommons.com/events/6abc4d747c8c150075767bd5");
  assert.deepEqual(applyVerifiedEventFacts(event), event);
  const official = {
    ...event, id: "sccl-6abc4d747c8c150075767bd5", source: "Santa Clara County Library",
    description: "Fratello Marionettes Halloween variety show is family-friendly fun for all ages. The show features happy ghosts, Frankenstein, the Purple People Eater, a not-so-scary spider and more.",
  };
  const { kept } = fuzzyDedupEvents([event, official]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, official.id);
  for (const other of [
    { ...raw, startsAt: "2027-10-17T11:00:00-07:00" },
    { ...raw, location: "Los Gatos Library" },
    { ...raw, title: "A different puppet show" },
  ]) assert.equal(normalizeInboundEventPresentation(other).date, undefined);
});

test("Saratoga's donation drive retains its exact city-newsletter source", () => {
  const raw = {
    id: "donation-fixture", cityKey: "saratoga",
    title: "Friends of the Saratoga Libraries Book Donation Event", location: "Saratoga Library",
    startsAt: "2026-10-17T10:00:00-07:00", endsAt: "2026-10-17T16:00:00-07:00",
    sourceUrl: null,
  };
  const [event] = fetchInboundEvents({ today: "2026-10-17", events: [raw] });
  assert.equal(event.url, "https://saratoga.ca.us/CivicSend/ViewMessage/message/303691");
  assert.equal(event.time, "10:00 AM");
  assert.equal(event.endTime, "4:00 PM");
  assert.equal(normalizeInboundEventPresentation({ ...raw, startsAt: "2027-10-17T10:00:00-07:00" }).url, "");
});

test("Bike to the Bay stays family-friendly when a later newsletter changes its source ID or link", () => {
  for (const [id, location, sourceUrl] of [
    ["oct9-newsletter", "70 W Hedding St to Alviso Marina County Park, San Jose, CA", "https://go.sparkpostmail.com/f/a/newsletter-tracking-link"],
    ["oct14-newsletter", "70 West Hedding, San Jose, CA to Alviso Marina County Park", "https://www.eventbrite.com/e/day-on-the-bay-community-bike-ride-tickets-1998974412278?aff=oddtdtcreator"],
  ]) {
    const raw = {
      id, location, sourceUrl, cityKey: "san-jose", title: "Bike to the Bay Ride",
      startsAt: "2026-10-17T09:00:00-07:00", endsAt: null,
      description: "A group bike ride to Alviso Marina County Park ahead of Day on the Bay.",
    };
    const [event] = fetchInboundEvents({ today: "2026-10-17", events: [raw] });
    assert.equal(event.kidFriendly, true);
    assert.equal(event.url, "https://d3.santaclaracounty.gov/dayonthebay2026");
    assert.equal(event.date, "2026-10-17");
    assert.equal(event.time, "9:00 AM");
    assert.equal(event.endTime, null);
    assert.equal(event.cost, null);
    assert.deepEqual(applyVerifiedEventFacts(event), event);
    assert.equal(normalizeInboundEventPresentation({ ...raw, startsAt: "2027-10-17T09:00:00-07:00" }).kidFriendly, undefined);
  }
});

test("newsletter date labels preserve calendar dates across stale daylight-saving offsets", () => {
  for (const [startsAt, date, label, time] of [
    ["2026-11-19T00:00:00-07:00", "2026-11-19", "Thu, Nov 19", null],
    ["2026-11-19T00:00:00-08:00", "2026-11-19", "Thu, Nov 19", null],
    ["2026-10-15T00:00:00-07:00", "2026-10-15", "Thu, Oct 15", null],
    ["2026-11-19T19:30:00-08:00", "2026-11-19", "Thu, Nov 19", "7:30 PM"],
  ]) {
    const [event] = fetchInboundEvents({ today: "2026-10-15", events: [{
      id: "calendar-date-fixture", cityKey: "los-gatos", title: "Local history talk",
      startsAt, location: "Local museum, Los Gatos", sourceUrl: "https://example.org/talk",
    }] });
    assert.equal(event.date, date);
    assert.equal(event.displayDate, label);
    assert.equal(event.time, time);
  }
});

test("newsletter college-admissions Zoom presentations retain their online-only flag", () => {
  const raw = {
    id: "college-admissions-online", cityKey: "santa-clara", title: "Successfully Navigating College Admissions (Online)",
    startsAt: "2026-10-21T16:30:00-07:00", endsAt: "2026-10-21T17:30:00-07:00", location: null,
    description: "A free Zoom presentation by Stand Out For College for families of high school students.",
    sourceUrl: "https://www.santaclaraca.gov/Home/Components/Calendar/Event/113977/",
  };
  assert.equal(normalizeInboundEventPresentation(raw).virtual, true);
  assert.equal(VIRTUAL_TITLE_SIGNALS.some((pattern) => pattern.test(raw.title)), true);
  assert.equal(fetchInboundEvents({ today: "2026-10-14", events: [raw] })[0].virtual, true);
  assert.equal(normalizeInboundEventPresentation({ ...raw, title: "Staying Safe Online", description: "Learn online safety in person at the library." }).virtual, undefined);
});

test("newsletter Halloween festivals and housing help do not become sports or outdoor events", () => {
  assert.equal(inferCategory("Monster Bash Halloween Festival", "Family-friendly Halloween festival with carnival games and inflatable slides.", "", "Rengstorff Park"), "family");
  for (const description of [
    "A family-friendly, eco-conscious Halloween celebration included with general admission featuring a costume parade, critter shows, crafts, games and animal enrichment.",
    "A family-friendly Halloween celebration featuring shows, costume parades, crafts, games, and animal encounters, included with general admission.",
  ]) {
    const [event] = fetchInboundEvents({ today: "2026-10-21", events: [{
      id: "green-halloween", cityKey: "san-jose", title: "Green Halloween at Happy Hollow",
      startsAt: "2026-10-31T11:00:00-07:00", endsAt: "2026-10-31T14:00:00-07:00",
      location: "Happy Hollow Park & Zoo, 1300 Senter Road, San Jose, CA 95112",
      sourceUrl: "https://happyhollow.org/green-halloween/", description,
    }] });
    assert.equal(event.category, "family");
    assert.equal(event.time, "11:00 AM");
    assert.equal(event.kidFriendly, true);
  }
  assert.equal(inferCategory("Halloween Hockey Game", "A family-friendly celebration with crafts and games.", "", "Ice rink"), "sports");
  assert.equal(inferCategory("Halloween: Sharks vs Penguins", "A family-friendly celebration with crafts and games.", "", "SAP Center"), "sports");
  assert.equal(inferCategory("JTown Skate Day and Halloween in Japantown", "A family-friendly Halloween celebration with crafts and the opening of Judi Oyama's art exhibition at JAMsj.", "", "San Jose Japantown"), "arts");
  assert.equal(inferCategory("Paulson Park I Housing Application Help Session", "Help completing a senior housing waitlist application.", "", "Rent Stabilization Division Office"), "community");
  assert.equal(inferCategory("Sharks vs Penguins", "Military appreciation game.", "", "SAP Center"), "sports");
});

test("a Halloween celebration for the whole family is not classified by its carnival games", () => {
  const description = "Mountain View's annual Halloween celebration featuring a Treat Trail, carnival games, live entertainment, animal encounters, and food vendors for the whole family.";
  const [event] = fetchInboundEvents({ today: "2026-10-22", events: [{
    id: "monster-bash-celebration", cityKey: "mountain-view",
    title: "Monster Bash Halloween Celebration",
    startsAt: "2026-10-24T10:00:00-07:00", endsAt: "2026-10-24T14:00:00-07:00",
    location: "Rengstorff Park, Mountain View, CA",
    sourceUrl: "https://www.mountainview.gov/our-city/departments/community-services/special-events/monster-bash",
    description,
  }] });
  assert.equal(event.category, "family");
  assert.equal(inferCategory("Halloween Hockey Game", description, "", "Ice rink"), "sports");
});

test("Bruno Mars newsletter ingest keeps the verified show and gate times distinct", () => {
  const raw = {
    id: "fixture-bruno", cityKey: "santa-clara", title: "Bruno Mars: The Romantic Tour",
    startsAt: "2026-10-11T19:00:00-07:00", location: "Levi's Stadium",
    description: "Bruno Mars performs with gates opening at 11:25 a.m.",
    sourceUrl: "https://levisstadium.com/",
  };
  const event = fetchInboundEvents({ today: "2026-10-11", events: [raw] }).map(applyVerifiedEventFacts)[0];
  assert.equal(event.time, "7:00 PM");
  assert.equal(event.category, "music");
  assert.equal(event.cost, "paid");
  assert.match(event.description, /gates open at 5:30 PM/);
  assert.doesNotMatch(event.description, /11:25/);
  assert.match(event.url, /bruno-mars-the-romantic-tour-october-11th\/$/);
  const nextYear = { ...event, date: "2027-10-11", description: "Different event details" };
  assert.equal(applyVerifiedEventFacts(nextYear), nextYear);
});

test("a named ballet production wins over incidental symphony and composer words", () => {
  assert.equal(inferCategory("Grand Kyiv Ballet Presents the Nutcracker: Symphony of Lights", "Set to Tchaikovsky's score", "", "Hammer Theatre Center"), "arts");
  assert.equal(inferCategory("San Jose Symphony performs Tchaikovsky", "An orchestral concert", "", "Hammer Theatre Center"), "music");
});

test("Stanford newsletter events retain verified links and copy after ingestion", () => {
  const cases = [
    ["Kronos Quartet with Mahsa and Marjan Vahdat: Placeless", "2026-10-11T14:30:00-07:00", "Bing Concert Hall", "events.stanford.edu"],
    ["Bob Marley: How Reggae Changed the World", "2026-11-11T19:00:00-08:00", "The Studio", "live.stanford.edu"],
    ["Rachel Willis-Sørensen Vocal Recital", "2026-11-18T19:30:00-08:00", "Bing Concert Hall", "live.stanford.edu"],
  ];
  const events = fetchInboundEvents({ today: "2026-10-11", events: cases.map(([title, startsAt, location], i) => ({
    id: `fixture-stanford-${i}`, cityKey: "palo-alto", title, startsAt, location,
    sourceUrl: "https://stanfordlive.stanford.edu",
    description: i === 2 ? "Grammy-winning soprano Rachel Willis-Sørensen performs a vocal recital." : undefined,
  })) }).map(applyVerifiedEventFacts);
  assert.equal(events.length, 3);
  for (const [i, event] of events.entries()) {
    assert.equal(new URL(event.url).hostname, cases[i][3]);
    assert.notEqual(new URL(event.url).pathname, "/");
    const otherDate = { ...event, date: "2027-11-18", url: "https://example.org/another-performance" };
    assert.equal(applyVerifiedEventFacts(otherDate), otherDate);
  }
  assert.match(events[1].description, /Duane Forrest.*acoustic/);
  assert.match(events[1].blurb, /Duane Forrest/);
  assert.doesNotMatch(events[2].description, /Grammy/i);
  assert.match(events[2].blurb, /Tamar Sanikidze/);
});

test("verified Sunnyvale online talks keep their format when the newsletter loses its location", () => {
  const talks = [
    ["Pasta with a Twist: A Fresh Take on Italian Classics with Joe Sasto", "2026-10-06"],
    ["Art in Flight: Reinventing Postmodernism with Carolyn Russo", "2026-10-08"],
  ];
  for (const [title, date] of talks) {
    const raw = {
      id: `fixture-${date}`, cityKey: "sunnyvale", title,
      startsAt: `${date}T11:00:00-07:00`, endsAt: `${date}T12:00:00-07:00`,
      location: null, sourceUrl: null,
    };
    const event = fetchInboundEvents({ events: [raw], today: "2026-10-04" })[0];
    assert.equal(event.virtual, true);
    assert.equal(event.venue, "Online");
    assert.equal(event.time, "11:00 AM");
    assert.match(event.url, /-curm-10\/-cury-2026/);
    assert.equal(normalizeInboundEventPresentation({ ...raw, cityKey: "campbell" }).virtual, undefined);
    assert.equal(normalizeInboundEventPresentation({ ...raw, startsAt: raw.startsAt.replace("2026", "2027") }).virtual, undefined);
  }
});

test("Campbell's verified Saturday date is applied before the past-occurrence filter", () => {
  const raw = {
    id: "inbound_mu62yvos_eogfnd", cityKey: "campbell",
    title: "Annual Citywide Garage Sale",
    startsAt: "2026-10-04T08:00:00-07:00",
    endsAt: "2026-10-04T16:00:00-07:00",
    sourceUrl: "http://www.campbellca.gov/597/Community-Garage-Sale",
  };
  const saturday = fetchInboundEvents({ events: [raw], today: "2026-10-03" });
  assert.equal(saturday.length, 1);
  assert.equal(saturday[0].date, "2026-10-03");
  assert.equal(saturday[0].displayDate, "Sat, Oct 3");
  assert.equal(saturday[0].time, "8:00 AM");
  assert.equal(saturday[0].endTime, "4:00 PM");
  assert.match(saturday[0].url, /^https:/);
  assert.deepEqual(fetchInboundEvents({ events: [raw], today: "2026-10-04" }), []);

  const otherYear = { ...raw, startsAt: "2027-10-04T08:00:00-07:00", endsAt: null };
  assert.equal(fetchInboundEvents({ events: [otherYear], today: "2027-10-03" })[0].date, "2027-10-04");
  const otherSource = { ...raw, sourceUrl: "https://example.org/garage-sale" };
  assert.equal(fetchInboundEvents({ events: [otherSource], today: "2026-10-03" })[0].date, "2026-10-04");
});

test("a play with kids in its title is not promoted as children's programming", () => {
  const event = fetchInboundEvents({ today: "2026-10-03", events: [{
    id: "fixture-hodge", fromEmail: "latest@email.live.stanford.edu",
    title: "All Gregs Kids Come Home - Staged Reading",
    startsAt: "2026-10-17T19:00:00-07:00", location: "The Studio, Stanford",
    description: "A staged reading of Chinaka Hodge's play about a family.",
  }] })[0];
  assert.equal(event.category, "arts");
  assert.equal(event.kidFriendly, false);
  assert.match(event.url, /\/studio\/chinaka-hodge\/$/);
});

test("SVP's correction cannot leave a second Senior Center chat on Saturday", () => {
  const original = {
    id: "inbound_muvl3a1q_ktz8ma", cityKey: "santa-clara",
    title: "Public Power Week Fireside Chat at Senior Center",
    startsAt: "2026-10-10T10:00:00-07:00", endsAt: "2026-10-10T12:00:00-07:00",
    location: "Santa Clara Senior Center, Santa Clara, CA",
    sourceUrl: "https://www.siliconvalleypower.com",
  };
  const corrected = { ...original, id: "inbound_mux03i3s_iafre2", startsAt: "2026-10-09T10:00:00-07:00", endsAt: "2026-10-09T12:00:00-07:00" };
  const friday = fetchInboundEvents({ events: [original, corrected], today: "2026-10-09" });
  assert.equal(friday.length, 2);
  assert.ok(friday.every((event) => event.date === "2026-10-09" && event.time === "10:00 AM" && event.endTime === "12:00 PM"));
  assert.deepEqual(fetchInboundEvents({ events: [original, corrected], today: "2026-10-10" }), []);
  assert.equal(normalizeInboundEventPresentation({ ...original, startsAt: "2027-10-10T10:00:00-07:00" }).date, undefined);
  assert.equal(normalizeInboundEventPresentation({ ...original, title: "Another Senior Center chat" }).date, undefined);
});

test("Stanford newsletters resolve to one verified Taking Back Sunday performance", () => {
  const raw = {
    cityKey: "palo-alto", fromEmail: "latest@email.live.stanford.edu",
    title: "Taking Back Sunday", location: "Frost Amphitheater, Stanford, CA",
    sourceUrl: "https://live.stanford.edu/your-visit/venues/frost-amphitheater/",
  };
  const events = fetchInboundEvents({ today: "2026-10-10", events: [
    { ...raw, id: "newsletter-latest", startsAt: "2026-10-10T00:00:00-07:00" },
    { ...raw, id: "newsletter-original", title: "Taking Back Sunday with Thrice and Saves the Day", startsAt: "2026-10-10T19:00:00-07:00" },
  ] });
  assert.equal(events.length, 2);
  assert.ok(events.every((e) => e.time === "6:00 PM"));
  assert.ok(events.every((e) => e.url === "https://live.stanford.edu/events/26-frost/taking-back-sunday/"));
  const kept = fuzzyDedupEvents(events).kept.map(applyVerifiedEventFacts);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].address, "351 Lasuen Street, Stanford, CA 94305");
  assert.equal(kept[0].cost, "paid");
  const nextYear = fetchInboundEvents({ today: "2027-10-10", events: [{ ...raw, startsAt: "2027-10-10T19:00:00-07:00" }] })[0];
  assert.equal(nextYear.time, "7:00 PM");
});

test("MUNA's venue-only newsletter cannot produce a second afternoon show", () => {
  const raw = {
    cityKey: "palo-alto", fromEmail: "latest@email.live.stanford.edu",
    location: "Frost Amphitheater, Stanford, CA",
    sourceUrl: "https://live.stanford.edu/your-visit/venues/frost-amphitheater/",
  };
  const events = fetchInboundEvents({ today: "2026-10-10", events: [
    { ...raw, id: "muna-latest", title: "Muna at Frost Amphitheater", startsAt: "2026-10-18T00:00:00-07:00" },
    { ...raw, id: "muna-original", title: "Muna Gets So Hot Tour", startsAt: "2026-10-18T19:00:00-07:00" },
  ] }).map(applyVerifiedEventFacts);
  const kept = fuzzyDedupEvents(events).kept;
  assert.equal(kept.length, 1);
  assert.equal(kept[0].time, "7:00 PM");
  assert.equal(kept[0].category, "music");
  assert.equal(kept[0].url, "https://live.stanford.edu/events/26-frost/muna/");
  const nextYear = { ...kept[0], date: "2027-10-18", time: "8:00 PM" };
  assert.equal(applyVerifiedEventFacts(nextYear), nextYear);
});

test("inbound end-of-day and midnight sentinels are not visitor times", () => {
  assert.equal(inboundClock("2026-07-20T23:59:59-07:00"), null);
  assert.equal(inboundClock("2026-07-20T00:00:00-07:00"), null);
  // Nov. 1 is still PDT at midnight. The bad -08 source offset used to convert
  // this sentinel to 1 AM and publish it as a real event time.
  assert.equal(inboundClock("2026-11-01T00:00:00-08:00"), null);
  assert.equal(inboundClock("2026-07-20T18:30:00-07:00"), "6:30 PM");
});

test("seasonally inconsistent Pacific offsets stay unknown without first-party evidence", () => {
  assert.equal(inboundClock("2026-11-17T19:00:00-07:00"), null);
  assert.equal(inboundClock("2027-03-10T19:30:00-07:00"), null);
  assert.equal(inboundClock("2026-07-20T18:30:00-08:00"), null);
  assert.equal(inboundClock("2026-11-17T19:00:00-08:00"), "7:00 PM");
  assert.equal(inboundClock("2026-11-18T03:00:00Z"), "7:00 PM");
  assert.equal(normalizeInboundEventPresentation({
    title: "Unknown winter event", location: "Heritage Theatre",
    startsAt: "2026-11-17T19:00:00-07:00",
  }).time, null);
});

test("verified performance times survive bad newsletter offsets before deduplication", () => {
  const cases = [
    ["Taimane", "Heritage Theatre", "2027-02-07T19:30:00-07:00", "7:30 PM"],
    ["Jaemin Han Cello Recital", "Bing Concert Hall", "2027-03-10T19:30:00-07:00", "7:30 PM"],
    ["Toast - The Best of Bread", "Heritage Theatre", "2026-11-17T19:00:00-07:00", "7:00 PM"],
    ["World Ballet Company: Swan Lake", "Heritage Theatre", "2026-11-19T19:00:00-07:00", "7:00 PM"],
    ["Harriet: Trying to Get the Feeling Again", "Heritage Theatre", "2026-11-20T19:00:00-07:00", "7:00 PM"],
    ["World Ballet Company: The Nutcracker", "Heritage Theatre", "2026-12-16T19:00:00-07:00", "7:00 PM"],
  ];
  for (const [title, location, startsAt, time] of cases) {
    assert.equal(normalizeInboundEventPresentation({ title, location, startsAt }).time, time);
  }
  assert.match(normalizeInboundEventPresentation({
    title: "Jaemin Han Cello Recital", location: "Bing Concert Hall",
    startsAt: "2027-03-10T19:30:00-07:00",
  }).url, /jaemin-han-cello-recital\/$/);
});

test("Jeremy Frey closing day uses official museum hours and exhibition URL", () => {
  assert.deepEqual(normalizeInboundEventPresentation({
    title: "Jeremy Frey: Woven closing",
    startsAt: "2026-07-20T23:59:59-07:00",
    endsAt: null,
    location: "Cantor Arts Center, Stanford University",
    sourceUrl: "https://guides.bloombergconnects.org/example",
  }), {
    time: "11:00 AM",
    endTime: "6:00 PM",
    url: JEREMY_FREY_EXHIBITION_URL,
  });
});

test("PapaHugs uses the museum occurrence page and published end time", () => {
  assert.deepEqual(normalizeInboundEventPresentation({
    title: "David PapaHugs Sharpe concert",
    startsAt: "2026-07-22T11:00:00-07:00",
    endsAt: null,
    location: "Children's Discovery Museum of San Jose Amphitheatre, 180 Woz Way, San Jose, CA 95110",
    sourceUrl: "https://14945.blackbaudhosting.com/14945/page.aspx?pid=196&tab=2&txobjid=generic-ticket",
  }), {
    time: "11:00 AM",
    endTime: "11:45 AM",
    url: PAPAHUGS_OCCURRENCE_URL,
  });
});

test("SJ Giants Japanese Heritage Night uses the official MiLB ticket sales group", () => {
  assert.deepEqual(normalizeInboundEventPresentation({
    title: "San Jose Giants Japanese Heritage Game Night",
    startsAt: "2026-07-26T17:00:00-07:00",
    endsAt: null,
    location: "Excite Ballpark, 588 E Alma Ave, San Jose, CA 95112",
    sourceUrl: "https://www.eventbrite.com/e/3rd-annual-aapi-playwright-festival-sj-japantown-guided-tour-tickets-1989767460036",
  }), {
    time: "5:00 PM",
    endTime: null,
    url: SJ_GIANTS_JAPANESE_HERITAGE_2026_07_26_URL,
  });
});

test("Silicon Valley Pride uses the official parade time, route, and URL", () => {
  assert.deepEqual(normalizeInboundEventPresentation({
    title: "Silicon Valley Pride Parade",
    startsAt: "2026-08-30T10:30:00-07:00",
    endsAt: null,
    location: "Downtown San Jose",
    sourceUrl: "https://cmt.com/participant-check-in",
  }), {
    time: "11:00 AM",
    endTime: "12:30 PM",
    url: SILICON_VALLEY_PRIDE_2026_URL,
    venue: "Downtown San Jose — Julian Street & Market Street to Plaza Park",
  });
});

test("inbound events prefer an explicit canonical URL", () => {
  assert.equal(normalizeInboundEventPresentation({
    title: "Example",
    startsAt: "2026-07-20T18:30:00-07:00",
    canonicalUrl: "https://venue.example.com/events/example",
    sourceUrl: "https://tracker.example.com/example",
  }).url, "https://venue.example.com/events/example");
});

test("recovered newsletter links stay bound to their occurrence and session", () => {
  const citizenship = (date) => normalizeInboundEventPresentation({
    title: "U.S. Citizenship Test Preparation Class", startsAt: `${date}T11:00:00-07:00`,
  }).url;
  assert.match(citizenship("2026-10-05"), /\/114749\//);
  assert.match(citizenship("2026-10-19"), /\/114751\//);
  assert.equal(citizenship("2026-10-12"), "");
  const wreath = (session) => normalizeInboundEventPresentation({
    title: `Wreathmaking Workshop (${session} session)`, startsAt: "2026-11-15T10:00:00-08:00",
  }).url;
  assert.equal(wreath("10am"), "https://my.montalvoarts.org/3275/3276");
  assert.equal(wreath("3pm"), "https://my.montalvoarts.org/3275/3277");
});

test("Santa Clara doors-open and address copies normalize to one 6 PM event", () => {
  const copies = [
    { startsAt: "2026-09-30T17:00:00-07:00", location: "Mission City Center for Performing Arts, 3250 Monroe St., Santa Clara" },
    { startsAt: "2026-09-30T18:00:00-07:00", location: "Mission City Center for Performing Arts at Wilcox High School, 3250 Monroe St., Santa Clara" },
  ];
  const normalized = copies.map((copy) => normalizeInboundEventPresentation({
    title: "2026 State of the City Address", ...copy,
  }));
  assert.deepEqual(normalized[0], normalized[1]);
  assert.equal(normalized[0].time, "6:00 PM");
  assert.equal(normalized[0].venue, "Mission City Center for Performing Arts");
  assert.equal(normalized[0].url, "https://www.santaclaraca.gov/recreation-community/events/state-of-the-city");
  assert.equal(normalizeInboundEventPresentation({
    title: "2027 State of the City Address", startsAt: "2027-09-30T17:00:00-07:00",
    location: copies[0].location,
  }).time, "5:00 PM");
});

test("Stanford Athletics per-send redirects never reach public cards", () => {
  assert.equal(normalizeInboundEventPresentation({
    title: "Stanford Men's Soccer vs. Santa Clara",
    startsAt: "2026-09-15T19:00:00-07:00",
    sourceUrl:
      "https://app.mail.gostanford.com/e/er?s=1855418&lid=2442&elq=recipient-token",
  }).url, "");
});

test("a multi-week program's last date is not an end time", () => {
  // The real Monte Sereno record: an eight-week academy that starts Sep 17 and
  // graduates Nov 12. The extractor stamped the November date with July's
  // -07:00 offset, which lands at 11 PM Pacific on Nov 11 — past the midnight
  // sentinel — and the card read "9:00 AM – 11:00 PM".
  assert.deepEqual(normalizeInboundEventPresentation({
    title: "Community Police Academy",
    startsAt: "2026-09-17T00:00:00-07:00",
    endsAt: "2026-11-12T00:00:00-07:00",
    sourceUrl: "https://www.montesereno.org/civicalerts.aspx?AID=689",
  }), {
    time: null,
    endTime: null,
    url: "https://www.montesereno.org/civicalerts.aspx?AID=689",
  });
});

test("a same-evening end time survives, including one that crosses midnight", () => {
  assert.deepEqual(normalizeInboundEventPresentation({
    title: "Council study session",
    startsAt: "2026-09-17T18:00:00-07:00",
    endsAt: "2026-09-17T20:30:00-07:00",
    sourceUrl: "https://example.gov/agenda",
  }).endTime, "8:30 PM");
  assert.deepEqual(normalizeInboundEventPresentation({
    title: "Late set",
    startsAt: "2026-09-17T22:00:00-07:00",
    endsAt: "2026-09-18T01:00:00-07:00",
    sourceUrl: "https://example.com/show",
  }).endTime, "1:00 AM");
});
