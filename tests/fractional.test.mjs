// tests/fractional.test.mjs
// Run: node tests/fractional.test.mjs   (from repo root; needs zod installed)
import { CandidateOpportunitySchema as CandidateSchema, CATEGORIES } from "../scripts/phase3/schema.mjs";
import { FRACTIONAL_RULES, FRACTIONAL_SIGNALS, FRACTIONAL_EXCLUSIONS, renderRulesForPrompt } from "../scripts/phase3/curation-rules.mjs";
import { rankByDiscoveryValue, shouldDrop } from "../scripts/phase3/lib/discovery-value.mjs";
import { PRIMARY_SOURCES } from "../scripts/phase3/lib/source-monitor.mjs";

let pass = 0, fail = 0;
const check = (l, c) => { c ? (pass++, console.log("PASS:", l)) : (fail++, console.log("FAIL:", l)); };

// ── schema ────────────────────────────────────────────────────────────────────
check("CATEGORIES includes fractional_job", CATEGORIES.includes("fractional_job"));
check("CATEGORIES length is 6 (one category added, none removed)", CATEGORIES.length === 6);

const base = {
  id: "fractional-cto-healthtech-berlin-2026",
  title: "Fractional CTO — HealthTech, Berlin (2 days/week)",
  category: "fractional_job",
  region: "Europe",
  deadline: "2026-12-31",
  deadlineType: "rolling",
  eligibility: "Senior engineering leader with healthtech experience; 2 days/week, remote-friendly within EU.",
  minScore: 5,
  maybeScore: 3,
  targetStatus: ["early_career", "other"],
  tags: ["fractional", "CTO", "healthtech"],
  source: "https://www.gofractional.com/jobs/example",
  description: "Early-stage Berlin healthtech seeks a fractional CTO two days a week to own architecture and hiring.",
  hook: "Fractional CTO at a Berlin healthtech — 2 days/week, EU remote.",
  effortLevel: "medium",
  rationale: "Genuinely fractional (explicit 2 days/week), niche vertical, primary board source.",
  uncertaintyNotes: "No stated close date; listing dated recently on the board.",
};
check("schema accepts a valid fractional_job candidate", CandidateSchema.safeParse(base).success);
check("schema rejects an invalid category", !CandidateSchema.safeParse({ ...base, category: "remote_job" }).success);

// ── curation rules in code ────────────────────────────────────────────────────
check("FRACTIONAL_RULES exported and non-empty", typeof FRACTIONAL_RULES === "string" && FRACTIONAL_RULES.length > 200);
check("FRACTIONAL_SIGNALS includes core terms", ["fractional", "interim", "advisory"].every((s) => FRACTIONAL_SIGNALS.includes(s)));
check("FRACTIONAL_EXCLUSIONS non-empty", Array.isArray(FRACTIONAL_EXCLUSIONS) && FRACTIONAL_EXCLUSIONS.length > 0);
const prompt = renderRulesForPrompt();
check("prompt injects fractional rules", prompt.includes("fractional_job") && prompt.includes("GENUINELY fractional"));
check("prompt keeps existing policy (litmus test + evergreen)", prompt.includes("litmus test") && prompt.includes("Y Combinator"));

// ── discovery-value scoring ───────────────────────────────────────────────────
check("gofractional.com not hard-dropped", shouldDrop({ url: "https://www.gofractional.com/jobs/x", title: "Fractional CTO" }) === null);
check("fractionaljobs.io not hard-dropped", shouldDrop({ url: "https://www.fractionaljobs.io/x", title: "Fractional Head of Data" }) === null);
check("linkedin still hard-dropped", shouldDrop({ url: "https://www.linkedin.com/jobs/view/1", title: "Fractional CTO" }) !== null);

const { ranked } = rankByDiscoveryValue([
  { url: "https://www.gofractional.com/jobs/a", title: "Fractional CTO — climate tech, 2 days/week", snippet: "interim engagement, applications open" },
  { url: "https://example.com/careers/b", title: "Senior Software Engineer", snippet: "full-time permanent role at a large company" },
]);
check("fractional listing outscores generic permanent role", ranked[0].url.includes("gofractional") && ranked[0].discoveryScore > ranked[1].discoveryScore);
check("permanent-role language penalized", ranked[1].discoveryReasons.some((r) => r.includes("permanent-role")));
check("fractional language rewarded", ranked[0].discoveryReasons.some((r) => r.includes("fractional")));

// ── dedupe (same role, two boards → caller dedupes by URL; ranking preserves both scores) ──
const dupIn = [
  { url: "https://www.gofractional.com/jobs/same-role", title: "Fractional CMO — fintech", snippet: "fractional, 3 days/week" },
  { url: "https://www.gofractional.com/jobs/same-role", title: "Fractional CMO — fintech", snippet: "fractional, 3 days/week" },
];
const seen = new Set();
const deduped = dupIn.filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)));
check("URL dedupe collapses duplicates", deduped.length === 1);

// ── sources ───────────────────────────────────────────────────────────────────
const allSources = Object.values(PRIMARY_SOURCES).flat();
const fractionalSources = allSources.filter((s) => s.label.includes("[fractional_job]"));
check("fractional sources present in every region", ["Global", "India", "SEA", "Europe", "USA", "Australia"].every((r) => (PRIMARY_SOURCES[r] || []).some((s) => s.label.includes("[fractional_job]"))));
check("priority boards among monitored sources", fractionalSources.some((s) => s.url.includes("gofractional.com")) && fractionalSources.some((s) => s.url.includes("fractionaljobs.io")));
check("no LinkedIn source anywhere", allSources.every((s) => !s.url.includes("linkedin.com")));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
