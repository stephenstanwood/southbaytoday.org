export const prerender = false;

import type { APIRoute } from 'astro';
import { rateLimit, rateLimitResponse } from '../../lib/rateLimit';

const TYPE_META: Record<string, { emoji: string; label: string; color: number }> = {
  event:      { emoji: '📅', label: 'Event Submission', color: 0x3b82f6 },
  tip:        { emoji: '📰', label: 'News Tip',         color: 0x22c55e },
  correction: { emoji: '⚠️',  label: 'Correction',       color: 0xf97316 },
  feedback:   { emoji: '💬', label: 'Feedback',          color: 0x8b5cf6 },
};

// Keep reader submissions in #feedback for the triage routine without
// buzzing Stephen's devices for every routine correction or suggestion.
// Suspicious or ambiguous submissions are escalated separately by DM.
const DISCORD_SUPPRESS_NOTIFICATIONS = 1 << 12;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // Reader-facing endpoint that fans out to a Discord webhook — rate-limit so
  // a single client can't flood the feedback channel.
  if (!rateLimit(clientAddress, 5)) return rateLimitResponse();

  const webhookUrl = import.meta.env.DISCORD_FEEDBACK_WEBHOOK;
  if (!webhookUrl) {
    return new Response(JSON.stringify({ error: 'Not configured' }), { status: 500 });
  }

  let body: { type?: string; message?: string; page?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { type = 'feedback', message, page } = body;
  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'Message required' }), { status: 400 });
  }
  if (message.length > 5000) {
    return new Response(JSON.stringify({ error: 'Message too long' }), { status: 413 });
  }

  const meta = TYPE_META[type] ?? TYPE_META.feedback;
  const pageStr = page ? ` — ${page}` : '';

  const payload = {
    flags: DISCORD_SUPPRESS_NOTIFICATIONS,
    allowed_mentions: { parse: [] },
    content: `${meta.emoji} **${meta.label}**${pageStr}\n> ${message.trim().slice(0, 1800).replace(/\n/g, '\n> ')}`,
    embeds: [{
      title: `${meta.emoji} ${meta.label}`,
      description: message.trim().slice(0, 2000),
      color: meta.color,
      fields: page ? [{ name: 'URL', value: page.slice(0, 200), inline: false }] : [],
      timestamp: new Date().toISOString(),
      footer: { text: 'South Bay Today reader submission' },
    }],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error('Discord webhook failed:', res.status, await res.text());
      return new Response(JSON.stringify({ error: 'Webhook failed' }), { status: 502 });
    }
  } catch (err) {
    console.error('Discord webhook error:', err);
    return new Response(JSON.stringify({ error: 'Network error' }), { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
