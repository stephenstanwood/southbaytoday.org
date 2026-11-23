export const DEFAULT_SNAPSHOT_MAX_AGE_HOURS = 30;

const CALENDAR_DATE = /^20\d{2}-\d{2}-\d{2}$/;
const REQUIRED_REFRESH_ENV = Object.freeze([
  "TICKETMASTER_API_KEY",
]);

function ageHours(timestamp, now) {
  const then = Date.parse(String(timestamp || ""));
  if (!Number.isFinite(then)) return null;
  return (now.getTime() - then) / 3_600_000;
}

function datedEventCounts(events) {
  const counts = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    const date = String(event?.date || "");
    if (!CALENDAR_DATE.test(date)) continue;
    counts.set(date, (counts.get(date) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function countDatedEventsOnOrAfter(counts, today) {
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return null;
  const entries = Object.entries(counts).filter(([date, count]) => (
    CALENDAR_DATE.test(date) && Number.isFinite(Number(count))
  ));
  if (entries.length === 0) return null;
  return entries.reduce(
    (sum, [date, count]) => sum + (date >= today ? Number(count) : 0),
    0,
  );
}

function lastLiveDateCounts(source) {
  // Older runs labeled cached listings "ok" and marked them carriedForward.
  if (source?.status === "ok" && !source.carriedForward) return source.dateCounts;
  return source?.lastLiveDateCounts;
}

function publishedUpcomingEvents(events, label, today) {
  return (Array.isArray(events) ? events : []).filter((event) => (
    event?.source === label && CALENDAR_DATE.test(event.date) && event.date >= today
  ));
}

export function inspectSnapshot({
  name,
  data,
  timestamp,
  now = new Date(),
  maxAgeHours = DEFAULT_SNAPSHOT_MAX_AGE_HOURS,
}) {
  const count = Array.isArray(data?.events) ? data.events.length : 0;
  const age = ageHours(timestamp, now);
  let status = "ok";
  let reason = null;

  if (!data || !Array.isArray(data.events)) {
    status = "invalid";
    reason = "missing events array";
  } else if (count === 0) {
    status = "empty";
    reason = "contains no events";
  } else if (age === null) {
    status = "invalid";
    reason = "missing or invalid refresh timestamp";
  } else if (age < -1) {
    status = "invalid";
    reason = "refresh timestamp is in the future";
  } else if (age > maxAgeHours) {
    status = "stale";
    reason = `${age.toFixed(1)}h old (maximum ${maxAgeHours}h)`;
  }

  return {
    name,
    status,
    count,
    timestamp: timestamp || null,
    ageHours: age === null ? null : Number(age.toFixed(2)),
    reason,
  };
}

export function strictRefreshInputHealth({
  env = process.env,
  playwright,
  inbound,
  now = new Date(),
  maxAgeHours = DEFAULT_SNAPSHOT_MAX_AGE_HOURS,
} = {}) {
  const missingEnv = REQUIRED_REFRESH_ENV.filter((key) => !String(env[key] || "").trim());
  const snapshots = [
    inspectSnapshot({
      name: "playwright-events",
      data: playwright,
      timestamp: playwright?._meta?.generatedAt,
      now,
      maxAgeHours,
    }),
    inspectSnapshot({
      name: "inbound-events",
      data: inbound,
      timestamp: inbound?._meta?.pulledAt,
      now,
      maxAgeHours,
    }),
  ];
  const problems = [
    ...missingEnv.map((key) => `missing required credential ${key}`),
    ...snapshots
      .filter((snapshot) => snapshot.status !== "ok")
      .map((snapshot) => `${snapshot.name} is ${snapshot.status}: ${snapshot.reason}`),
  ];
  return { ok: problems.length === 0, missingEnv, snapshots, problems };
}

export function buildSourceHealth(sourceDefinitions, settledResults) {
  return sourceDefinitions.map((source, index) => {
    const result = settledResults[index];
    if (result?.status !== "fulfilled") {
      return {
        id: source.id,
        label: source.label,
        critical: Boolean(source.critical),
        status: result?.status === "fallback" ? "fallback" : "error",
        count: 0,
        dateCounts: {},
        error: result?.reason?.message || String(result?.reason || "source did not run"),
        ...(result?.retained ? {
          retainedCount: result.retained.events.length,
          retainedDateCounts: datedEventCounts(result.retained.events),
          retainedFrom: result.retained.from,
        } : {}),
        ...(result?.lastLiveDateCounts ? { lastLiveDateCounts: result.lastLiveDateCounts } : {}),
      };
    }

    const events = Array.isArray(result.value) ? result.value : [];
    const count = events.length;
    return {
      id: source.id,
      label: source.label,
      critical: Boolean(source.critical),
      status: count > 0 ? "ok" : "empty",
      count,
      dateCounts: datedEventCounts(events),
      error: null,
    };
  });
}

/** True for rate limits, timeouts, and other temporary upstream failures. */
export function isTransientSourceError(error) {
  const msg = String(error?.message || error || "");
  if (/\b(408|425|429|5\d\d)\b/.test(msg)) return true;
  return /timeout|AbortError|ECONNRESET|ENOTFOUND|EAI_AGAIN|network|fetch failed|socket|\bterminated\b/i.test(msg);
}

/**
 * A transient failure may reuse the source's previously published future
 * listings. Keep their provenance and the last live coverage baseline.
 */
export function carryForwardTransientCriticalSources(
  sourceDefinitions,
  settledResults,
  previous,
  { today } = {},
) {
  if (!CALENDAR_DATE.test(today)) throw new Error("retention requires today's Pacific date");
  const previousHealth = Array.isArray(previous?.sourceHealth) ? previous.sourceHealth : [];
  const previousById = new Map(previousHealth.map((source) => [source?.id, source]));
  return settledResults.map((result, index) => {
    const source = sourceDefinitions[index];
    if (!(source?.critical || source?.preserveOnTransientFailure) || result?.status !== "rejected") return result;
    if (!isTransientSourceError(result.reason)) return result;

    const cached = publishedUpcomingEvents(previous?.events, source.label, today);
    if (cached.length === 0) return result;

    const previousSource = previousById.get(source.id);
    const from = previousSource?.retainedFrom || previous?.generatedAt;
    if (!Number.isFinite(Date.parse(from))) return result;
    return {
      status: "fallback",
      reason: result.reason,
      retained: { events: cached.map((event) => ({ ...event })), from },
      lastLiveDateCounts: lastLiveDateCounts(previousSource),
    };
  });
}

/**
 * A failed optional calendar is not a cancellation. Explicitly selected sources
 * may keep their previously published, still-upcoming occurrences while the
 * failed request stays rejected for alerts and the systemic-outage gate.
 * Successful responses always replace the old rows, including an empty season.
 */
export function retainFailedOptionalSources(sourceDefinitions, settledResults, previous, { today } = {}) {
  if (!CALENDAR_DATE.test(today)) throw new Error("retention requires today's Pacific date");
  const previousHealth = new Map((previous?.sourceHealth || []).map((item) => [item.id, item]));
  return settledResults.map((result, index) => {
    const source = sourceDefinitions[index];
    if (!source?.preserveOnFailure || source.critical || result?.status !== "rejected") return result;
    const events = (previous?.events || []).filter((event) => {
      if (event?.source !== source.label || !CALENDAR_DATE.test(event.date)) return false;
      const end = CALENDAR_DATE.test(event.endDate) && event.endDate >= event.date
        ? event.endDate : event.date;
      return end >= today;
    });
    if (!events.length) return result;
    const from = previousHealth.get(source.id)?.retainedFrom || previous?.generatedAt;
    // Do not invent a verification date for an untraceable cache.
    if (!Number.isFinite(Date.parse(from))) return result;
    return { ...result, retained: { events: events.map((event) => ({ ...event })), from } };
  });
}

export function eventsForSourceResult(result) {
  return result?.status === "fulfilled" && Array.isArray(result.value)
    ? result.value : result?.retained?.events || [];
}

// How many non-critical adapters may fail before we treat the run as unsafe.
// Above this, the failures look systemic (network, DNS, a shared upstream)
// rather than a handful of individually dead feeds.
export const DEFAULT_SOURCE_ERROR_TOLERANCE = 6;

function describeSource(source) {
  return `${source.label} is ${source.status}${source.error ? `: ${source.error}` : ""}`;
}

/**
 * Split source failures into the ones that must block the overwrite and the
 * ones the run can absorb.
 *
 * A thrown adapter error is still unsafe in isolation — we do not know whether
 * the source is legitimately empty — but blocking the whole refresh on any one
 * of them is worse: four dead sports feeds took down a 4,000-event refresh for
 * five days in Jul/Aug 2026, and with it the daily newsletter, which refuses to
 * send without a fresh feed. Critical sources require live or usable cached
 * coverage; optional failures block once enough of them look systemic.
 */
export function sourceProblems(sourceHealth, { tolerance = DEFAULT_SOURCE_ERROR_TOLERANCE } = {}) {
  const critical = [];
  const tolerable = [];

  for (const source of Array.isArray(sourceHealth) ? sourceHealth : []) {
    if (source.status === "ok") continue;
    if (
      source.status === "fallback"
      && Number.isInteger(source.retainedCount) && source.retainedCount > 0
      && Number.isFinite(Date.parse(source.retainedFrom))
      && isTransientSourceError(source.error)
    ) continue;
    if (source.critical) {
      critical.push(source);
    } else if (source.status === "error" || source.status === "fallback") {
      tolerable.push(source);
    }
  }

  const toleranceExceeded = tolerable.length > tolerance;
  return {
    blocking: [...critical, ...(toleranceExceeded ? tolerable : [])].map(describeSource),
    tolerated: toleranceExceeded ? [] : tolerable.map(describeSource),
    toleranceExceeded,
  };
}

export function eventRegressionProblem({ previous, nextSourceCount, nextEventCount }) {
  if (!previous) return null;
  const previousSourceCount = Array.isArray(previous.sources) ? previous.sources.length : 0;
  const previousEventCount = Number(previous.eventCount || previous.events?.length || 0);
  if (previousSourceCount < 10 || previousEventCount <= 0) return null;

  const lostSources = previousSourceCount - nextSourceCount;
  if (lostSources < 4 && nextEventCount >= previousEventCount * 0.6) return null;
  return `event coverage regressed from ${previousSourceCount} to ${nextSourceCount} sources and ${previousEventCount} to ${nextEventCount} events`;
}

/**
 * Catch a single adapter losing records that were still scheduled for the
 * future. Aggregate event totals cannot see this when a large library feed
 * masks a smaller first-party source. Date-bucket baselines naturally age out,
 * so seasonal sources may empty after their final occurrence without a manual
 * allowlist. Cached listings have already passed publication filters, so
 * compare them with the eligible listings in the last published snapshot.
 */
export function sourceRegressionProblems({
  previousSourceHealth,
  previousEvents,
  nextSourceHealth,
  today,
  minimumExpected = 3,
  minimumRetainedRatio = 0.25,
} = {}) {
  if (!CALENDAR_DATE.test(today)) return [];
  const previousById = new Map(
    (Array.isArray(previousSourceHealth) ? previousSourceHealth : [])
      .map((source) => [source?.id, source]),
  );
  const problems = [];

  for (const next of Array.isArray(nextSourceHealth) ? nextSourceHealth : []) {
    if (!next || next.status === "error" || next.carriedForward) continue;
    const fallback = next.status === "fallback";
    const expected = fallback
      ? publishedUpcomingEvents(previousEvents, next.label, today).length
      : countDatedEventsOnOrAfter(lastLiveDateCounts(previousById.get(next.id)), today);
    if (expected === null || expected < minimumExpected) continue;

    const actual = (fallback ? next.retainedCount : countDatedEventsOnOrAfter(next.dateCounts, today)) ?? 0;
    const records = fallback ? "cached listings" : "source records";
    if (actual === 0) {
      problems.push(`${next.label} lost ${expected} still-upcoming ${records}`);
      continue;
    }

    const retainedRatio = actual / expected;
    if (retainedRatio < minimumRetainedRatio) {
      problems.push(
        `${next.label} retained only ${actual} of ${expected} still-upcoming ${records} (${Math.round(retainedRatio * 100)}%)`,
      );
    }
  }

  return problems;
}
