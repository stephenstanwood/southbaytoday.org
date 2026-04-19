/**
 * Soft-delete every tracker row in a category.
 *
 * Usage: node scripts/lookout/bulk-delete-category.mjs <category>
 */

import { sql, markDeleted } from "./_tracker-pg.mjs";

const category = process.argv[2];
if (!category) { console.error("usage: bulk-delete-category.mjs <category>"); process.exit(1); }

const rows = await sql`
  SELECT id, name FROM newsletter_targets
  WHERE category = ${category} AND is_deleted = FALSE
  ORDER BY name
`;
console.log(`removing ${rows.length} rows from category '${category}':`);
for (const r of rows) console.log(`  - ${r.id}  ${r.name}`);
for (const r of rows) await markDeleted(r.id);

const [{ live, deleted }] = await sql`
  SELECT
    COUNT(*) FILTER (WHERE NOT is_deleted)::int AS live,
    COUNT(*) FILTER (WHERE is_deleted)::int AS deleted
  FROM newsletter_targets
`;
console.log(`targets now: ${live} live, ${deleted} tombstones`);
