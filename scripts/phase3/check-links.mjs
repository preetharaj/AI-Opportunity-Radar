// scripts/phase3/check-links.mjs
//
// Weekly link-liveness checker (PRD §7.3). Independent cadence from
// discovery — see .github/workflows/link-checker.yml for its own cron.
//
// Hard guarantee this file upholds: it never imports any write helper other
// than openReportIssue(), and it never calls `writeFile` on
// opportunities.ts. The PRD's acceptance criterion ("zero modifications
// made to opportunities.ts by that job") is enforced here simply by this
// script having no code path capable of writing to that file at all —
// there's nothing to accidentally trigger.

import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { openReportIssue } from "./lib/github.mjs";
import { extractIdAndSourcePairs } from "./lib/catalog.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const OPPORTUNITIES_FILE = join(REPO_ROOT, "src", "lib", "data", "opportunities.ts");

const REQUEST_TIMEOUT_MS = 10_000;
const CONCURRENCY = 5;

async function main() {
  const entries = await extractIdAndSource(OPPORTUNITIES_FILE);
  console.log(`[link-check] Checking ${entries.length} source URLs`);

  const results = await checkAllWithConcurrency(entries, CONCURRENCY);
  const failures = results.filter((r) => r.failed);
  const noteworthy = results.filter(
    (r) => !r.failed && (r.classification === "rate_limited" || r.classification === "other_client_error")
  );

  console.log(`[link-check] ${failures.length} failed, ${noteworthy.length} noteworthy (non-failing) of ${results.length} URLs`);

  if (failures.length === 0 && noteworthy.length === 0) {
    console.log("[link-check] All source URLs responded healthily — no issue opened.");
    return;
  }

  const body = renderIssueBody({ failures, noteworthy, totalChecked: results.length });
  await openReportIssue({
    title: `Link-rot report: ${failures.length} source URL(s) flagged (${new Date().toISOString().slice(0, 10)})`,
    body,
  });
}

/**
 * Reads opportunities.ts and delegates to the shared catalog.mjs helper
 * for the actual extraction (see lib/catalog.mjs for why this stays
 * regex-based rather than a full TS parser).
 */
async function extractIdAndSource(filePath) {
  const content = await readFile(filePath, "utf8");
  return extractIdAndSourcePairs(content);
}

async function checkAllWithConcurrency(entries, concurrency) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < entries.length) {
      const entry = entries[i++];
      results.push(await checkOne(entry));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function checkOne({ id, source }) {
  const startedAt = Date.now();
  try {
    const res = await fetch(source, {
      method: "GET", // HEAD is unreliable on too many real-world hosts; GET is the safer default for a once-a-week check
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "User-Agent": "AI-Opportunity-Radar-LinkChecker/1.0 (+https://mapd.cc)" },
    });

    const classification = classifyStatus(res.status);

    // Spec is precise about which statuses count as "failed": 404, 410, or
    // 5xx. A 429 or other 4xx is real signal worth showing the reviewer,
    // but is NOT in that list — rate-limited is often us, not the target
    // site being broken, so it's reported with its own label and excluded
    // from the failed count rather than silently inflating it.
    const failed = classification === "not_found" || classification === "gone" || classification === "server_error";

    return {
      id,
      source,
      status: res.status,
      failed,
      classification,
      redirected: res.redirected,
      finalUrl: res.redirected ? res.url : null,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      id,
      source,
      status: null,
      failed: true,
      classification: classifyError(err),
      error: err.message,
      elapsedMs: Date.now() - startedAt,
    };
  }
}

/**
 * Maps an HTTP status to one of a small, fixed set of reviewer-facing
 * labels. Kept separate from the 404/410/5xx pass-fail check so the report
 * can say *why* something failed, not just that it did — a 410 (deliberately
 * removed) and a flaky 503 (try again later) warrant different reviewer
 * reactions even though both set `failed: true`.
 */
function classifyStatus(status) {
  if (status >= 200 && status < 300) return "ok";
  if (status >= 300 && status < 400) return "ok"; // fetch() already followed it; landing here means a final 2xx
  if (status === 404) return "not_found";
  if (status === 410) return "gone";
  if (status === 429) return "rate_limited"; // flagged below as non-failing — see checkOne classification !== "ok"
  if (status >= 500) return "server_error";
  return "other_client_error"; // any other 4xx — not in the PRD's flag list, reported but not counted as "failed"
}

/**
 * Maps a thrown fetch error to a label. AbortError specifically means our
 * own timeout fired, not necessarily that the server is down — worth
 * telling a reviewer apart from a hard connection refusal.
 */
function classifyError(err) {
  if (err.name === "AbortError" || err.name === "TimeoutError") return "timeout";
  if (err.cause?.code === "ENOTFOUND" || err.cause?.code === "EAI_AGAIN") return "dns_error";
  if (err.cause?.code === "ECONNREFUSED" || err.cause?.code === "ECONNRESET") return "connection_error";
  return "network_error";
}

function renderIssueBody({ failures, noteworthy, totalChecked }) {
  const failureRows = failures
    .map((f) => `| \`${f.id}\` | ${f.source} | ${f.status ?? "—"} | ${f.classification} | ${f.error || "—"} |`)
    .join("\n");

  const noteworthyRows = noteworthy
    .map((f) => `| \`${f.id}\` | ${f.source} | ${f.status ?? "—"} | ${f.classification} |`)
    .join("\n");

  return `
## Weekly link-rot report

Checked **${totalChecked}** source URLs currently in \`src/lib/data/opportunities.ts\`.
**${failures.length}** returned a failing status (404 / 410 / 5xx) or a network/timeout error.
**${noteworthy.length}** returned a non-failing but notable status (e.g. rate-limited) worth a glance.

**This is a flag-only report. Nothing in the catalog file has been changed.**
Per Phase 3 scope, this job never edits or removes catalog entries — a human
re-verifies each row below and decides whether to fix the URL, update the
opportunity, or remove it via the normal manual edit + commit flow.

### Failed (404 / 410 / 5xx / network error / timeout)
${failures.length > 0 ? `| Opportunity ID | Source URL | Status | Classification | Error |
|---|---|---|---|---|
${failureRows}` : "_None._"}

${
  noteworthy.length > 0
    ? `### Noteworthy, not counted as failed (e.g. rate-limited, other 4xx)
| Opportunity ID | Source URL | Status | Classification |
|---|---|---|---|
${noteworthyRows}
`
    : ""
}
### Classification key
- \`not_found\` (404) / \`gone\` (410) — server says the page no longer exists
- \`server_error\` (5xx) — target site errored; could be transient
- \`timeout\` — no response within 10s; could be a slow site, not necessarily dead
- \`dns_error\` / \`connection_error\` / \`network_error\` — couldn't reach the host at all
- \`rate_limited\` (429) / \`other_client_error\` — shown for visibility only, not flagged as failing; many sites 429 automated requests even when perfectly live

### Notes
- A failing status here does not necessarily mean the opportunity itself is gone — sites occasionally block automated requests, rate-limit, or briefly 5xx. Please open the link manually before editing/removing anything.
- This job runs weekly, independently of the discovery job. A failure here never blocks or is blocked by the discovery pipeline or the Vercel deploy.
`.trim();
}

main().catch((err) => {
  console.error("[link-check] Unhandled error:", err);
  process.exit(1);
});
