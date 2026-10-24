export function sourceTaskId(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Reviewed source retirements, not a list inferred from missing tasks. Both
// LibCal tenants excluded collection in robots.txt on 2026-10-24; their old
// 217 rows must not force another fetch or make every subsequent run regress.
// Keep unknown removals in the baseline, and protect these sources normally
// if an approved channel ever restores their tasks.
const RETIRED_SOURCES = new Map([
  ["Mountain View Public Library", "mountain-view-public-library"],
  ["Los Gatos Library", "los-gatos-library"],
]);

export function inspectPlaywrightCoverage({ previous, events, tasks }) {
  const activeTasks = new Set(tasks.map((task) => sourceTaskId(task.name)));
  const retiredSources = new Set([...RETIRED_SOURCES]
    .filter(([, taskId]) => !activeTasks.has(taskId))
    .map(([source]) => source));
  const previousRows = previous?.events ?? [];
  const comparableRows = previousRows.filter((event) => !retiredSources.has(event.source));
  const excludedRows = previousRows.length - comparableRows.length;
  const excludedSources = new Set(previousRows
    .filter((event) => retiredSources.has(event.source))
    .map((event) => event.source));
  const previousEvents = Number(previous?._meta?.eventCount || previousRows.length)
    - excludedRows;
  const previousSources = Number(previous?._meta?.sources?.length || 0)
    - excludedSources.size;
  const nextSources = new Set(events.map((event) => event.source)).size;

  return {
    previousEvents,
    previousSources,
    nextEvents: events.length,
    nextSources,
    excludedRows,
    excludedSources: [...excludedSources],
    regressed: previousSources >= 10
      && (previousSources - nextSources >= 4 || events.length < previousEvents * 0.6),
  };
}

export function findUnexpectedEmptyRetries({
  tasks = [],
  results = [],
  previous = null,
  today,
}) {
  const previousHealth = new Map(
    (previous?._meta?.sourceHealth ?? []).map((health) => [health.id, health]),
  );
  const previousEvents = Array.isArray(previous?.events) ? previous.events : [];

  return tasks.flatMap((task, index) => {
    const result = results[index];
    if (!result || result.error || (result.events?.length ?? 0) > 0) return [];

    const knownSources = previousHealth.get(sourceTaskId(task.name))?.sources ?? [];
    if (knownSources.length === 0) return [];

    const knownSourceSet = new Set(knownSources);
    const previousFutureEventCount = previousEvents.filter((event) => (
      knownSourceSet.has(event?.source) && String(event?.date || "") >= today
    )).length;
    if (previousFutureEventCount === 0) return [];

    return [{
      index,
      name: task.name,
      knownSources,
      previousFutureEventCount,
    }];
  });
}

export function finalizeUnexpectedEmptyRetry(result, candidate) {
  if (result?.error || (result?.events?.length ?? 0) > 0) return result;
  const sourceLabel = candidate.knownSources.join(", ");
  return {
    events: result?.events ?? [],
    error: `unexpected empty result after retry; previous snapshot still has ${candidate.previousFutureEventCount} future event(s) from ${sourceLabel}`,
  };
}
