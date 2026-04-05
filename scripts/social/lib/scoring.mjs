// ---------------------------------------------------------------------------
// South Bay Signal — Candidate Scoring
// Assigns a numeric quality score to each candidate item
// ---------------------------------------------------------------------------

import { SCORE_PENALTIES, ADMIN_NOISE, POLITICAL_BLOCK, INTERNAL_EVENT_SIGNALS } from "./constants.mjs";

function today() {
  return new Date().toISOString().split("T")[0];
}

function daysAway(dateStr) {
  if (!dateStr) return 999;
  const d = new Date(dateStr + "T12:00:00");
  return Math.round((d - new Date()) / 86400000);
}

/**
 * Score a single candidate item.
 * Returns the item with a `score` property added.
 */
export function scoreCandidate(item, history = []) {
  let score = 0;

  // ── Local relevance (0-5) ──
  // Named city = relevant. More specific cities score higher.
  if (item.city) {
    score += 4;
    if (item.venue) score += 1;
  } else {
    score += 1; // still somewhat local (APOD, general)
  }

  // ── Timeliness (0-5) ──
  const days = daysAway(item.date);
  if (days === 0) score += 5;
  else if (days === 1) score += 4;
  else if (days <= 3) score += 3;
  else if (days <= 7) score += 2;
  else if (days <= 14) score += 1;
  // else 0

  // ── Usefulness / actionability (0-5) ──
  if (item.sourceType === "event" || item.sourceType === "weekend-pick") {
    score += 4; // events are inherently actionable
    if (item.time) score += 1; // specific time = more actionable
  } else if (item.sourceType === "restaurant") {
    score += 3;
  } else if (item.sourceType === "around-town" || item.sourceType === "digest") {
    score += 2;
  } else if (item.sourceType === "permit") {
    score += 1;
  } else {
    score += 2;
  }

  // ── Novelty (0-4) ──
  // Weekend picks are pre-curated = high novelty
  if (item.sourceType === "weekend-pick") score += 4;
  // Restaurant openings are novel
  else if (item.sourceType === "restaurant") score += 3;
  // Events from specific sources (jazz, theater) are more novel
  else if (item.source === "San Jose Jazz" || item.source === "MACLA" || item.source === "Heritage Theatre") score += 3;
  // General events
  else if (item.sourceType === "event") score += 2;
  // Civic items
  else score += 1;

  // ── Specificity / named-place (0-3) ──
  if (item.venue && item.venue.length > 3) score += 2;
  if (item.city) score += 1;

  // ── Public appeal (0-3) ──
  const highAppeal = new Set(["arts", "food", "sports", "community", "outdoor"]);
  if (highAppeal.has(item.category)) score += 2;
  if (item.kidFriendly) score += 1;
  if (item.cost === "free") score += 1;
  // Cap at 3
  score = Math.min(score, score); // (appeal capped implicitly by max possible)

  // ── Source confidence (0-3) ──
  score += Math.round((item.confidence || 0.5) * 3);

  // ── Penalties ──

  const titleLower = (item.title || "").toLowerCase();
  const summaryLower = (item.summary || "").toLowerCase();
  const combined = titleLower + " " + summaryLower;

  // Political/polarizing content — hard block
  for (const kw of POLITICAL_BLOCK) {
    if (combined.includes(kw)) {
      score -= 50; // effectively blocks the item
      break;
    }
  }

  // Internal/non-public events — heavy penalty
  for (const kw of INTERNAL_EVENT_SIGNALS) {
    if (combined.includes(kw)) {
      score -= 15;
      break;
    }
  }

  // Events outside South Bay (SF, Oakland, etc.)
  const outsideArea = ["san francisco", "oracle park", "oakland", "berkeley", "sf giants"];
  for (const kw of outsideArea) {
    if (combined.includes(kw)) {
      score -= 20;
      break;
    }
  }

  // Admin noise
  for (const noise of ADMIN_NOISE) {
    if (titleLower.includes(noise) || summaryLower.includes(noise)) {
      score += SCORE_PENALTIES.adminNoise;
      break;
    }
  }

  // Stale items (more than 7 days old)
  if (days < 0 && Math.abs(days) > 7) {
    score += SCORE_PENALTIES.staleItem;
  }

  // Weak summary
  if (!item.summary || item.summary.length < 20) {
    score += SCORE_PENALTIES.weakSummary;
  }

  // Ongoing items are less urgent
  if (item.ongoing) score -= 2;

  // Duplicate check against history
  if (history.length > 0) {
    const isDupe = history.some(
      (h) => h.url && h.url === item.url && h.url !== ""
    );
    if (isDupe) score += SCORE_PENALTIES.recentDuplicate;

    // Fuzzy title match
    const itemWords = new Set(titleLower.split(/\s+/).filter((w) => w.length > 3));
    for (const h of history) {
      const hWords = new Set((h.title || "").toLowerCase().split(/\s+/).filter((w) => w.length > 3));
      if (itemWords.size === 0 || hWords.size === 0) continue;
      const intersection = [...itemWords].filter((w) => hWords.has(w)).length;
      const union = new Set([...itemWords, ...hWords]).size;
      if (union > 0 && intersection / union > 0.6) {
        score += SCORE_PENALTIES.recentDuplicate;
        break;
      }
    }
  }

  return { ...item, score };
}

/**
 * Score all candidates and sort by score descending.
 */
export function scoreAndRank(candidates, history = []) {
  return candidates
    .map((c) => scoreCandidate(c, history))
    .sort((a, b) => b.score - a.score);
}
