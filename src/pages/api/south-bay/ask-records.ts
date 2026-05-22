import type { APIRoute } from "astro";
import { MiniClaude } from "../../../lib/miniClaude";
import { errJson, okJson, fetchWithTimeout, toErrMsg } from "../../../lib/apiHelpers";
import { rateLimit, rateLimitResponse } from "../../../lib/rateLimit";
import { CLAUDE_SONNET, extractText } from "../../../lib/models";
import { CITIES } from "../../../lib/south-bay/cities";
import type { City } from "../../../lib/south-bay/types";

export const prerender = false;

interface StoaRecord {
  id: string | number;
  city: string;
  date: string;
  meetingType: string;
  topic: string;
  title: string;
  excerpt: string;
}

interface Citation {
  city: string;
  date: string;
  meetingType: string;
  topic: string;
  excerpt: string;
}

const VALID_CITY_IDS = new Set<City>(CITIES.map((c) => c.id));
const CITY_ID_TO_NAME: Record<string, string> = Object.fromEntries(
  CITIES.map((c) => [c.id, c.name]),
);

// Tiny in-memory cache so identical follow-up queries (same city + question)
// don't re-pay the Claude call. 30-min TTL is plenty for civic data.
const cache = new Map<string, { ts: number; payload: AskResponse }>();
const CACHE_TTL = 30 * 60 * 1000;

interface AskResponse {
  answer: string;
  followups: string[];
  citations: Citation[];
  totalRecords: number;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!rateLimit(clientAddress, 15)) return rateLimitResponse();

  let body: { city?: string; query?: string };
  try {
    body = await request.json();
  } catch {
    return errJson("Invalid JSON body", 400);
  }

  const cityId = (body.city ?? "").trim().toLowerCase();
  const query = (body.query ?? "").trim();

  if (!cityId || !VALID_CITY_IDS.has(cityId as City)) {
    return errJson("Pick a city to search.", 400);
  }
  if (query.length < 2) return errJson("Query too short.", 400);
  if (query.length > 200) return errJson("Query too long.", 400);

  const cityName = CITY_ID_TO_NAME[cityId];
  const cacheKey = `${cityId}::${query.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return okJson(hit.payload);
  }

  // 1. Pull recent records from Stoa, scoped to the picked city.
  // Send the user query verbatim — Stoa AND-matches keywords, so a single
  // search may miss good context. Try a couple of fallback queries for
  // multi-word natural-language questions to widen recall.
  const records = await searchStoa(cityName, query);
  if (records.length === 0) {
    const payload: AskResponse = {
      answer: `I dug through every recent ${cityName} council meeting and didn't see anything specific about that. Try a different angle — e.g. one of the suggestions below — or ask in plain English about a topic you'd expect council to weigh in on.`,
      followups: ["What's been the biggest housing decision recently?", "Any new park or trail funding?", "What's in the latest budget?"],
      citations: [],
      totalRecords: 0,
    };
    cache.set(cacheKey, { ts: Date.now(), payload });
    return okJson(payload);
  }

  // 2. Build a short, friendly Claude prompt with the records as context.
  const recordsContext = records
    .slice(0, 8)
    .map(
      (r, i) =>
        `[${i + 1}] ${r.date} · ${r.meetingType}${r.topic ? ` (${r.topic})` : ""}\n${truncate(r.excerpt, 800)}`,
    )
    .join("\n\n---\n\n");

  const prompt = `You're a friendly, plain-spoken local guide for South Bay Today. A reader is asking about ${cityName}, CA city government. They asked: "${query}"

I pulled ${records.length} relevant records from recent ${cityName} council meetings, agendas, and transcripts. Read them and answer like a friend who actually attended:

RECORDS:
${recordsContext}

Write a JSON object:
- "answer": 3-5 sentences. Specific (dates, dollar amounts, project names, votes if you see them). Conversational. No "based on the records" preamble. No corporate hedging. If the records only tangentially answer, say so honestly and pivot to what they DO show.
- "followups": exactly 3 short follow-up questions a curious resident might ask next, based on what's in the records. Each under 60 chars. Specific, not generic.

Rules:
- Don't invent facts. Every claim must be grounded in the records above.
- Use exact entity names as they appear in the records. If a record says "Via Transportation, Inc. Doing Business as Nomad Transit LLC," don't shorten to just one half.
- Don't summarize boilerplate (roll call, agenda approval, public comment procedure) as substantive content.
- If the records are mostly procedural (status updates, agenda planning) with no real news, say that plainly and point to where the substance might be.

