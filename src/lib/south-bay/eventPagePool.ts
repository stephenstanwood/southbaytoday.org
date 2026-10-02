// Current snapshots still contain the day that just ended until the next
// refresh archives it. Both public event routes must keep that day resolving.
interface EventPageRecord {
  id?: string | null;
  title?: string | null;
  date?: string | null;
  time?: string | null;
  venue?: string | null;
  city?: string | null;
}

export function eventPagePool<T extends EventPageRecord>(current: T[], archived: T[], todayPt: string): T[] {
  const cutoff = new Date(`${todayPt}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);
  const cutoffPt = cutoff.toISOString().slice(0, 10);
  const byOccurrence = new Map<string, T>();

  for (const [rows, archiveOnly] of [[current, false], [archived, true]] as const) {
    for (const event of rows) {
      if (!event.title || !event.time || !event.date || !/^\d{4}-\d{2}-\d{2}$/.test(event.date)) continue;
      if (event.date < cutoffPt || (archiveOnly && event.date >= todayPt)) continue;
      // A series can reuse an id on different dates; distinct sessions on the
      // same day can share a title. Keep both, while preferring the current
      // snapshot when the archive holds a copy of the same occurrence.
      const key = event.id
        ? JSON.stringify([event.date, event.id])
        : JSON.stringify([event.date, event.title, event.time, event.venue, event.city]);
      if (!byOccurrence.has(key)) byOccurrence.set(key, event);
    }
  }
  return [...byOccurrence.values()];
}
