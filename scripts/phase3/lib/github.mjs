// scripts/phase3/lib/github.mjs
//
// Thin wrapper around Octokit for the two write operations Phase 3 needs:
//   1. open a PR with file changes on a new branch (discovery job)
//   2. open/update a tracking issue (link-checker job)
//
// SECURITY NOTE (PRD §7.4 / §8): this module never touches `main` directly
// and has no merge capability — it only calls `pulls.create` and
// `issues.create`. Whether that's actually safe depends on branch
// protection being configured on the GitHub repo itself (see docs/PHASE3.md
// "Manual setup required" — this is NOT something a workflow file can
// enforce from the outside; it's a repo Settings change only a human with
// admin access can make).

import { Octokit } from "@octokit/rest";
import { createPullRequest } from "octokit-plugin-create-pull-request";

const MyOctokit = Octokit.plugin(createPullRequest);

// Default colors/descriptions for the custom labels this pipeline uses.
// GitHub's create-issue and add-labels-to-PR endpoints do not reliably
// auto-create unknown labels — in practice this can surface as a 422 that
// (for PR creation specifically) propagates past
// octokit-plugin-create-pull-request's error handling, which only catches
// 403, not 422. That means a label-application failure could throw even
// though the underlying PR was already created — the caller would see an
// exception and have no idea a real PR exists. Pre-creating labels here,
// once, idempotently, before they're ever referenced removes that failure
// mode entirely rather than trying to catch it after the fact.
const KNOWN_LABELS = [
  { name: "phase3-agent-discovery", color: "1f6feb", description: "Opened automatically by the Phase 3 discovery pipeline" },
  { name: "phase3-link-check", color: "d93f0b", description: "Opened automatically by the Phase 3 link-rot checker" },
  { name: "phase3-zero-result", color: "8a8a8a", description: "Discovery pass found nothing to propose this run" },
];

let labelsEnsured = false;

/**
 * Idempotently makes sure every label this pipeline uses already exists in
 * the repo. Safe to call every run: createLabel() on an existing label
 * returns 422, which is treated as "already exists, fine" rather than an
 * error. Runs once per process (labelsEnsured) since a single discover.mjs
 * or check-links.mjs invocation only ever opens at most one PR or issue.
 */
async function ensureLabelsExist(octokit, owner, repo) {
  if (labelsEnsured) return;
  for (const label of KNOWN_LABELS) {
    try {
      await octokit.rest.issues.createLabel({ owner, repo, ...label });
    } catch (err) {
      if (err.status !== 422) {
        // Anything other than "already exists" is worth knowing about, but
        // still shouldn't block the actual PR/issue from being created —
        // labels are a nice-to-have, not the point of the run.
        console.warn(`[github] Could not ensure label "${label.name}" exists (${err.status}): ${err.message}`);
      }
    }
  }
  labelsEnsured = true;
}

function getClient() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  const options = { auth: token, userAgent: "ai-opportunity-radar-phase3" };
  // Optional override for GitHub Enterprise Server (api.github.com is the
  // default) or for pointing at a mock server during local testing.
  if (process.env.OCTOKIT_BASE_URL) options.baseUrl = process.env.OCTOKIT_BASE_URL;
  return new MyOctokit(options);
}

function getRepoContext() {
  const repoFull = process.env.GITHUB_REPOSITORY; // "owner/repo", set by Actions automatically
  if (!repoFull) throw new Error("GITHUB_REPOSITORY is not set (expected in GitHub Actions context)");
  const [owner, repo] = repoFull.split("/");
  return { owner, repo };
}

/**
 * Opens a PR on a fresh branch with the given file changes.
 * Returns null (and logs) if there's nothing to open a PR for, rather than
 * creating an empty/noise PR — see PRD §11 acceptance criteria: a "zero
 * candidates found" run should report that explicitly, not spam a PR.
 *
 * @param {{
 *   branchName: string,
 *   title: string,
 *   body: string,
 *   files: Record<string, string>, // path -> full file content
 *   labels?: string[],
 * }} opts
 */
export async function openCandidatePR({ branchName, title, body, files, labels = [] }) {
  if (!files || Object.keys(files).length === 0) {
    console.log("[github] No file changes to propose — skipping PR creation.");
    return null;
  }

  const octokit = getClient();
  const { owner, repo } = getRepoContext();
  const allLabels = ["phase3-agent-discovery", ...labels];
  await ensureLabelsExist(octokit, owner, repo);

  let result;
  try {
    result = await octokit.createPullRequest({
      owner,
      repo,
      title,
      body,
      head: branchName,
      base: process.env.BASE_BRANCH || "main",
      labels: allLabels,
      changes: [
        {
          files,
          commit: title,
          emptyCommit: false,
        },
      ],
      createWhenEmpty: false,
    });
  } catch (err) {
    // By this point in octokit-plugin-create-pull-request's internal flow,
    // the branch, commit, and PR have already been created — only the
    // label-attach step can still fail here. Pre-creating labels above
    // should prevent this, but if it still happens, the PR is NOT lost —
    // it exists on GitHub even though this function is about to throw.
    // Surface that explicitly rather than letting the caller assume the
    // run produced nothing.
    console.error(
      `[github] PR creation reported an error (likely during label application) after the branch/commit/PR were already pushed: ${err.message}. ` +
        `Check the repo for branch "${branchName}" — a PR may already exist even though this call failed.`
    );
    throw err;
  }

  if (!result) {
    console.log("[github] octokit-plugin-create-pull-request returned null (no-op, likely no diff).");
    return null;
  }

  console.log(`[github] Opened PR #${result.data.number}: ${result.data.html_url}`);
  return result.data;
}

/**
 * Opens a new GitHub Issue. Used by the link-checker for its weekly report.
 * Per PRD §7.3, this job NEVER edits opportunities.ts — issue-only output.
 */
export async function openReportIssue({ title, body, labels = [] }) {
  const octokit = getClient();
  const { owner, repo } = getRepoContext();
  const allLabels = ["phase3-link-check", ...labels];
  await ensureLabelsExist(octokit, owner, repo);

  const result = await octokit.rest.issues.create({
    owner,
    repo,
    title,
    body,
    labels: allLabels,
  });

  console.log(`[github] Opened issue #${result.data.number}: ${result.data.html_url}`);
  return result.data;
}
