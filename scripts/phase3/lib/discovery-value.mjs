// scripts/phase3/lib/discovery-value.mjs
//
// Deterministic pre-LLM scoring and filtering layer.
//
// WHY THIS EXISTS: before this module, the "no evergreen brands / no
// aggregators / discovery-value litmus test" rules lived only inside the
// LLM prompt (curation-rules.mjs). That meant:
//   1. Evergreen/aggregator junk consumed LLM context — buildPrompt caps at
//      15 items in ARRIVAL ORDER, so junk could crowd out real candidates
//      before the model ever saw them.
//   2. Enforcement depended on a 3B model following instructions, which is
//      probabilistic. A name-match against a blocklist is deterministic.
//
// This module runs between gathering (search-providers) and the LLM
// (discover.mjs):
//   - HARD DROP: aggregator domains (competitors — their listings are
//     recycled content, exactly what the curation philosophy excludes)
//   - HARD DROP: evergreen brands by name match (YC, Techstars, etc. —
//     imported from curation-rules.mjs so there's one list, not two)
//   - SCORE the rest by signal heuristics, sort descending, return all —
//     discover.mjs's slice(0,15) then keeps the BEST 15, not the first 15.
//
// The LLM prompt rules stay as a second layer (the litmus test needs
// judgment a regex can't encode), but the deterministic layer means the
// model's context is spent only on plausible candidates.

import { EVERGREEN_BRANDS } from "../curation-rules.mjs";

// ─── Hard-drop lists ──────────────────────────────────────────────────────────

// Aggregator/competitor domains. Content from these is recycled listings —
// the "no common opportunities" guideline exists precisely because these
// sites make common opportunities easy to find. Discovering FROM them
// guarantees zero discovery value.
export const AGGREGATOR_DOMAINS = [
  "opportunitydesk.org",
  "opportunitiesforafricans.com",
  "oyaop.com",
  "profellow.com",
  "scholarshipsandgrants.us",
  "scholarships.com",
  "fastweb.com",
  "scholarshipportal.com",
  "findaphd.com",
  "opportunitiescircle.com",
  "youthop.com",
  "mladiinfo.eu",
  "heysuccess.com",
  "opportunitycorners.com",
  "afterschoolafrica.com",
  "developmentaid.org",
  "fundsforngos.org",
  "grantwatch.com",       // paid gateway — listings behind paywall
  "indeed.com",           // generic job board — everything here is findable
  "glassdoor.com",
  "ziprecruiter.com",
  "simplyhired.com",
  "wellfound.com",        // borderline, but startup jobs here are widely indexed
  "linkedin.com",         // explicitly excluded per project constraints
];

// Additional evergreen name fragments beyond curation-rules.mjs's brand
// list — lowercase substrings matched against title text. These are program
// *names* whose current cohort is always the #1 Google result for the name,
// i.e. they fail the litmus test by definition.
const EVERGREEN_TITLE_FRAGMENTS = [
  "google summer of code",
  "gsoc",
  "outreachy",
  "mlh fellowship",
  "erasmus mundus",
  "fulbright",           // globally famous; anyone eligible already knows it
  "rhodes scholarship",
  "chevening",
  "daad scholarship",    // extremely well-indexed
  "commonwealth scholarship",
];

// ─── Signal heuristics ────────────────────────────────────────────────────────

// Domain-pattern scores. Positive = likely primary source, negative = likely
// low-signal. Applied to the candidate's URL hostname.
const DOMAIN_SIGNALS = [
  { pattern: /\.gov(\.[a-z]{2})?$/i, score: 30, why: "government domain" },
  { pattern: /\.edu$|\.ac\.[a-z]{2}$|\.edu\.[a-z]{2}$/i, score: 25, why: "university domain" },
  { pattern: /\.org$/i, score: 10, why: "org domain (often foundations)" },
  { pattern: /grants\.gov|nsf\.gov|darpa\.mil|europa\.eu/i, score: 20, why: "known grant portal" },
  { pattern: /jobs\.ashbyhq\.com|jobs\.lever\.co|boards\.greenhouse\.io/i, score: 15, why: "direct company ATS page" },
  { pattern: /medium\.com|substack\.com|blogspot\.|wordpress\.com/i, score: -15, why: "blog platform — secondhand info" },
  { pattern: /reddit\.com/i, score: -5, why: "community post — needs verification (still useful, small penalty)" },
];

