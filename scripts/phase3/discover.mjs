// scripts/phase3/discover.mjs
//
// Weekly discovery job (PRD §7.2). One run = one region. Never writes to
// `main`, never edits opportunities.ts directly on disk-and-commit — it
// produces an in-memory patch and hands it to openCandidatePR(), which puts
// it on a fresh branch behind a PR. No code path in this file calls
// anything that merges.
//
// Region rotation: this script takes the region as a CLI arg / env var
// rather than computing "which week is it" itself, so the rotation schedule
// lives in the workflow YAML (one cron-triggered matrix entry per region)
// where a human can see and edit it without touching this file.
//
// Pipeline:
//   1. gatherRawCandidates(region)        — free search/RSS, see lib/search-providers.mjs
//   2. structuredChat(...)                — local Ollama or free-tier cloud, see lib/ollama.mjs
//   3. validateDiscoveryResponse(...)      — zod, see schema.mjs (drops anything malformed)
//   4. render each surviving candidate as a TS object literal
//   5. splice that text into a copy of opportunities.ts
//   6. openCandidatePR(...)                — branch + PR, see lib/github.mjs
//
// If step 1 finds nothing, or step 3 keeps nothing, the run still completes
// and still reports — it just opens no PR. Per PRD §11: "explicitly reports
// zero qualifying candidates found, rather than failing silently."

import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { gatherRawCandidates } from "./lib/search-providers.mjs";
import { structuredChat } from "./lib/ollama.mjs";
import { validateDiscoveryResponse, DiscoveryResponseSchema } from "./schema.mjs";
import { renderRulesForPrompt } from "./curation-rules.mjs";
import { extractExistingIds } from "./lib/catalog.mjs";
import { openCandidatePR, openReportIssue } from "./lib/github.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const OPPORTUNITIES_FILE = join(REPO_ROOT, "src", "lib", "data", "opportunities.ts");

const REGION = process.argv[2] || process.env.DISCOVERY_REGION;
if (!REGION) {
  console.error("Usage: node discover.mjs <region>  (or set DISCOVERY_REGION)");
  process.exit(1);
}

async function main() {
  console.log(`[discover] Starting discovery pass for region: ${REGION}`);

  const existingIds = await loadExistingIds();
  const { items: rawCandidates, queriesUsed } = await gatherRawCandidates(REGION);
  console.log(`[discover] Gathered ${rawCandidates.length} raw links via ${queriesUsed.length} queries`);

  if (rawCandidates.length === 0) {
    await reportNoActivity({
      reason: "No raw candidate links found from any configured free source for this region.",
      queriesUsed,
    });
    return;
  }

  const { systemPrompt, userPrompt } = buildPrompt(REGION, rawCandidates, existingIds);

  let llmResult;
  try {
    llmResult = await structuredChat(systemPrompt, userPrompt, DiscoveryResponseSchema);
  } catch (err) {
    console.error(`[discover] Inference failed entirely: ${err.message}`);
    await reportNoActivity({
      reason: `Inference failed (both local and cloud fallback unavailable or erroring): ${err.message}`,
      queriesUsed,
    });
    process.exitCode = 1;
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(llmResult.raw);
  } catch (err) {
    await reportNoActivity({
      reason: `Model (${llmResult.source}) returned non-JSON output, could not parse: ${err.message}`,
      queriesUsed,
    });
    process.exitCode = 1;
    return;
  }

  const validation = validateDiscoveryResponse(parsed);
  if (!validation.ok) {
    await reportNoActivity({
      reason: `Model (${llmResult.source}) output failed schema validation:\n${validation.errors.join("\n")}`,
      queriesUsed,
    });
    process.exitCode = 1;
    return;
  }

  const { candidates, rejected } = validation.data;

  // Defense in depth: even though the agent was told the existing IDs and
  // told not to duplicate them, re-check here. A model ignoring an
  // instruction is normal; a duplicate ID silently overwriting a verified
  // entry is not something to find out about during review.
  const newCandidates = candidates.filter((c) => {
    if (existingIds.has(c.id)) {
      console.warn(`[discover] Dropping candidate "${c.id}" — id already exists in catalog`);
      return false;
    }
    return true;
  });

  if (newCandidates.length === 0) {
    await reportNoActivity({
      reason:
        candidates.length > 0
          ? "All proposed candidates had IDs already present in the catalog and were dropped."
          : "Model found no candidates that cleared the curation bar this pass.",
      queriesUsed,
      rejected,
      modelSource: llmResult.source,
    });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const c of newCandidates) c.lastVerified = today;

  const updatedFileContent = await spliceCandidatesIntoFile(newCandidates);
  const branchName = `phase3/discovery-${REGION.toLowerCase()}-${today}`;
  const prTitle = `Phase 3 discovery: ${newCandidates.length} candidate(s) for ${REGION} (${today})`;
  const prBody = renderPrBody({ region: REGION, queriesUsed, candidates: newCandidates, rejected, modelSource: llmResult.source });

  await openCandidatePR({
    branchName,
    title: prTitle,
    body: prBody,
    files: { "src/lib/data/opportunities.ts": updatedFileContent },
  });
}