Output ONLY the JSON. No markdown fences, no preamble.`;

  try {
    const parsed = await completeWithClaude(prompt);

    const payload: AskResponse = {
      answer: (parsed.answer ?? "").trim() || `Found ${records.length} ${cityName} records that touch on this — see the sources below.`,
      followups: Array.isArray(parsed.followups)
        ? parsed.followups.filter((f) => typeof f === "string" && f.length > 0).slice(0, 3)
        : [],
      citations: records.slice(0, 5).map((r) => ({
        city: r.city,
        date: r.date,
        meetingType: r.meetingType,
        topic: r.topic,
        excerpt: truncate(r.excerpt, 220),
      })),
      totalRecords: records.length,
    };

    cache.set(cacheKey, { ts: Date.now(), payload });
    return okJson(payload);
  } catch (e) {
    console.warn("ask-records model fallback:", toErrMsg(e));
    const payload = buildRecordsFallback(cityName, query, records);
    cache.set(cacheKey, { ts: Date.now(), payload });
    return okJson(payload);
  }
};

async function completeWithClaude(prompt: string): Promise<{ answer?: string; followups?: string[] }> {
  const providers: Array<() => Promise<string>> = [];

  if (import.meta.env.MINI_CLAUDE_URL && import.meta.env.MINI_CLAUDE_TOKEN) {
    providers.push(async () => {
      const client = new MiniClaude({
        url: import.meta.env.MINI_CLAUDE_URL,
        token: import.meta.env.MINI_CLAUDE_TOKEN,
      });
      const message = await client.messages.create({
        model: CLAUDE_SONNET,
        max_tokens: 700,
        messages: [{ role: "user", content: prompt }],
      });
      return extractText(message.content);
    });
  }

  if (import.meta.env.ANTHROPIC_API_KEY) {
    providers.push(async () => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": import.meta.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: CLAUDE_SONNET,
          max_tokens: 700,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Anthropic ${res.status}: ${body.slice(0, 300)}`);
      }
      const message = (await res.json()) as { content: Array<{ type: string; text?: string }> };
      return extractText(message.content);
    });
  }

  if (providers.length === 0) {
    throw new Error("No Claude provider configured");
  }

  const errors: string[] = [];
  for (const provider of providers) {
    try {
      const raw = await provider();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Claude returned non-JSON");
      return JSON.parse(jsonMatch[0]) as { answer?: string; followups?: string[] };
    } catch (e) {
      errors.push(toErrMsg(e));
    }
  }

  throw new Error(errors.join(" | "));
}

async function searchStoa(cityName: string, query: string): Promise<StoaRecord[]> {
  // Try the verbatim query first; Stoa AND-matches, so a multi-word question
  // often returns 0. If empty, retry with the longest word from the query as a
  // single keyword fallback so we still surface something relevant.
  const params = new URLSearchParams({ city: cityName, q: query, limit: "12" });
  const candidates: StoaRecord[] = [];
  const primary = preferSubstantive(await stoaFetch(params));
  candidates.push(...primary.all);
  if (primary.substantive.length > 0) return primary.substantive;

  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w))
    .sort((a, b) => b.length - a.length);

  for (const word of tokens.slice(0, 3)) {
    const fp = new URLSearchParams({ city: cityName, q: word, limit: "12" });
    const r = preferSubstantive(await stoaFetch(fp));
    candidates.push(...r.all);
    if (r.substantive.length > 0) return r.substantive;
  }
  return dedupeRecords(candidates).slice(0, 12);
}

async function stoaFetch(params: URLSearchParams): Promise<StoaRecord[]> {
  try {
    const res = await fetchWithTimeout(
      `https://www.stoa.works/api/council-meetings?${params.toString()}`,
      { headers: { "User-Agent": "SouthBayToday/1.0 (ask-records)" } },
      8000,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { records?: StoaRecord[] };
    return data.records ?? [];
  } catch {
    return [];
  }
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

const STOPWORDS = new Set([
  "what", "when", "where", "which", "whose", "about", "any", "the", "are", "have", "with",
  "city", "council", "meeting", "meetings", "this", "that", "from", "into", "they", "them",
  "their", "there", "been", "being", "doing", "going", "would", "should", "could", "tell",
  "show", "give", "find", "look", "know", "want", "need", "make", "made", "much", "many",
  "more", "less", "most", "least", "anything", "something", "nothing",
]);

function preferSubstantive(records: StoaRecord[]): { all: StoaRecord[]; substantive: StoaRecord[] } {
  const all = dedupeRecords(records);
  const substantive = all.filter(isSubstantiveRecord);
  return { all, substantive };
}

function dedupeRecords(records: StoaRecord[]): StoaRecord[] {
  const seen = new Set<string>();
  const out: StoaRecord[] = [];
  for (const record of records) {
    const key = String(record.id ?? `${record.city}-${record.date}-${record.title}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(record);
  }
  return out;
}

function isSubstantiveRecord(record: StoaRecord): boolean {
  const text = `${record.title ?? ""} ${record.excerpt ?? ""}`.trim().toLowerCase();
  if (text.length < 24) return false;
  return !/\b(meeting (?:video|minutes|agenda) available|agenda available|minutes available|call to order|roll call)\b/i.test(text);
}

function buildRecordsFallback(cityName: string, query: string, records: StoaRecord[]): AskResponse {
  const citations = records.slice(0, 5).map((r) => ({
    city: r.city,
    date: r.date,
    meetingType: r.meetingType,
    topic: r.topic,
    excerpt: truncate(r.excerpt || r.title, 220),
  }));
  const top = citations.slice(0, 3);
  const recordWord = records.length === 1 ? "record" : "records";
  const subject = query.replace(/\s+/g, " ").trim();

  const details = top
    .map((r) => {
      const type = r.meetingType ? `${r.meetingType}, ` : "";
      const topic = r.topic && r.topic !== "General" ? ` (${r.topic})` : "";
      return `${formatDate(r.date)} ${type}${r.excerpt}${topic}`;
    })
    .join(" ");

  const answer = records.some(isSubstantiveRecord)
    ? `I found ${records.length} ${cityName} ${recordWord} that match "${subject}." The clearest trail starts here: ${details} This is a records-search answer, so use the source snippets below as the receipts and double-check before quoting.`
    : `I found ${records.length} ${cityName} ${recordWord} matching "${subject}", but the available snippets are thin, mostly meeting notices or generic minutes/video entries. The source rows below are still useful as a starting point, but I don't see enough substance here to make a stronger claim.`;

  const topics = [...new Set(records.map((r) => r.topic).filter(Boolean))].slice(0, 2);

  return {
    answer,
    followups: [
      topics[0] ? `What else is in ${topics[0]}?` : "What changed at the latest meeting?",
      "Show me the budget angle",
      "Any votes or dollar amounts?",
    ],
    citations,
    totalRecords: records.length,
  };
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
