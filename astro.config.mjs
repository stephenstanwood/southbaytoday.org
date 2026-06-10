// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// Past-dated /event/ and /events/ URLs stay out of the sitemap — the pages
// themselves keep resolving for ~30 days (grace banner) but crawlers shouldn't
// be steered at them.
const buildDayPt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const isPastDatedUrl = (page) => {
  const m = page.match(/\/events?\/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] < buildDayPt : false;
};

// https://astro.build/config
export default defineConfig({
  site: 'https://southbaytoday.org',
  trailingSlash: 'never',
  output: 'static',
  adapter: vercel(),
  integrations: [react(), sitemap({
    filter: (page) => !page.includes('/logo-preview') && !page.includes('/admin') && !isPastDatedUrl(page),
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
