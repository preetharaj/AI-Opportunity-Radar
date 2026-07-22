// scripts/phase3/curation-rules.mjs
//
// Curation rules the discovery agent is told to follow, extracted into code
// so they can be (a) injected into the LLM prompt verbatim and (b) read by a
// human reviewer in the PR body without having to dig through prompt strings.
//
// IMPORTANT: this is a courtesy copy for the agent's prompt context. The
// canonical rules live as comments at the top of src/lib/data/opportunities.ts
// and that file is the actual authority. If you change the rules there,
// update this file in the same PR — there is no automatic sync, and a
// reviewer should treat any drift between the two as a bug.
//
// Per PRD §4 (Non-Goals) / §7.4: this file does NOT make the accept/reject
// decision. It only gives the agent and the reviewer the same shared
// vocabulary. The actual judgment call ("well-known enough to skip?",
// "is this deadline accurate?", "is this source credible?") stays human.

export const EVERGREEN_BRANDS = [
  "Y Combinator",
  "Techstars",
  "Antler",
  "EF",
  "Entrepreneur First",
  "500 Global",
  "AWS Activate",
  "Microsoft for Startups",
  "Google for Startups",
  "Nvidia Inception",
];

export const DISCOVERY_VALUE_LITMUS_TEST = `
If a founder typed this company/accelerator's name into Google right now,
would the official application page be the first result?
  - If YES: skip it. It's well-known and easy to find; listing it trains
    users to stop checking back. This applies regardless of which specific
    cohort or credit window is currently open.
  - If NO (it's small, regional, vertical-niche, or brand-new): it clears
    the bar and is worth surfacing.
`.trim();

export const ACCEPT_CRITERIA = [
  "Time-boxed grant/credit calls with a real deadline (not a standing program)",
  "Geography-narrow accelerators (single-city/country, government or locally backed)",
  "Niche-vertical accelerators (AI-for-climate, AI-for-agri, AI-for-health, etc.)",
  "First-cohort / newly-launched programs (no SEO history yet — highest discovery value)",
  "One-off corporate-sponsored challenges with a prize/funding pool, not the corporate \"startup program\" brand itself",
];

export const INCLUSION_RULE = `
Active, rolling, or future-opening AI/ML/tech opportunities only.
Closed, inaccessible, generic non-tech, or past-deadline opportunities must
be excluded — if you're not confident an opportunity is still open, say so
in uncertaintyNotes rather than guessing.
`.trim();

// ── Fractional jobs (category: "fractional_job") ──────────────────────────────
// Phase 4 addition. Same discovery-value philosophy applied to fractional work.
// A role is GENUINELY FRACTIONAL when the engagement itself is a fraction of a
// full role: fractional CxO/head-of, interim executive, advisory retainer,
// part-time executive/specialist, or a defined-scope contract explicitly
// framed as fractional. Full-time, part-time, contract, advisory, interim and
// remote arrangements all qualify IF the fractional nature is explicit.
// A generic full-time job posting is NEVER a fractional_job.

export const FRACTIONAL_SIGNALS = [
  "fractional",
  "interim",
  "advisory",
  "advisor retainer",
  "part-time cto",
  "part-time cmo",
  "part-time cfo",
  "part-time coo",
  "part-time head of",
  "portfolio career",
  "portfolio executive",
  "on-demand executive",
  "2 days a week",
  "2 days/week",
  "3 days a week",
  "3 days/week",
  "hours per week",
  "hrs/week",
];

export const FRACTIONAL_EXCLUSIONS = [
  "full-time permanent",
  "permanent role",
  "full time employee",
  "w-2 full-time",
];

export const FRACTIONAL_RULES = `
Fractional-job category rules (category: "fractional_job"):
  a. Only GENUINELY fractional engagements: the title or description must
     explicitly indicate fractional, interim, advisory, portfolio, or
     part-time executive/specialist work (e.g. "Fractional CTO",
     "Interim Head of Data", "Advisory ML Lead, 2 days/week").
  b. Full-time, part-time, contract, advisory, interim, and remote are ALL
     acceptable arrangements — the test is whether the engagement itself is
     fractional, not the employment mechanics.
  c. A generic full-time job posting is NEVER a fractional_job. If the
     fractional nature is ambiguous, flag it in uncertaintyNotes instead of
     assuming.
  d. Exclude common/evergreen roles: anything a candidate would find on the
     first page of a generic job-board search fails the discovery-value bar.
     Prefer high-signal, uncommon, hard-to-find listings (niche verticals,
     specific regions, early-stage companies, unusual scopes).
  e. Deduplicate aggressively: the same role cross-posted on multiple boards
     is ONE candidate — cite the most-primary source URL (employer page or
     the original board posting, not a re-aggregation).
  f. Stale or undated listings must be flagged in uncertaintyNotes.
  g. Preserve the exact source URL and a one-line rationale for every entry.
`.trim();