async function loadExistingIds() {
  const content = await readFile(OPPORTUNITIES_FILE, "utf8");
  return extractExistingIds(content);
}

function buildPrompt(region, rawCandidates, existingIds) {
  const rules = renderRulesForPrompt();
  const linksBlock = rawCandidates
    .slice(0, 25) // cap context size for small local models
    .map((c, i) => `${i + 1}. ${c.title || "(untitled)"}\n   URL: ${c.url}\n   Snippet: ${c.snippet || "(none)"}`)
    .join("\n\n");

  const systemPrompt = [
    "You are a careful research assistant helping curate a catalog of real, verifiable AI/tech opportunities (grants, fellowships, internships, courses, startup programs).",
    "You only propose opportunities you can support with the source link given to you below.",
    "You never invent deadlines, amounts, or eligibility details not present in the provided snippet or your general knowledge of the named source.",
    "If you are unsure whether something is still open or accurate, you say so in uncertaintyNotes rather than guessing.",
    "Respond with ONLY a JSON object matching the provided schema. No prose, no markdown fences.",
  ].join(" ");

  const userPrompt = `
Region for this pass: ${region}

${rules}

Opportunities already in the catalog (do not propose these ids again):
${[...existingIds].slice(0, 50).join(", ") || "(none yet)"}

Raw candidate links found this pass (titles/snippets from search, NOT verified):
${linksBlock}

For each link that plausibly describes a real, region-relevant, currently-open-or-rolling AI/tech opportunity and clears the curation rules above, draft one candidate object. For anything you looked at but are deliberately excluding (evergreen brand, expired, off-topic, etc.), add it to "rejected" with a short reason. Return JSON only.
`.trim();

  return { systemPrompt, userPrompt };
}

/**
 * Inserts new candidate object literals just before the closing `];` of the
 * `opportunities` array, preserving every existing entry byte-for-byte.
 * This is a deliberately narrow text splice (not a full TS AST rewrite) so
 * the diff a reviewer sees in the PR is exactly "N new objects added,
 * nothing else touched."
 */
async function spliceCandidatesIntoFile(candidates) {
  const content = await readFile(OPPORTUNITIES_FILE, "utf8");
  const marker = "\n];";
  const idx = content.lastIndexOf(marker);
  if (idx === -1) {
    throw new Error("Could not find closing `];` of the opportunities array — file format may have changed.");
  }

  const rendered = candidates.map(renderCandidateAsTs).join("\n");
  return content.slice(0, idx) + "\n" + rendered + content.slice(idx);
}

function renderCandidateAsTs(c) {
  const lines = [
    "  {",
    `    id: ${ts(c.id)},`,
    `    title: ${ts(c.title)},`,
    `    category: ${ts(c.category)},`,
    `    region: ${ts(c.region)},`,
    `    deadline: ${ts(c.deadline)},`,
    `    eligibility: ${ts(c.eligibility)},`,
    `    minScore: ${c.minScore},`,
    `    maybeScore: ${c.maybeScore},`,
    `    targetStatus: ${tsArray(c.targetStatus)},`,
    `    tags: ${tsArray(c.tags)},`,
    `    source: ${ts(c.source)},`,
    `    description: ${ts(c.description)},`,
    `    hook: ${ts(c.hook)},`,
    `    effortLevel: ${ts(c.effortLevel)},`,
    `    lastVerified: ${ts(c.lastVerified)},`,
    "    newThisWeek: true,",
    "    // ⚠️ AGENT-DRAFTED — Phase 3 discovery pipeline. Not yet human-verified.",
    `    // Uncertainty flagged by the agent: ${toSingleLineComment(c.uncertaintyNotes) || "(none stated)"}`,
  ];
  if (c.eligibleEducationLevels) lines.push(`    eligibleEducationLevels: ${tsArray(c.eligibleEducationLevels)},`);
  if (c.eligibleFields) lines.push(`    eligibleFields: ${tsArray(c.eligibleFields)},`);
  if (c.eligibleCitizenshipRegions) lines.push(`    eligibleCitizenshipRegions: ${tsArray(c.eligibleCitizenshipRegions)},`);
  if (c.eligibleResidenceRegions) lines.push(`    eligibleResidenceRegions: ${tsArray(c.eligibleResidenceRegions)},`);
  if (typeof c.minAge === "number") lines.push(`    minAge: ${c.minAge},`);
  if (typeof c.maxAge === "number") lines.push(`    maxAge: ${c.maxAge},`);
  if (c.minExperienceLevel) lines.push(`    minExperienceLevel: ${ts(c.minExperienceLevel)},`);
  lines.push("  },");
  return lines.join("\n");
}

