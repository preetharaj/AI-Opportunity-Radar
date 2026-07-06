// scripts/phase3/archive-expired.mjs
//
// Weekly archival job — proposes removal of expired fixed-deadline
// opportunities via a pull request. A human must merge before anything
// is removed from the live catalog.
//
// What it does:
//   1. Reads src/lib/data/opportunities.ts
//   2. Finds entries where:
//        - deadlineType is NOT "rolling" (or absent, which also means fixed)
//        - deadline < today (ISO date string comparison)
//   3. Comments out each expired entry in place — preserves them in git
//      history, makes the diff reviewable, allows partial merge if some
//      should stay (e.g. an entry whose deadline was wrong and needs fixing)
//   4. Opens a PR against main with the proposed changes
//   5. If nothing is expired, opens a GitHub issue saying so (not a PR)
//      so there's a visible record that the job ran
//
// What it never does:
//   - Merge to main
//   - Delete entries outright (commented-out = recoverable)
//   - Touch rolling entries (deadline is a placeholder; rolling entries
//     stay until a human removes them after verifying the program closed)
//
// REVIEWER NOTE: when you see an archival PR, your job is:
//   - Confirm each commented-out entry is genuinely closed (click the source)
//   - If an entry has a wrong deadline but the program is still open,
//     fix the deadline in the diff before merging rather than reverting
//   - Partial merge is fine — delete commented-out blocks for confirmed-
//     closed entries and leave the ones you're unsure about as-is

import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { openCandidatePR, openReportIssue } from "./lib/github.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const OPPORTUNITIES_FILE = join(REPO_ROOT, "src", "lib", "data", "opportunities.ts");

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

async function main() {
  console.log(`[archive] Running expiry scan for ${today}`);

  const content = await readFile(OPPORTUNITIES_FILE, "utf8");
  const expired = findExpiredEntries(content);

  console.log(`[archive] Found ${expired.length} expired fixed-deadline entries`);

  if (expired.length === 0) {
    console.log("[archive] Nothing to archive — opening a no-op issue for audit trail");
    await openReportIssue({
      title: `Archival scan: no expired entries found (${today})`,
      body: `## Weekly archival scan — ${today}\n\nAll fixed-deadline entries in \`src/lib/data/opportunities.ts\` have deadlines on or after today. No PR opened.\n\nThis issue is the audit trail confirming the job ran.`,
      labels: ["phase3-archival"],
    });
    return;
  }

  const updatedContent = commentOutExpiredEntries(content, expired);
  const prBody = renderPrBody(expired);
  const branchName = `phase3/archive-expired-${today}`;
  const prTitle = `Phase 3 archival: ${expired.length} expired opportunit${expired.length > 1 ? "ies" : "y"} (${today})`;

  await openCandidatePR({
    branchName,
    title: prTitle,
    body: prBody,
    files: { "src/lib/data/opportunities.ts": updatedContent },
    labels: ["phase3-archival"],
  });
}

// ─── Entry extraction ─────────────────────────────────────────────────────────

/**
 * Splits opportunities.ts into per-entry text blocks and identifies those
 * with a fixed (non-rolling) deadline that has already passed.
 *
 * Returns an array of:
 *   { id, title, deadline, source, blockStart, blockEnd }
 * where blockStart/blockEnd are character offsets into the original file
 * content — used by commentOutExpiredEntries to locate and replace exactly
 * the right text.
 */
function findExpiredEntries(content) {
  const expired = [];

  // Split on entry boundaries — same convention as catalog.mjs.
  // We need character offsets, so track position manually rather than
  // using .split() which loses that information.
  const ENTRY_BOUNDARY = /\n  \{/g;
  const positions = [];
  let m;
  while ((m = ENTRY_BOUNDARY.exec(content))) {
    positions.push(m.index);
  }
  // Add a sentinel at end-of-file so the last entry has a defined end
  positions.push(content.length);

  for (let i = 0; i < positions.length - 1; i++) {
    const blockStart = positions[i] + 1; // skip the leading \n
    const blockEnd = positions[i + 1];
    const block = content.slice(blockStart, blockEnd);

    const id = block.match(/id:\s*"([a-z0-9-]+)"/)?.[1];
    const title = block.match(/title:\s*"([^"]+)"/)?.[1];
    const deadline = block.match(/deadline:\s*"([^"]+)"/)?.[1];
    const source = block.match(/source:\s*"([^"]+)"/)?.[1];
    const deadlineType = block.match(/deadlineType:\s*"([^"]+)"/)?.[1];

    if (!id || !deadline) continue;

    // Skip rolling entries — their deadline is a placeholder, not a real
    // closing date. Only a human who verified the program closed should
    // remove them.
    const isRolling =
      deadlineType === "rolling" ||
      id.endsWith("-rolling");
    if (isRolling) continue;

    // Expired = fixed deadline strictly before today
    if (deadline < today) {
      expired.push({ id, title, deadline, source, blockStart, blockEnd });
      console.log(`[archive] Expired: ${id} (deadline: ${deadline})`);
    }
  }

  return expired;
}

