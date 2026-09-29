export const prerender = false;

import type { APIRoute } from "astro";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalizeSharedPlan } from "../lib/south-bay/canonicalizeCard.mjs";

// Match the request-rendered /plan/[id] route's data and validity check.
// These public saved plans are linked from the newsletter archive.
export const GET: APIRoute = () => {
  try {
    const plans = JSON.parse(readFileSync(join(process.cwd(), "src/data/south-bay/shared-plans.json"), "utf8"));
    const urls = Object.entries(plans)
      .filter(([id, plan]) => /^[a-zA-Z0-9_-]+$/.test(id) && canonicalizeSharedPlan(plan))
      .map(([id]) => `  <url><loc>https://southbaytoday.org/plan/${id}</loc></url>`);
    return new Response([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls,
      '</urlset>',
    ].join("\n"), {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    });
  } catch {
    return new Response("Plan sitemap temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
};
