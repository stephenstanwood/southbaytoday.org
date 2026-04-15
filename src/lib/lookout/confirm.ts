/**
 * Auto-confirmation logic for inbound mailing-list subscriptions.
 *
 * When we subscribe the inbound address to a newsletter, the provider sends
 * a "please click this link to confirm" email. Rather than running a separate
 * script on a cron, we handle it inline in the intake webhook: detect the
 * subject, find the best-scoring link in the HTML body, GET it.
 *
 * This mirrors the logic in scripts/confirm-subscriptions.mjs — keep the two
 * in sync if one changes.
 */

import type { InboundEmail } from "./types.js";

const CONFIRM_SUBJECTS = /confirm|verify|opt.?in|activate|validate|needed/i;
const ACK_SUBJECTS = /you have been subscribed|successfully subscribed|welcome to/i;

export interface ConfirmEmailInput extends InboundEmail {
  /** Raw HTML body, if available. confirm logic prefers HTML hrefs to plain-text URLs. */
  html?: string;
}

export type ConfirmOutcome =
  | { kind: "not-a-confirmation" }
  | { kind: "ack-only" }
  | { kind: "no-link-found" }
  | { kind: "clicked"; url: string; status: number }
  | { kind: "click-failed"; url: string; error: string };

export function looksLikeConfirmation(subject: string): boolean {
  if (!subject) return false;
  if (ACK_SUBJECTS.test(subject)) return false;
  return CONFIRM_SUBJECTS.test(subject);
}

export function looksLikeAck(subject: string): boolean {
  return ACK_SUBJECTS.test(subject ?? "");
}

/**
 * Extract the highest-scoring confirmation URL from an email body.
 * Returns null if no plausible confirm link was found.
 */
export function findConfirmationLink(html: string, text: string): string | null {
  const hrefMatches = [...(html || "").matchAll(/href=["'](https?:\/\/[^"'<>\s]+)["']/gi)].map((m) => m[1]);
  const textMatches = (text || "").match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  const urls = Array.from(new Set([...hrefMatches, ...textMatches]));

  const ranked = urls
    .map((u) => ({ u, s: scoreUrl(u) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);

  if (ranked.length === 0) return null;
  return ranked[0].u.replace(/&amp;/g, "&");
}

function scoreUrl(u: string): number {
  let s = 0;
  if (/confirm/i.test(u)) s += 10;
  if (/verify|validate|activate/i.test(u)) s += 8;
  if (/subscri/i.test(u)) s += 6;
  if (/optin|opt-in/i.test(u)) s += 6;
  if (/unsubscri/i.test(u)) s -= 20; // never click unsubscribe
  if (/\.(png|jpg|gif|css|js|woff)(\?|$)/i.test(u)) s -= 20;
  if (/w3\.org|schema\.org/i.test(u)) s -= 20;
  return s;
}

/**
 * Try to auto-confirm a subscription email. Returns a structured outcome
 * describing what happened — caller logs it.
 */
export async function tryAutoConfirm(email: ConfirmEmailInput): Promise<ConfirmOutcome> {
  if (looksLikeAck(email.subject)) return { kind: "ack-only" };
  if (!looksLikeConfirmation(email.subject)) return { kind: "not-a-confirmation" };

  const url = findConfirmationLink(email.html ?? "", email.body);
  if (!url) return { kind: "no-link-found" };

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "SouthBayToday/1.0 (+https://southbaytoday.org)" },
    });
    return { kind: "clicked", url, status: res.status };
  } catch (err) {
    return { kind: "click-failed", url, error: (err as Error).message };
  }
}
