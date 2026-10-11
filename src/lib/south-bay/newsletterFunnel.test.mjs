import assert from "node:assert/strict";
import test from "node:test";
import { newsletterPageType, readNewsletterContext } from "./newsletterFunnel.ts";
import { createConfirmToken, readConfirmDetails } from "./newsletterSignup.ts";
import { trackNewsletterStage } from "./newsletterAnalytics.server.ts";
import { POST } from "../../pages/api/newsletter/subscribe.ts";
import { GET } from "../../pages/api/newsletter/confirm.ts";

process.env.NEWSLETTER_CONFIRM_SECRET = "newsletter-funnel-test-secret";
process.env.RESEND_API_KEY = "test-key-not-a-credential";
process.env.VERCEL_ENV = "production";

const context = { pageType: "event", placement: "minimal" };
const email = "reader@example.com";
const headers = { "Content-Type": "application/json", "User-Agent": "test-reader" };
function subscribe(body = {}) {
  return POST({ request: new Request("https://southbaytoday.org/api/newsletter/subscribe", {
    method: "POST", headers, body: JSON.stringify({ email, analytics: context, ...body }),
  }) });
}
function confirm(token) {
  const url = new URL(`https://southbaytoday.org/api/newsletter/confirm?token=${token}`);
  return GET({ url, request: new Request(url, { headers }) });
}
function provider(t, { sendFails = false, patchFails = false, lookupFails = false, analyticsFails = false } = {}) {
  const events = [];
  const calls = [];
  let sentToken;
  let unsubscribed = true;
  t.mock.method(globalThis, "fetch", async (input, init = {}) => {
    const url = String(input);
    const method = init.method || "GET";
    calls.push({ url, method });
    if (url === "https://southbaytoday.org/_vercel/insights/event") {
      if (analyticsFails) throw new Error("analytics offline");
      events.push({ body: JSON.parse(init.body), headers: init.headers });
      return new Response(null, { status: 200 });
    }
    assert.ok(url.startsWith("https://api.resend.com/"), `unexpected external request: ${url}`);
    if (url.endsWith("/emails")) {
      const body = JSON.parse(init.body);
      sentToken = new URL(body.text.match(/https:\/\/\S+/)[0]).searchParams.get("token");
      return Response.json({ id: "email" }, { status: sendFails ? 502 : 200 });
    }
    if (method === "GET") {
      if (lookupFails) throw new Error("lookup offline");
      return Response.json({ email, unsubscribed });
    }
    if (method === "PATCH") {
      if (!patchFails) unsubscribed = false;
      return Response.json({ id: "contact" }, { status: patchFails ? 502 : 200 });
    }
    assert.equal(JSON.parse(init.body).unsubscribed, true, "signup stays pending until confirmation");
    return Response.json({ id: "contact" });
  });
  return { events, calls, token: () => sentToken };
}

test("page families distinguish event details, dated calendars and the event index", () => {
  for (const [path, kind] of [
    ["/", "home"], ["/event/2026-10-12-market", "event"], ["/events/2026-10-12/", "event-day"],
    ["/events", "events"], ["/city/san-jose", "city"], ["/newsletters", "newsletters"], ["/food", "other"],
  ]) assert.equal(newsletterPageType(path), kind);
  for (const bad of [null, {}, "event", { pageType: email, placement: "minimal" }, { pageType: "event", placement: "/private" }]) {
    assert.equal(readNewsletterContext(bad), null);
  }
  assert.deepEqual(readNewsletterContext({ ...context, token: "private", email }), context);
});

test("event signup sends confirmation, preserves attribution, and counts activation once", async (t) => {
  const fake = provider(t);
  assert.equal((await subscribe()).status, 200);
  assert.deepEqual(readConfirmDetails(fake.token()).context, context);
  assert.deepEqual(fake.events.map(({ body }) => body.en), ["Newsletter confirmation sent"]);
  assert.match((await confirm(fake.token())).headers.get("location"), /subscription=confirmed$/);
  assert.match((await confirm(fake.token())).headers.get("location"), /subscription=confirmed$/);
  assert.equal(fake.calls.filter(({ method }) => method === "PATCH").length, 1);
  assert.deepEqual(fake.events.map(({ body }) => body.en), ["Newsletter confirmation sent", "Newsletter confirmed"]);
  for (const event of fake.events) {
    assert.deepEqual(event.body.ed, context);
    assert.equal(event.body.o, "https://southbaytoday.org/newsletters");
    assert.equal(JSON.stringify(event).includes(email), false);
    assert.equal(JSON.stringify(event).includes(fake.token()), false);
  }
});

test("honeypot and rejected input never create a contact, email, or accepted metric", async (t) => {
  const fake = provider(t);
  assert.deepEqual(await (await subscribe({ website: "bot.example" })).json(), { ok: true, pending: true });
  assert.equal((await subscribe({ email: "bad" })).status, 400);
  assert.equal(fake.calls.length, 0);
});

test("a failed send never counts as confirmation sent", async (t) => {
  const fake = provider(t, { sendFails: true });
  assert.equal((await subscribe()).status, 502);
  assert.equal(fake.events.length, 0);
});

test("a failed activation never counts as confirmed; a bad token never reaches Resend", async (t) => {
  const fake = provider(t, { patchFails: true });
  assert.match((await confirm("invalid")).headers.get("location"), /subscription=expired$/);
  assert.equal(fake.calls.length, 0);
  assert.match((await confirm(createConfirmToken(email, Date.now(), context))).headers.get("location"), /subscription=error$/);
  assert.equal(fake.events.length, 0);
});

test("tracking opt-out and pre-instrumentation links still work without analytics", async (t) => {
  const fake = provider(t);
  assert.equal((await subscribe({ analytics: null })).status, 200);
  assert.equal(readConfirmDetails(fake.token()).context, null);
  assert.match((await confirm(fake.token())).headers.get("location"), /subscription=confirmed$/);
  assert.equal(fake.events.length, 0);
});

test("failed status lookup still activates without guessing a conversion", async (t) => {
  const fake = provider(t, { lookupFails: true });
  assert.match((await confirm(createConfirmToken(email, Date.now(), context))).headers.get("location"), /subscription=confirmed$/);
  assert.equal(fake.calls.filter(({ method }) => method === "PATCH").length, 1);
  assert.equal(fake.events.length, 0);
});

test("analytics outages cannot fail a signup or activation", async (t) => {
  const fake = provider(t, { analyticsFails: true });
  t.mock.method(console, "warn", () => {});
  assert.equal((await subscribe()).status, 200);
  assert.match((await confirm(fake.token())).headers.get("location"), /subscription=confirmed$/);
});

test("preview and local servers never emit production conversion events", async (t) => {
  const fake = provider(t);
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "preview";
  try { await trackNewsletterStage("Newsletter confirmed", context, new Request("https://preview.example")); }
  finally { process.env.VERCEL_ENV = previous; }
  assert.equal(fake.calls.length, 0);
});
