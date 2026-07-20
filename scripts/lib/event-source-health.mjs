export const DEFAULT_SNAPSHOT_MAX_AGE_HOURS = 30;

const REQUIRED_REFRESH_ENV = Object.freeze([
  "TICKETMASTER_API_KEY",
  "MEETUP_CLIENT_ID",
  "MEETUP_MEMBER_ID",
  "MEETUP_KID",
  "MEETUP_PRIVATE_KEY",
]);

function ageHours(timestamp, now) {
  const then = Date.parse(String(timestamp || ""));
  if (!Number.isFinite(then)) return null;
  return (now.getTime() - then) / 3_600_000;
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
    if (!result || result.status === "rejected") {
      return {
        id: source.id,
        label: source.label,
        critical: Boolean(source.critical),
        status: "error",
        count: 0,
        error: result?.reason?.message || String(result?.reason || "source did not run"),
      };
    }

    const count = Array.isArray(result.value) ? result.value.length : 0;
    return {
      id: source.id,
      label: source.label,
      critical: Boolean(source.critical),
      status: count > 0 ? "ok" : "empty",
      count,
      error: null,
    };
  });
}

export function criticalSourceProblems(sourceHealth) {
  return sourceHealth
    .filter((source) => source.critical && source.status !== "ok")
    .map((source) => `${source.label} is ${source.status}${source.error ? `: ${source.error}` : ""}`);
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
