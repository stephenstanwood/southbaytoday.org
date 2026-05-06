import type { APIRoute } from "astro";
import config from "../../../data/south-bay/newsletter-config.json";

export const prerender = false;

const RESEND_BASE = "https://api.resend.com";

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let body: { email?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid JSON");
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError(400, "valid email required");
  }

  const audienceId = (config as { audienceId?: string | null }).audienceId;
  if (!audienceId) return jsonError(500, "newsletter audience not configured");

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return jsonError(500, "RESEND_API_KEY not set");

  const [first, ...rest] = (body.name ?? "").trim().split(/\s+/).filter(Boolean);

  const res = await fetch(`${RESEND_BASE}/audiences/${audienceId}/contacts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      first_name: first || undefined,
      last_name: rest.join(" ") || undefined,
      unsubscribed: false,
    }),
  });

  const text = await res.text();
  let detail: unknown = null;
  try { detail = JSON.parse(text); } catch { detail = text; }

  if (res.ok) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Already subscribed — treat as success so we don't surface that to a stranger.
  const message = typeof detail === "object" && detail && "message" in detail
    ? String((detail as { message: unknown }).message)
    : String(text);
  if (/already exists/i.test(message)) {
    return new Response(JSON.stringify({ ok: true, alreadySubscribed: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return jsonError(res.status || 500, message || "subscribe failed");
};
