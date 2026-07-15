const SOURCE = "Guadalupe River Park Conservancy";
const EVENTS_URL = "https://www.grpg.org/events";

function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) throw new Error(`Expected an ISO date, received: ${value}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function occurrenceInMonth(date) {
  return Math.ceil(date.getUTCDate() / 7);
}

function isLastWeekdayOfMonth(date) {
  return addDays(date, 7).getUTCMonth() !== date.getUTCMonth();
}

function event(fields) {
  return {
    city: "san-jose",
    source: SOURCE,
    category: "outdoor",
    cost: "free",
    url: EVENTS_URL,
    kidFriendly: false,
    ...fields,
  };
}

const SERIES = [
  {
    matches: (date) => date.getUTCDay() === 6 && isLastWeekdayOfMonth(date),
    build: (date) => event({
      title: "Yoga and Zumba in the River Park",
      date: isoDate(date),
      time: "9:00 AM",
      endTime: "11:15 AM",
      venue: "Arena Green West",
      address: "N Autumn St, San Jose, CA 95110",
      description:
        "Free last-Saturday fitness sessions: Zumba from 9–10 AM and yoga from 10:15–11:15 AM.",
    }),
  },
  {
    matches: (date) => date.getUTCDay() === 4 && [1, 3].includes(occurrenceInMonth(date)),
    build: (date) => event({
      title: "Bootcamp in the River Park",
      date: isoDate(date),
      time: "6:00 PM",
      endTime: "7:00 PM",
      venue: "Arena Green West",
      address: "N Autumn St, San Jose, CA 95110",
      description: "A free functional workout held on the first and third Thursday of each month.",
    }),
  },
  {
    matches: (date) => date.getUTCDay() === 4 && [1, 3].includes(occurrenceInMonth(date)),
    build: (date) => event({
      title: "Yoga in the River Park: Sunset Sessions",
      date: isoDate(date),
      time: "7:00 PM",
      endTime: "8:00 PM",
      venue: "Arena Green West",
      address: "N Autumn St, San Jose, CA 95110",
      description: "Free sunset yoga on the first and third Thursday of each month.",
    }),
  },
  {
    matches: (date) => date.getUTCDay() === 0 && occurrenceInMonth(date) === 1,
    build: (date) => event({
      title: "Animal Encounters at Rotary PlayGarden",
      date: isoDate(date),
      time: "10:00 AM",
      endTime: "11:00 AM",
      venue: "Rotary PlayGarden",
      address: "438 Coleman Ave, San Jose, CA 95110",
      description: "A free animal encounter at Rotary PlayGarden on the first Sunday of each month.",
      category: "family",
      kidFriendly: true,
    }),
  },
  {
    matches: (date) => date.getUTCDay() === 0 && occurrenceInMonth(date) === 1,
    build: (date) => event({
      title: "GRPC PlayHub",
      date: isoDate(date),
      time: "9:00 AM",
      endTime: "12:00 PM",
      venue: "Arena Green East",
      address: "340 Sharks Way, San Jose, CA 95113",
      description:
        "A free public sports-equipment library with gear available to borrow on the first Sunday of each month.",
      category: "family",
      kidFriendly: true,
    }),
  },
  {
    matches: (date) => date.getUTCDay() === 6,
    build: (date) => event({
      title: "BEE: Beginning Environmental Explorers",
      date: isoDate(date),
      time: "10:30 AM",
      endTime: "1:00 PM",
      venue: "Rotary PlayGarden",
      address: "438 Coleman Ave, San Jose, CA 95110",
      description:
        "Free environmental science for ages 2–6, with Saturday sessions from 10:30–11:30 AM and noon–1 PM.",
      category: "family",
      kidFriendly: true,
    }),
  },
  {
    matches: (date) => date.getUTCDay() === 5 && [2, 4].includes(occurrenceInMonth(date)),
    build: (date) => event({
      title: "Guadalupe Gardens Workday",
      date: isoDate(date),
      time: "3:30 PM",
      endTime: "5:00 PM",
      venue: "Rotary PlayGarden",
      address: "438 Coleman Ave, San Jose, CA 95110",
      description: "A volunteer workday in the Guadalupe Gardens. Advance registration is required.",
      url: "https://bit.ly/4MLZNOV",
      category: "community",
    }),
  },
];

export function confirmedGrpgEvents({ startDate, daysAhead = 90 }) {
  const start = parseIsoDate(startDate);
  const end = addDays(start, daysAhead);
  const events = [];

  for (let date = start; date <= end; date = addDays(date, 1)) {
    for (const series of SERIES) {
      if (series.matches(date)) events.push(series.build(date));
    }
  }

  const pumpkinsDate = parseIsoDate("2026-10-10");
  if (pumpkinsDate >= start && pumpkinsDate <= end) {
    events.push(event({
      title: "Pumpkins in the Park: 30th Anniversary",
      date: "2026-10-10",
      time: "10:00 AM",
      endTime: "4:00 PM",
      venue: "Discovery Meadow",
      address: "180 Woz Way, San Jose, CA 95110",
      description:
        "A free family festival celebrating its 30th anniversary with pumpkins, inflatables, and vendors.",
      category: "family",
      kidFriendly: true,
    }));
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
}

function eventKey(event) {
  return `${event.date}|${event.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
}

export function mergeConfirmedGrpgEvents(scrapedEvents, options) {
  const confirmed = confirmedGrpgEvents(options);
  const confirmedKeys = new Set(confirmed.map(eventKey));
  return [
    ...scrapedEvents.filter((item) => !confirmedKeys.has(eventKey(item))),
    ...confirmed,
  ];
}
