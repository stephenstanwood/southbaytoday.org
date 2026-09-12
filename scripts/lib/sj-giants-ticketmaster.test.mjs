import assert from "node:assert/strict";
import test from "node:test";

import {
  dropStaleTicketmasterSJGiants,
  isTicketmasterSJGiantsExciteEvent,
} from "./sj-giants-ticketmaster.mjs";

test("identifies Ticketmaster SJ Giants at Excite Ballpark", () => {
  assert.equal(
    isTicketmasterSJGiantsExciteEvent({
      source: "Ticketmaster",
      title: "Playoffs - Divisional Round Game 2 San Jose Giants vs TBD",
      venue: "Excite Ballpark",
    }),
    true,
  );
  assert.equal(
    isTicketmasterSJGiantsExciteEvent({
      source: "Ticketmaster",
      title: "San Jose Giants vs. Stockton Ports",
      venue: "Shoreline Amphitheatre",
    }),
    false,
  );
});

test("drops Ticketmaster SJ Giants home dates absent from MiLB this run", () => {
  const input = [
    {
      id: "sjgiants-723f0cab334922bc",
      date: "2026-09-15",
      source: "MiLB",
      venue: "Excite Ballpark",
      title: "San Jose Giants vs. Lake Elsinore Storm",
    },
    {
      id: "tm-Z7r9jZ1A7J7qf",
      date: "2026-09-11",
      source: "Ticketmaster",
      venue: "Excite Ballpark",
      title: "Playoffs - Divisional Round Game 2 San Jose Giants vs TBD",
    },
    {
      id: "tm-Z7r9jZ1A7J7qf-15",
      date: "2026-09-15",
      source: "Ticketmaster",
      venue: "Excite Ballpark",
      title: "San Jose Giants vs Lake Elsinore Storm",
    },
    { id: "tm-other", date: "2026-09-11", source: "Ticketmaster", title: "Powerman 5000", venue: "The Ritz" },
  ];
  const { events, dropped } = dropStaleTicketmasterSJGiants(input);
  assert.equal(dropped, 1);
  assert.deepEqual(
    events.map((e) => e.id),
    ["sjgiants-723f0cab334922bc", "tm-Z7r9jZ1A7J7qf-15", "tm-other"],
  );
});

test("does not filter Ticketmaster when MiLB contributed nothing", () => {
  const stale = {
    id: "tm-Z7r9jZ1A7J7qf",
    date: "2026-09-11",
    source: "Ticketmaster",
    venue: "Excite Ballpark",
    title: "Playoffs - Divisional Round Game 2 San Jose Giants vs TBD",
  };
  const { events, dropped } = dropStaleTicketmasterSJGiants([stale]);
  assert.equal(dropped, 0);
  assert.deepEqual(events, [stale]);
});
