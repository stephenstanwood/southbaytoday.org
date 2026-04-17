import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { head, put, del } from "@vercel/blob";
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const env = readFileSync(join(__dirname, "../../.env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}
const token = process.env.BLOB_READ_WRITE_TOKEN;
const KEY = "lookout/newsletter-tracker.json";
const category = process.argv[2];
if (!category) { console.error("usage: bulk-delete-category.mjs <category>"); process.exit(1); }

const meta = await head(KEY, { token });
const doc = await (await fetch(`${meta.url}?_cb=${Date.now()}`)).json();
const toRemove = doc.targets.filter(t => t.category === category);
console.log(`removing ${toRemove.length} rows from category '${category}':`);
for (const t of toRemove) console.log(`  - ${t.id}  ${t.name}`);
const ids = toRemove.map(t => t.id);
doc.deletedIds = Array.from(new Set([...(doc.deletedIds ?? []), ...ids]));
doc.targets = doc.targets.filter(t => t.category !== category);
doc.updatedAt = new Date().toISOString();

try { await del(KEY, { token }); } catch {}
await put(KEY, JSON.stringify(doc, null, 2), {
  access: "public", token, allowOverwrite: true, cacheControlMaxAge: 0, contentType: "application/json",
});
console.log(`targets now: ${doc.targets.length}, tombstones: ${doc.deletedIds.length}`);