// Text signals in title+snippet. Things that suggest a real, current, open
// opportunity with a deadline vs. generic content.
const TEXT_SIGNALS = [
  { pattern: /deadline|apply by|applications? (close|due)|closing date/i, score: 15, why: "explicit deadline language" },
  { pattern: /applications? (are )?(now )?open|now accepting|call for/i, score: 15, why: "open-call language" },
  { pattern: /\b2026\b|\b2027\b/, score: 10, why: "current-cycle year mentioned" },
  { pattern: /stipend|funded|fully.funded|salary|paid|grant of|award of|[£$€₹]\s?[\d,]+/i, score: 10, why: "funding amount mentioned" },
  { pattern: /first (cohort|edition|batch)|inaugural|newly launched|new programme?/i, score: 20, why: "first-cohort — highest discovery value per curation rules" },
  { pattern: /\b(top 10|best \d+|list of|roundup|ultimate guide)\b/i, score: -20, why: "listicle language — aggregated content" },
  { pattern: /\bexpired\b|closed for|no longer accepting/i, score: -30, why: "explicitly closed" },
];

// Structural signals from the candidate object itself.
function structuralScore(item) {
  let score = 0;
  const reasons = [];
  if (item.fullContent) {
    score += 20;
    reasons.push("full page content available (+20)");
  }
  if (item.queryUsed?.startsWith("primary-source:")) {
    score += 25;
    reasons.push("changed primary source page (+25)");
  }
  if (item.structured || item.queryUsed === "grants.gov" || item.queryUsed === "80000hours") {
    score += 15;
    reasons.push("structured API source (+15)");
  }
  return { score, reasons };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Hard-drop check. Returns a drop reason string, or null if the item passes.
 */
export function shouldDrop(item) {
  let hostname = "";
  try {
    hostname = new URL(item.url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "unparseable URL";
  }

  for (const domain of AGGREGATOR_DOMAINS) {
    if (hostname === domain || hostname.endsWith("." + domain)) {
      return `aggregator/excluded domain: ${domain}`;
    }
  }

  const titleLower = (item.title || "").toLowerCase();
  for (const brand of EVERGREEN_BRANDS) {
    if (titleLower.includes(brand.toLowerCase())) {
      return `evergreen brand in title: ${brand}`;
    }
  }
  for (const fragment of EVERGREEN_TITLE_FRAGMENTS) {
    if (titleLower.includes(fragment)) {
      return `evergreen program in title: ${fragment}`;
    }
  }

  return null;
}

/**
 * Scores a single (non-dropped) item. Higher = more discovery value.
 * Returns { score, reasons } — reasons feed the PR body so a reviewer can
 * see why the pipeline ranked something highly.
 */
export function scoreItem(item) {
  let score = 0;
  const reasons = [];

  let hostname = "";
  try {
    hostname = new URL(item.url).hostname.toLowerCase();
  } catch {
    /* shouldDrop already caught this */
  }

  for (const { pattern, score: s, why } of DOMAIN_SIGNALS) {
    if (pattern.test(hostname)) {
      score += s;
      reasons.push(`${why} (${s > 0 ? "+" : ""}${s})`);
    }
  }

  const text = `${item.title || ""} ${item.snippet || ""} ${(item.fullContent || "").slice(0, 2000)}`;
  for (const { pattern, score: s, why } of TEXT_SIGNALS) {
    if (pattern.test(text)) {
      score += s;
      reasons.push(`${why} (${s > 0 ? "+" : ""}${s})`);
    }
  }

  const structural = structuralScore(item);
  score += structural.score;
  reasons.push(...structural.reasons);

  return { score, reasons };
}

/**
 * Main entry: filters hard-drops, scores the rest, sorts descending.
 *
 * @param {Array} items — raw candidates from search-providers
 * @returns {{
 *   ranked: Array,          // items with .discoveryScore and .discoveryReasons added, best first
 *   dropped: Array<{item, reason}>  // hard-dropped, for PR-body transparency
 * }}
 */
export function rankByDiscoveryValue(items) {
  const ranked = [];
  const dropped = [];

  for (const item of items) {
    const dropReason = shouldDrop(item);
    if (dropReason) {
      dropped.push({ item, reason: dropReason });
      continue;
    }
    const { score, reasons } = scoreItem(item);
    ranked.push({ ...item, discoveryScore: score, discoveryReasons: reasons });
  }

  ranked.sort((a, b) => b.discoveryScore - a.discoveryScore);

  console.log(
    `[discovery-value] ${items.length} in → ${ranked.length} ranked, ${dropped.length} hard-dropped` +
      (dropped.length > 0 ? ` (${dropped.map((d) => d.reason).join("; ")})` : "")
  );

  return { ranked, dropped };
}
