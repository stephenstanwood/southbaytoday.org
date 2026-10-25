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

test("Meetup keeps imminent events inside the requested window across Pacific daylight saving changes", async (t) => {
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

  // The October refresh lost same-day events by labeling a UTC wall clock
  // as -07:00. Exercise the source's date filtering, including winter time
  // and a 60-day horizon spanning a daylight saving transition.
  for (const instant of ["2026-10-25T07:32:00-07:00", "2026-11-01T01:32:00-08:00", "2027-03-14T01:32:00-08:00"]) {
    const now = new Date(instant);
    const horizon = new Date(now.getTime() + 60 * 864e5);
    const nodes = [
      { id: "imminent", dateTime: new Date(now.getTime() + 36e5).toISOString() },
      { id: "past", dateTime: new Date(now.getTime() - 36e5).toISOString() },
      { id: "beyond-horizon", dateTime: new Date(horizon.getTime() + 36e5).toISOString() },
    ].map((occurrence) => ({
      ...occurrence,
      title: "Community Workshop at the Library",
      eventUrl: `https://www.meetup.com/offline-control/events/${occurrence.id}/`,
      eventType: "PHYSICAL", status: "ACTIVE",
      venue: { name: "Almaden Library", address: "6445 Camden Ave", city: "San Jose" },
      group: { name: "Local Community", urlname: "offline-control", stats: { memberCounts: { all: 100 } } },
      rsvps: { yesCount: 5 },
    }));
    const ranges = [];
    const mock = t.mock.method(globalThis, "fetch", async (url, options) => {
      if (String(url) === "https://secure.meetup.com/oauth2/access") {
        return Response.json({ access_token: "offline-test-token" });
      }
      assert.equal(String(url), "https://api.meetup.com/gql-ext");
      const query = JSON.parse(options.body).query;
      const start = new Date(query.match(/startDateRange: "([^"]+)"/)[1]);
      const end = new Date(query.match(/endDateRange: "([^"]+)"/)[1]);
      ranges.push({ start, end });
      const matches = nodes.filter((node) => new Date(node.dateTime) >= start && new Date(node.dateTime) <= end);
      return Response.json({ data: { eventSearch: { edges: matches.map((node) => ({ node })) } } });
    });
    try {
      const events = await fetchMeetupEvents({ now });
      assert.equal(ranges.length, 8);
      for (const range of ranges) {
        assert.equal(range.start.getTime(), now.getTime(), `start instant: ${instant}`);
        assert.equal(range.end.getTime(), horizon.getTime(), `end instant: ${instant}`);
      }
      assert.deepEqual(events.map((event) => event.url), [nodes[0].eventUrl]);
    } finally {
      mock.mock.restore();
    }
  }
});

test("Meetup resolves the source address before appending conflicting city metadata", async (t) => {
  // The November 9 Guadalupe Trail walk's source address names San Jose,
  // while venue.city incorrectly says Santa Clara. Appending that field first
  // makes the usable address ambiguous to the shared city resolver.
  const locations = [
    { city: "Santa Clara", address: "River View Apartments Building 5, 100 Riverview Pkwy, San Jose, CA 95134" },
    { city: "Santa Clara", address: "200 E. Santa Clara St., San José" },
    { city: "Santa Clara", address: "1600 N Santa Clara St, Santa Clara, CA" },
    { city: "Santa Clara", address: "Joint venue, Santa Clara and San Jose" },
  ];
  const nodes = locations.map((location, index) => ({
    id: `address-control-${index}`, title: "Community Walk",
    dateTime: "2026-11-09T17:30:00-08:00",
    eventUrl: `https://www.meetup.com/offline-control/events/address-control-${index}/`,
    eventType: "PHYSICAL", status: "ACTIVE",
    venue: { name: index === 0 ? "Riverview Park" : "Community Center", ...location },
    group: { name: "Local Community", urlname: "offline-control", stats: { memberCounts: { all: 100 } } },
    rsvps: { yesCount: 5 },
  }));
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const credentials = {
    MEETUP_CLIENT_ID: "offline-test-client", MEETUP_MEMBER_ID: "offline-test-member",
    MEETUP_KID: "offline-test-key", MEETUP_PRIVATE_KEY: privateKey,
  };
  const previous = Object.fromEntries(Object.keys(credentials).map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  Object.assign(process.env, credentials);
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url) === "https://secure.meetup.com/oauth2/access") {
      return Response.json({ access_token: "offline-test-token" });
    }
    assert.equal(String(url), "https://api.meetup.com/gql-ext");
    return Response.json({ data: { eventSearch: { edges: nodes.map((node) => ({ node })) } } });
  });
  const events = await fetchMeetupEvents({ now: new Date("2026-10-25T23:00:00Z") });
  assert.deepEqual(events.map((event) => event.city), ["san-jose", "san-jose", "santa-clara", "santa-clara"]);
  assert.deepEqual(events.map((event) => event.address), locations.map((location) => location.address));
});
