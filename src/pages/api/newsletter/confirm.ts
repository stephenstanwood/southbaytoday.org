import type { APIRoute } from "astro";
import config from "../../../data/south-bay/newsletter-config.json";
import { RESEND_BASE, readConfirmDetails, serverEnv } from "../../../lib/south-bay/newsletterSignup";
import { trackNewsletterStage } from "../../../lib/south-bay/newsletterAnalytics.server";

export const prerender = false;

function redirect(status: "confirmed" | "expired" | "error") {
  const baseUrl = serverEnv("SITE") || "https://southbaytoday.org";
  return new Response(null, {
    status: 302,
    headers: { Location: new URL(`/newsletters?subscription=${status}`, baseUrl).toString() },
  });
}

export const GET: APIRoute = async ({ url, request }) => {
  const details = readConfirmDetails(url.searchParams.get("token") || "");
  if (!details) return redirect("expired");
  const { email, context } = details;

  const audienceId = (config as { audienceId?: string | null }).audienceId;
  const apiKey = serverEnv("RESEND_API_KEY");
  if (!audienceId || !apiKey) return redirect("error");

  const contactUrl = `${RESEND_BASE}/audiences/${audienceId}/contacts/${encodeURIComponent(email)}`;
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  let contact: { unsubscribed?: boolean } | null = null;
  try {
    const existing = await fetch(contactUrl, { headers, signal: AbortSignal.timeout(3000) });
    if (existing.ok) contact = await existing.json();
  } catch { /* A status lookup must not prevent activation. */ }
  try {
    // A repeated click on a confirmed address succeeds without another conversion.
    if (contact?.unsubscribed === false) return redirect("confirmed");

    const res = await fetch(contactUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ unsubscribed: false }),
    });
    // If the status lookup failed, still activate the reader but don't invent
    // a new conversion when we cannot distinguish one from a repeated click.
    if (res.ok && contact?.unsubscribed === true) {
      await trackNewsletterStage("Newsletter confirmed", context, request);
    }
    return redirect(res.ok ? "confirmed" : "error");
  } catch {
    return redirect("error");
  }
};
