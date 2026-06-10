// Stable, readable URLs for event detail pages: "<date>-<title-slug>", with a
// deterministic "-2"/"-3" suffix when two same-day events share a title (e.g.
// storytimes at different branches). Title copy-edits change the slug — rare
// and acceptable for short-lived listing pages; ids stay out of URLs because
// upstream id shapes vary by source.

export interface SluggableEvent {
  id?: string | null;
  title?: string | null;
  date?: string | null;
}

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/**
 * Assign every event a unique slug. Collision suffixes are assigned after an
 * id sort so the same event keeps the same slug across nightly regens even if
 * feed order shifts.
 */
export function buildEventSlugs<T extends SluggableEvent>(events: T[]): Map<string, T> {
  const eligible = events
    .filter((e) => e.title && e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
    .slice()
    .sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")));

  const bySlug = new Map<string, T>();
  for (const e of eligible) {
    const base = `${e.date}-${slugifyTitle(e.title as string)}`;
    if (!base || base === e.date) continue; // title slugged to nothing
    let slug = base;
    let n = 2;
    while (bySlug.has(slug)) {
      slug = `${base}-${n}`;
      n += 1;
    }
    bySlug.set(slug, e);
  }
  return bySlug;
}

/** slug for one event, consistent with buildEventSlugs (no collision suffix). */
export function eventSlugBase(e: SluggableEvent): string | null {
  if (!e.title || !e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return null;
  const t = slugifyTitle(e.title);
  return t ? `${e.date}-${t}` : null;
}
