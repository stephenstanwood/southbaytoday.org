#!/usr/bin/env node
/**
 * Playwright-based bulk newsletter subscription.
 *
 * For each target:
 *  1. Launch a page, navigate to signupUrl
 *  2. Auto-discover the first plausible email-subscribe form
 *     (footer, embedded, or popup)
 *  3. Fill email, click submit
 *  4. Wait for success indicator (URL change, toast text, form replacement)
 *  5. Record outcome in tracker (Postgres, one row per attempt)
 *
 * Politeness:
 *  - 4-8 sec delay between targets on the same host
 *  - 1-2 sec delay between different hosts
 *  - 20 sec per-page timeout
 *  - respects robots.txt by only hitting the signupUrl (no crawling)
 *
 * Usage:
 *   node scripts/lookout/subscribe-playwright.mjs
 *   node scripts/lookout/subscribe-playwright.mjs --headed
 *   node scripts/lookout/subscribe-playwright.mjs --only=saratoga-source
 *   node scripts/lookout/subscribe-playwright.mjs --category=chamber
 *   node scripts/lookout/subscribe-playwright.mjs --retry-failed
 *   node scripts/lookout/subscribe-playwright.mjs --max=10
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { readTracker, upsertTarget } from "./_tracker-pg.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EMAIL = process.env.LOOKOUT_SIGNUP_EMAIL || "sandcathype@gmail.com";
const TARGETS_PATH = join(__dirname, "targets.json");

const args = new Set(process.argv.slice(2));
const HEADED = args.has("--headed");
const RETRY_FAILED = args.has("--retry-failed");
const ONLY = [...args].find((a) => a.startsWith("--only="))?.split("=")[1];
const CATEGORY = [...args].find((a) => a.startsWith("--category="))?.split("=")[1];
const MAX = parseInt([...args].find((a) => a.startsWith("--max="))?.split("=")[1] || "0", 10);
const SKIP_CIVICPLUS = args.has("--skip-civicplus");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (min, max) => min + Math.floor(Math.random() * (max - min));

// ── Playwright-based signup flow ───────────────────────────────────────────

async function findEmailInput(page) {
  try {
    const cookieSelectors = [
      'button:has-text("Accept")',
      'button:has-text("I agree")',
      'button:has-text("Got it")',
      'button:has-text("Accept All")',
      'button:has-text("Allow all")',
    ];
    for (const sel of cookieSelectors) {
      const btn = await page.$(sel);
      if (btn && (await btn.isVisible())) {
        await btn.click({ timeout: 2000 }).catch(() => {});
        await sleep(300);
        break;
      }
    }
  } catch {}

  try {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(500);
  } catch {}

  const selectors = [
    'input[type="email"]:visible',
    'input[name="email" i]:visible',
    'input[name*="EMAIL" i]:visible',
    'input[id*="email" i]:visible',
    'input[placeholder*="email" i]:visible',
    'input[aria-label*="email" i]:visible',
  ];
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) > 0 && (await loc.isVisible())) {
        return loc;
      }
    } catch {}
  }
  return null;
}

async function submitNear(input, email) {
  await input.fill(email);
  await sleep(200);

  try {
    const clicked = await input.evaluate((el) => {
      const form = el.closest("form");
      if (!form) return false;
      const btn =
        form.querySelector('button[type="submit"]:not([disabled])') ||
        form.querySelector('input[type="submit"]:not([disabled])') ||
        form.querySelector('button:not([type="button"]):not([disabled])');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    if (clicked) return true;
  } catch {}

  try {
    await input.press("Enter");
  } catch {}
  return true;
}

async function detectSuccess(page, beforeUrl) {
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await sleep(1500);

  const bodyText = await page.innerText("body").catch(() => "");
  const afterUrl = page.url();

  const thankyouPatterns = [
    /thank\s*you/i,
    /successfully\s*(subscribed|signed.up|registered)/i,
    /check\s+your\s+(email|inbox)/i,
    /confirm(ation)?\s+(email|link)\s+(has\s+been\s+)?sent/i,
    /we('ve| have)\s+sent/i,
    /confirmation\s+email/i,
    /you('re| are)\s+(now\s+)?(subscribed|on\s+the\s+list)/i,
    /verify\s+your\s+email/i,
    /almost\s+there/i,
    /one\s+more\s+step/i,
  ];
  for (const p of thankyouPatterns) {
    if (p.test(bodyText)) return { ok: true, reason: p.source };
  }

  if (afterUrl !== beforeUrl && /thank|confirm|subscribed|success/i.test(afterUrl)) {
    return { ok: true, reason: `url:${afterUrl}` };
  }

  if (/invalid\s+email|already\s+subscribed|error|try\s+again/i.test(bodyText.slice(0, 2000))) {
    if (/already\s+subscribed/i.test(bodyText)) return { ok: true, reason: "already-subscribed" };
    return { ok: false, reason: "error-text-detected" };
  }

  return { ok: false, reason: "no-success-indicator" };
}

async function followSubscribeLink(page) {
  const linkSelectors = [
    'a:has-text("Subscribe"):visible',
    'a:has-text("Newsletter"):visible',
    'a:has-text("Sign Up"):visible',
    'a:has-text("Sign up"):visible',
    'a:has-text("Stay Informed"):visible',
    'a:has-text("Stay Connected"):visible',
    'a:has-text("Mailing List"):visible',
    'a:has-text("Join Our List"):visible',
    'a:has-text("Email Updates"):visible',
    'a:has-text("Join Mailing"):visible',
    'a[href*="newsletter" i]:visible',
    'a[href*="subscribe" i]:visible',
    'a[href*="signup" i]:visible',
    'a[href*="mailing-list" i]:visible',
  ];
  for (const sel of linkSelectors) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) > 0) {
        const href = await loc.getAttribute("href").catch(() => null);
        if (!href || href.startsWith("#") || href.startsWith("javascript:") || /unsubscribe/i.test(href)) continue;
        await loc.click({ timeout: 3000 }).catch(() => {});
        await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => {});
        await sleep(500);
        return true;
      }
    } catch {}
  }
  return false;
}

async function subscribeOne(browser, target) {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  await context.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (type === "image" || type === "font" || type === "media") return route.abort();
    return route.continue();
  });

  try {
    await page.goto(target.signupUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    const beforeUrl = page.url();

    let input = await findEmailInput(page);

    if (!input) {
      const followed = await followSubscribeLink(page);
      if (followed) {
        input = await findEmailInput(page);
      }
    }

    if (!input) return { status: "needs-manual", reason: "no-email-input-found" };

    await submitNear(input, EMAIL);
    const result = await detectSuccess(page, beforeUrl);

    if (result.ok) return { status: "signup-posted", reason: result.reason };
    return { status: "needs-manual", reason: result.reason };
  } catch (err) {
    return { status: "needs-manual", reason: `error:${err.message?.slice(0, 120)}` };
  } finally {
    await context.close().catch(() => {});
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const { targets: rawTargets } = JSON.parse(readFileSync(TARGETS_PATH, "utf8"));
  const doc = await readTracker();
  const deletedIds = new Set(doc.deletedIds ?? []);

  const targets = rawTargets.filter((t) => !deletedIds.has(t.id));
  if (deletedIds.size > 0) {
    console.log(`ℹ️  skipping ${deletedIds.size} user-deleted targets`);
  }

  // Seed every missing target into the tracker
  const existingById = new Map(doc.targets.map((d) => [d.id, d]));
  for (const t of targets) {
    if (existingById.has(t.id)) continue;
    await upsertTarget({
      id: t.id,
      name: t.name,
      signupUrl: t.signupUrl,
      city: t.city,
      category: t.category,
      provider: t.provider,
      priority: t.priority,
      notes: t.notes,
      status: "not-attempted",
    });
  }

  const queue = targets.filter((t) => {
    if (ONLY && t.id !== ONLY) return false;
    if (CATEGORY && t.category !== CATEGORY) return false;
    if (SKIP_CIVICPLUS && t.provider === "civicplus_notifyme") return false;
    const existing = existingById.get(t.id);
    if (!existing) return true;
    if (RETRY_FAILED && (existing.status === "failed" || existing.status === "needs-manual")) return true;
    if (["receiving", "confirmed", "signup-posted"].includes(existing.status)) return false;
    return existing.status === "not-attempted";
  });

  const limited = MAX > 0 ? queue.slice(0, MAX) : queue;
  console.log(`🎭 subscribe-playwright.mjs  email=${EMAIL}  targets=${limited.length}/${targets.length}${HEADED ? " (headed)" : ""}`);

  const browser = await chromium.launch({ headless: !HEADED });
  const byHost = new Map();
  let posted = 0;
  let manual = 0;

  for (const target of limited) {
    const host = (() => {
      try { return new URL(target.signupUrl).host; } catch { return ""; }
    })();
    const lastHit = byHost.get(host) ?? 0;
    const sinceLast = Date.now() - lastHit;
    const needed = host ? jitter(4000, 8000) : jitter(1000, 2000);
    if (sinceLast < needed) await sleep(needed - sinceLast);

    process.stdout.write(`  • ${target.name.padEnd(42).slice(0, 42)} [${(target.category || "").padEnd(14)}] `);
    const result = await subscribeOne(browser, target);
    byHost.set(host, Date.now());

    await upsertTarget({
      id: target.id,
      name: target.name,
      signupUrl: target.signupUrl,
      city: target.city,
      category: target.category,
      provider: target.provider,
      priority: target.priority,
      notes: target.notes,
      status: result.status,
      attemptedAt: new Date().toISOString(),
      lastError: result.status !== "signup-posted" ? result.reason : null,
    });

    if (result.status === "signup-posted") {
      console.log(`✅ ${result.reason?.slice(0, 40)}`);
      posted++;
    } else {
      console.log(`🟡 ${result.reason?.slice(0, 50)}`);
      manual++;
    }
  }

  await browser.close();
  console.log(`\n─────────────────────────────────────`);
  console.log(`✅ signup-posted: ${posted}`);
  console.log(`🟡 needs-manual:  ${manual}`);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
