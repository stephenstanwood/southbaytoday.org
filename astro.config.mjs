// @ts-check
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { resolveRetired } from './src/lib/south-bay/eventSlugLedger.mjs';

// Past-dated /event/ and /events/ URLs stay out of the sitemap — the pages
// themselves keep resolving for the archive window (90 days, grace banner) but crawlers shouldn't
// be steered at them.
const buildDayPt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const isPastDatedUrl = (/** @type {string} */ page) => {
  const m = page.match(/\/events?\/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] < buildDayPt : false;
};

// council-page lastmod: real per-city freshness (last summarized meeting)
// where it's cheap to reach from a src/data JSON already on disk; every other
// URL falls back to the build date, which still beats shipping no <lastmod>.
/** @type {Record<string, string>} */
let govLastmodByCity = {};
try {
  const digestsPath = fileURLToPath(new URL('./src/data/south-bay/digests.json', import.meta.url));
  const digests = JSON.parse(readFileSync(digestsPath, 'utf-8'));
  govLastmodByCity = Object.fromEntries(
    Object.entries(digests).map(([city, d]) => [city, /** @type {{ meetingDateIso?: string }} */ (d).meetingDateIso ?? '']),
  );
} catch {
  // digests.json not present at config-eval time — sitemap just falls back
  // to the build date for /gov/ pages too.
}
const buildDate = new Date().toISOString();

// /event/<slug> URLs that left the feed before their date: 301 the ones with
// a live successor (re-titled, deduped against a better source), and keep the
// rest out of the sitemap — /event/[slug].astro builds them as noindex
// "no longer listed" leaves. See src/lib/south-bay/eventSlugLedger.mjs.
/** @type {Record<string, string>} */
let retiredRedirects = {};
const retiredLeafPaths = new Set();
try {
  const readData = (/** @type {string} */ name) =>
    JSON.parse(readFileSync(fileURLToPath(new URL(`./src/data/south-bay/${name}`, import.meta.url)), 'utf-8'));
  const { redirects, orphans } = resolveRetired(
    readData('events-retired.json'),
    readData('upcoming-events.json').events,
    readData('events-archive.json').events,
    buildDayPt,
  );
  retiredRedirects = Object.fromEntries([...redirects].map(([from, to]) => [`/event/${from}`, `/event/${to}`]));
  for (const { slug } of orphans) retiredLeafPaths.add(`/event/${slug}`);
} catch {
  // No ledger yet (or unreadable) — the build just ships no redirects.
}

// https://astro.build/config
export default defineConfig({
  site: 'https://southbaytoday.org',
  trailingSlash: 'never',
  output: 'static',
  adapter: vercel(),
  redirects: retiredRedirects,
  integrations: [react(), sitemap({
    // Newsletter issues live in Blob and are listed at request time by their
    // own sitemap. Keep that sitemap out of the page URL set while including
    // it as a child of the canonical sitemap index.
    customSitemaps: ['https://southbaytoday.org/sitemap-newsletters.xml'],
    filter: (page) => !page.includes('/logo-preview')
      && !page.includes('/admin')
      && !page.endsWith('/sitemap-newsletters.xml')
      && !isPastDatedUrl(page)
      && !retiredLeafPaths.has(new URL(page).pathname),
    serialize(item) {
      const govMatch = item.url.match(/\/gov\/([a-z-]+)\/?$/);
      const cityLastmod = govMatch ? govLastmodByCity[govMatch[1]] : undefined;
      return { ...item, lastmod: cityLastmod || buildDate };
    },
  })],
  vite: {
    // @ts-ignore - tailwindcss/vite type mismatch with astro's bundled vite
    plugins: [tailwindcss()],
    esbuild: {
      jsxInject: `import React from 'react'`,
    },
    server: {
      fs: {
        // Three levels up so a git worktree at .claude/worktrees/<name> can
        // resolve node_modules from the main project root. From a normal
        // checkout this just whitelists the parent dir, which is harmless.
        allow: ['../../..']
      }
    }
  }
});
