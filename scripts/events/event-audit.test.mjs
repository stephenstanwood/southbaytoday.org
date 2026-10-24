import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { classify } from "../audit-events.mjs";
import { fetchMeetupEvents } from "../generate-events.mjs";

test("regional Santa Cruz events pass geography while mislabeled campus events fail", () => {
  const event = {
    title: "Public workshop", city: "santa-cruz", venue: "Villa Maria Del Mar",
    address: "21918 E Cliff Dr, Santa Cruz, CA 95062",
  };
  assert.deepEqual(classify(event), []);
  assert.ok(classify({ ...event, city: "santa-clara" }).some((finding) => finding.reason === "slug-mismatch"));
  assert.ok(classify({ ...event, city: "santa-clara" }).some((finding) => finding.reason === "out-of-area"));
  assert.ok(classify({ ...event, address: "Main Street, Oakland, CA" }).some((finding) => finding.reason === "out-of-area"));
});

test("Campbell Recital Hall uses the shared Stanford landmark evidence", () => {
  const event = { title: "Zozulka Trio", venue: "Campbell Recital Hall, Braun Music Center", city: "palo-alto" };
  assert.deepEqual(classify(event), []);
  assert.ok(classify({ ...event, city: "campbell" }).some((finding) => finding.reason === "slug-mismatch"));
  assert.deepEqual(classify({ ...event, venue: "Campbell Community Center", city: "campbell" }), []);
});

test("Meetup excludes verified online products advertised at local venues, while keeping local workshops", async (t) => {
  // October 23 source: https://www.meetup.com/the-sunday-morning-sketch-and-social/events/317093772/
  // Its linked Sketch Hour product says lessons are prerecorded broadcasts,
  // joined through a web dashboard, despite Meetup labeling it PHYSICAL.
  // Qualifying attendance is synthetic so the test reaches the quality filter.
  const course = {
    id: "317093772",
    title: "San Jose Master Observational Drawing Techniques",
    description: "RSVP here, then register through the link below. [JOIN THE CLASS](https://sketchhour.vercel.app/product/SketchStillLife?city=San%20Jose&productId=400601)",
    dateTime: "2026-10-31T20:30:00-07:00",
    endTime: "2026-10-31T21:30:00-07:00",
    eventUrl: "https://www.meetup.com/the-sunday-morning-sketch-and-social/events/317093772/",
    eventType: "PHYSICAL",
    status: "ACTIVE",
    venue: { name: "Alum Rock Park", address: "Alum Rock Park", city: "San Jose" },
    group: {
      name: "The Sunday Morning Sketch and Social",
      urlname: "the-sunday-morning-sketch-and-social",
      stats: { memberCounts: { all: 97 } },
    },
    rsvps: { yesCount: 5 },
  };
  const local = {
    ...course,
    id: "local-drawing-control",
    title: "Community Sketching at Alum Rock Park",
    description: "Meet in person at the park. Bring a pencil and paper.",
    eventUrl: "https://www.meetup.com/local-drawing-control/events/local-drawing-control/",
  };
  const zoomCourse = {
    ...course, id: "317111365", title: "San Jose 7 Claude Techniques You'll Use Tomorrow",
    description: "Register at https://aspen-32278.aiventurelab.org/product/ClaudeVibeCode?city=San%20Jose",
    venue: { name: "Walsh & Northwestern", address: "Walsh & Northwestern", city: "San Jose" },
    eventUrl: "https://www.meetup.com/francophones-and-friends-social-club-gatherings/events/317111365/",
  };
  const localTech = {
    ...local, id: "local-tech-control", title: "Community Coding Workshop with Claude",
    description: "Meet in person at the library to build a small app together.",
    eventUrl: "https://www.meetup.com/local-tech-control/events/local-tech-control/",
  };
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const credentials = {
    MEETUP_CLIENT_ID: "offline-test-client",
    MEETUP_MEMBER_ID: "offline-test-member",
    MEETUP_KID: "offline-test-key",
    MEETUP_PRIVATE_KEY: privateKey,
  };
  const previous = Object.fromEntries(Object.keys(credentials).map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  Object.assign(process.env, credentials);
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url) === "https://secure.meetup.com/oauth2/access") {
      return Response.json({ access_token: "offline-test-token" });
    }
    assert.equal(String(url), "https://api.meetup.com/gql-ext");
    assert.match(JSON.parse(options.body).query, /\bdescription\b/, "request the source description needed to verify attendance");
    return Response.json({ data: { eventSearch: { edges: [course, zoomCourse, local, localTech].map((node) => ({ node })) } } });
  });
  const events = await fetchMeetupEvents();
  assert.deepEqual(events.map((event) => event.url), [local.eventUrl, localTech.eventUrl]);
  assert.equal(events[0].venue, "Alum Rock Park");
});