/**
 * SECURITY: the model's output is untrusted by design (see PRD risk
 * section — "may fabricate plausible-sounding opportunities"). Every
 * structured field is safely embedded via JSON.stringify() (ts()), which
 * escapes newlines correctly. uncertaintyNotes is the one field rendered
 * as a // line comment instead of a quoted string literal, so it needs its
 * own escaping: a newline (real \n, CR, or a literal "\n" sequence the
 * model might emit as text) would otherwise terminate the comment early
 * and let arbitrary text after it land as live, uncommented TypeScript
 * source in the diff a reviewer sees — effectively letting unverified
 * model output inject code into the PR. Collapsing to one line, stripping
 * any comment-closing sequence (asterisk followed by slash), and
 * hard-capping length closes that off regardless of what the model sends.
 */
function toSingleLineComment(str) {
  if (!str) return "";
  return String(str)
    .replace(/\\n/g, " ") // literal backslash-n text, in case the model emits it unescaped
    .replace(/[\r\n]+/g, " ") // actual newlines/carriage returns
    .replace(/\*\//g, "* /") // defang in case this is ever embedded in a /* */ block elsewhere
    .trim()
    .slice(0, 400); // matches schema.mjs's max(400), belt-and-suspenders
}

function ts(str) {
  return JSON.stringify(String(str));
}
function tsArray(arr) {
  return `[${arr.map((v) => ts(v)).join(", ")}]`;
}

function renderPrBody({ region, queriesUsed, candidates, rejected, modelSource }) {
  const candidateList = candidates
    .map(
      (c) =>
        `- **${c.title}** (\`${c.id}\`)\n  - Category: ${c.category} · Region: ${c.region} · Deadline: ${c.deadline}\n  - Source: ${c.source}\n  - Uncertainty flagged by agent: ${c.uncertaintyNotes || "_none stated_"}`
    )
    .join("\n");

  const rejectedList =
    rejected.length > 0
      ? rejected.map((r) => `- ~~${r.title}~~ — ${r.reason}`).join("\n")
      : "_None — the agent did not log any explicit rejections this pass._";

  return `
## Phase 3 agent-assisted discovery — ${region}

**This PR was opened automatically and cannot be merged without human review.**
Branch protection on \`main\` does not grant this workflow's token merge access.

**Inference source this run:** \`${modelSource}\` (local Ollama, or cloud fallback if local was unavailable — see workflow logs for details)

### Search queries used
${queriesUsed.length > 0 ? queriesUsed.map((q) => `- \`${q}\``).join("\n") : "_(RSS feeds only, no search API queries this run)_"}

### Candidates proposed (${candidates.length})
${candidateList}

### Candidates the agent looked at and rejected (${rejected.length})
${rejectedList}

### Reviewer checklist (same bar as manual curation)
- [ ] Discovery value: does this clear the "would Google already surface this" litmus test?
- [ ] Deadline accuracy: confirmed against the **source** link, not just the snippet
- [ ] Source credibility: official page, not an aggregator mirroring stale info
- [ ] Category/region fit and no duplicate of an existing catalog entry
- [ ] Not an excluded evergreen brand

If any candidate fails the checklist, edit it directly in this PR's diff or remove that object before merging — partial acceptance of a multi-candidate PR is expected and fine.
`.trim();
}

async function reportNoActivity({ reason, queriesUsed, rejected = [], modelSource }) {
  console.log(`[discover] No PR opened for ${REGION}. Reason: ${reason}`);

  const today = new Date().toISOString().slice(0, 10);
  const body = `
## Phase 3 discovery — ${REGION} — zero candidates (${today})

**Reason:** ${reason}

### Search queries used
${queriesUsed.length > 0 ? queriesUsed.map((q) => `- \`${q}\``).join("\n") : "_(none — failed before search, or RSS-only run)_"}

### Candidates the agent explicitly rejected (${rejected.length})
${rejected.length > 0 ? rejected.map((r) => `- ~~${r.title}~~ — ${r.reason}`).join("\n") : "_None logged this pass._"}

### Inference source
${modelSource || "_(not reached — failed before or during inference)_"}

---
No catalog changes were proposed this run. This is expected and not an
error condition by itself — see reason above. No PR was opened because
there is nothing for a reviewer to review.
`.trim();

  try {
    await openReportIssue({
      title: `Phase 3 discovery: zero candidates for ${REGION} (${today})`,
      body,
      labels: ["phase3-zero-result"],
    });
  } catch (err) {
    // Reporting failing must not silently swallow the original problem —
    // surface both rather than letting the run look clean.
    console.error(`[discover] Also failed to open zero-result issue: ${err.message}`);
    throw err;
  }
}

main().catch((err) => {
  console.error("[discover] Unhandled error:", err);
  process.exit(1);
});
