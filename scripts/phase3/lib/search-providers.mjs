// scripts/phase3/lib/search-providers.mjs
//
// Compatibility shim — discover.mjs calls gatherRawCandidates(region) here.
// All real logic has moved to:
//   lib/source-monitor.mjs    — Tier 1: primary source change detection
//   lib/structured-apis.mjs   — Tier 2: grants.gov, 80K Hours, Reddit, CSE
//
// The old implementation searched with generic keywords like "AI fellowship
// 2026 apply" and pulled placeholder RSS feeds. That returned aggregator
// pages (Opportunity Desk, ProFellow) — competitors, not primary sources —
// and gave the model 160-char snippets that were too thin for reliable
// structured extraction. See docs/PHASE3.md for the full diagnosis.
//
// The new pipeline:
//   1. scanPrimarySources    — fetch known org pages, flag those that changed
//                              since last week, return their full text
//   2. gatherStructuredCandidates — grants.gov/80K Hours/Reddit/site-specific CSE
//                                   with full-page fetch for non-structured items
//   3. Combine, de-dupe, return to discover.mjs
//
// The item shape is backward-compatible:
//   { url, title, snippet, queryUsed }
// but items that have full page content also carry:
//   { fullContent }   — used by discover.mjs's buildPrompt to send real content

import { scanPrimarySources } from "./source-monitor.mjs";
import { gatherStructuredCandidates } from "./structured-apis.mjs";
import { rankByDiscoveryValue } from "./discovery-value.mjs";

export async function gatherRawCandidates(region) {
  console.log(`[search] Starting Tier 1 (primary source monitor) for ${region}`);
  const { changed, skipped, errors: monitorErrors } = await scanPrimarySources(region);

  if (monitorErrors.length > 0) {
    console.warn(`[search] ${monitorErrors.length} primary source fetch error(s): ${monitorErrors.map(e => e.label).join(", ")}`);
  }
  console.log(`[search] Tier 1: ${changed.length} changed, ${skipped} unchanged`);

  console.log(`[search] Starting Tier 2 (structured APIs) for ${region}`);
  const structuredItems = await gatherStructuredCandidates(region);

  // Convert Tier 1 changed pages into the standard item shape.
  // fullContent is the full stripped page text — used by buildPrompt in discover.mjs.
  const tier1Items = changed.map((c) => ({
    url: c.url,
    title: c.label,
    snippet: `[PRIMARY SOURCE — content changed this week] ${c.note}`,
    queryUsed: `primary-source:${c.label}`,
    fullContent: c.content,
  }));

  // Convert Tier 2 items into the standard shape.
  const tier2Items = structuredItems.map((s) => ({
    url: s.url,
    title: s.title,
    snippet: s.snippet,
    queryUsed: s.source,
    fullContent: s.fullContent, // present only for full-page-fetched items
  }));

  // Combine and de-dupe
  const seen = new Set();
  const combined = [...tier1Items, ...tier2Items].filter((i) => {
    if (!i.url || seen.has(i.url)) return false;
    seen.add(i.url);
    return true;
  });

  // Tier 3: deterministic discovery-value ranking.
  // Hard-drops aggregator domains and evergreen brands BEFORE the LLM
  // (the prompt rules remain a second layer for judgment calls a regex
  // can't make), then scores and sorts the rest so discover.mjs's
  // 15-item context cap keeps the highest-signal candidates rather than
  // whichever happened to arrive first.
  const { ranked, dropped } = rankByDiscoveryValue(combined);

  const queriesUsed = [
    ...changed.map((c) => `primary-source: ${c.label}`),
    ...structuredItems.map((s) => s.source),
  ].filter((v, i, a) => a.indexOf(v) === i); // unique

  console.log(`[search] ${ranked.length} ranked candidates for LLM (${dropped.length} hard-dropped pre-LLM)`);
  return { items: ranked, queriesUsed, hardDropped: dropped };
}

// Re-export for anything that imports these directly (e.g. tests)
export { PRIMARY_SOURCES } from "./source-monitor.mjs";
export { SITE_SPECIFIC_QUERIES } from "./structured-apis.mjs";