// ── Remote-anywhere internships (Phase 4 addition) ─────────────────────────
// A recurring finding from market research: corporate "remote" internships
// are almost always tied to one country (payroll/tax/work-authorization
// triggers an employer-employee relationship). Genuinely anywhere-remote
// internships instead cluster in OSS/fellowship programs structured as a
// stipend or grant to the individual, not employment — because a stipend
// doesn't create the same tax/legal exposure for the payer. This test lets
// the agent tell the two apart instead of tagging every "remote" internship
// as anywhere-open.

export const REMOTE_ANYWHERE_SIGNALS = [
  "stipend",
  "grant",
  "fellowship",
  "mentorship",
  "open source contribution",
  "no country restriction",
  "open worldwide",
  "open globally",
  "any country",
];

export const REMOTE_ANYWHERE_EXCLUSIONS = [
  "remote (us)",
  "remote (uk)",
  "remote, must be based in",
  "must have work authorization in",
  "no visa sponsorship",
  "eligible to work in",
  "residents of",
];

export const REMOTE_ANYWHERE_RULES = `
Remote-anywhere internship classification (isRemote: true with NO
remoteEligibleRegions restriction):
  a. Only mark an internship as genuinely anywhere-remote if the program is
     structured as a STIPEND or GRANT paid to an individual by a nonprofit,
     foundation, or open-source organization — NOT a standard
     employer-employee arrangement. This is the actual reason these programs
     can be open to any country: no payroll withholding, no work-authorization
     check, no permanent-establishment tax exposure for the payer.
  b. Signals that a program likely qualifies: ${REMOTE_ANYWHERE_SIGNALS.join(", ")}.
  c. Signals that a "remote" posting is actually region-restricted (set
     remoteEligibleRegions instead of leaving it empty): ${REMOTE_ANYWHERE_EXCLUSIONS.join(", ")}.
  d. A standard corporate internship that merely says "remote" is NOT
     anywhere-remote by default — assume it's tied to one country unless the
     posting explicitly states otherwise. Corporate remote internships are
     the common case; anywhere-remote is the exception, not the default.
  e. If genuinely uncertain whether a program restricts by country, do NOT
     guess open — leave remoteEligibleRegions unset only when the source
     text explicitly says "open worldwide," "any country," or equivalent;
     otherwise flag the ambiguity in uncertaintyNotes and default to treating
     it as region-restricted.
  f. Re-verify eligibility text each cycle — some of these programs' project
     lists rotate yearly and may or may not include AI/ML-relevant work in a
     given round.
`.trim();

/**
 * Renders the rules block injected into the discovery agent's prompt.
 * Kept as plain text (not JSON) because it's read by the model as
 * instructions, not parsed as data.
 */
export function renderRulesForPrompt() {
  return `
CURATION RULES — follow these exactly.

1. Discovery-value litmus test for anything in the "grant" category (including startup programs and accelerators):
${DISCOVERY_VALUE_LITMUS_TEST}

2. Never propose these evergreen brands, regardless of cohort/credit window:
${EVERGREEN_BRANDS.map((b) => `   - ${b}`).join("\n")}

3. Categories that DO clear the discovery-value bar for "startup":
${ACCEPT_CRITERIA.map((c) => `   - ${c}`).join("\n")}

4. Inclusion rule:
${INCLUSION_RULE}

5. ${FRACTIONAL_RULES}

6. ${REMOTE_ANYWHERE_RULES}

7. If you are not independently confident about a deadline, eligibility
   detail, or whether a source is official (vs. an aggregator), say so in
   "uncertaintyNotes". Do not omit doubt to make an entry look cleaner.

8. If nothing found this pass clears the bar, return an empty "candidates"
   array. An empty result is a correct result, not a failure.
`.trim();
}