// ─── File transformation ──────────────────────────────────────────────────────

/**
 * Comments out each expired entry block in the file content.
 * Processes from the end of the file backwards so that character offsets
 * for earlier blocks remain valid after each replacement.
 *
 * Format: wraps the whole object literal in a JS block comment, with a
 * header line explaining when and why it was commented out. The reviewer
 * can delete the comment block, un-comment it, or edit the deadline and
 * un-comment it — all options are open.
 */
function commentOutExpiredEntries(content, expired) {
  // Sort descending by blockStart so replacements from the end don't
  // invalidate the offsets of earlier blocks.
  const sorted = [...expired].sort((a, b) => b.blockStart - a.blockStart);

  let result = content;
  for (const { id, deadline, blockStart, blockEnd } of sorted) {
    const originalBlock = result.slice(blockStart, blockEnd);

    // Indent each line of the block comment body with `  // ` so it
    // sits flush with where the object literal was.
    const commentedLines = originalBlock
      .split("\n")
      .map((line) => `  // ${line}`)
      .join("\n");

    const replacement =
      `\n  // ── ARCHIVED ${today}: deadline ${deadline} has passed ──\n` +
      `  // Verify source is closed before merging. To restore: remove the\n` +
      `  // comment markers. To fix deadline: edit inline before merging.\n` +
      `  // id: "${id}"\n` +
      commentedLines;

    result = result.slice(0, blockStart) + replacement + result.slice(blockEnd);
  }
  return result;
}

// ─── PR body ──────────────────────────────────────────────────────────────────

function renderPrBody(expired) {
  const rows = expired
    .map(
      (e) =>
        `- **${e.title || e.id}** (\`${e.id}\`)\n` +
        `  - Deadline: \`${e.deadline}\` (${daysAgo(e.deadline)} days ago)\n` +
        `  - Source to verify: ${e.source}`
    )
    .join("\n");

  return `
## Phase 3 archival — ${today}

**This PR was opened automatically. Nothing is removed until a human merges it.**

Found **${expired.length}** fixed-deadline opportunit${expired.length > 1 ? "ies" : "y"} whose deadline has passed.
Each entry has been commented out in \`src/lib/data/opportunities.ts\`.

### Entries proposed for archival

${rows}

### Reviewer checklist

- [ ] Click each source link above — confirm the program is actually closed (not just past the listed deadline with rolling intake or extended window)
- [ ] If any entry is still open (wrong deadline): un-comment it in this PR's diff and fix the deadline before merging
- [ ] Partial merge is fine — delete only the comment blocks you've confirmed are closed; revert the rest
- [ ] Rolling entries are intentionally excluded from this PR — they need manual verification before removal

### What the diff looks like

Each expired entry is wrapped in a block comment:
\`\`\`
// ── ARCHIVED ${today}: deadline YYYY-MM-DD has passed ──
// Verify source is closed before merging.
// id: "some-opportunity-id"
//   {
//     id: "some-opportunity-id",
//     ...
//   },
\`\`\`

Merging removes it from the live catalog. Closing this PR without merging leaves it as-is (still hidden from the UI by the runtime deadline filter, but still in the file).
`.trim();
}

function daysAgo(deadline) {
  const d = new Date(deadline);
  const now = new Date(today);
  return Math.round((now - d) / 86_400_000);
}

main().catch((err) => {
  console.error("[archive] Unhandled error:", err);
  process.exit(1);
});
