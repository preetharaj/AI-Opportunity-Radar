#!/usr/bin/env node
/**
 * archive-expired.mjs
 * ─────────────────────────────────────────────────────────
 * Scans all opportunity Markdown files in content/opportunities/.
 * For each file whose deadline has passed:
 *   1. Changes `status: active` or `status: closing-soon` → `status: archived`
 *   2. Adds `archivedDate: YYYY-MM-DD`
 *   3. Logs what changed
 *
 * Run manually:   node scripts/archive-expired.mjs
 * Run in CI:      see .github/workflows/weekly-publish.yml
 *
 * Safe: read the deadline from frontmatter, only edits status + archivedDate.
 * Does NOT move files — archived files stay in their category folder.
 * The archive page reads status: archived wherever the file lives.
 *
 * Usage:
 *   node scripts/archive-expired.mjs           # dry-run: show what would change
 *   node scripts/archive-expired.mjs --write   # actually write changes
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contentRoot = join(__dirname, '..', 'content', 'opportunities');
const DRY_RUN = !process.argv.includes('--write');

if (DRY_RUN) {
  console.log('🔍 Dry run — pass --write to apply changes\n');
}

const today = new Date();
today.setHours(0, 0, 0, 0);
const todayStr = today.toISOString().split('T')[0];

let archived = 0;
let skipped  = 0;
let alreadyArchived = 0;

/**
 * Parse YAML frontmatter from a Markdown file.
 * Returns { frontmatterStr, body } — does NOT use a YAML parser
 * to avoid adding a dependency. Only touches `status` and `archivedDate`.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  return {
    frontmatterStr: match[1],
    body: content.slice(match[0].length),
    raw: match[0],
  };
}

function extractField(frontmatterStr, key) {
  const match = frontmatterStr.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+)["']?`, 'm'));
  return match ? match[1].trim() : null;
}

function setField(frontmatterStr, key, value) {
  // Replace existing field
  if (frontmatterStr.match(new RegExp(`^${key}:`, 'm'))) {
    return frontmatterStr.replace(
      new RegExp(`^(${key}:\\s*).*$`, 'm'),
      `$1"${value}"`
    );
  }
  // Add field after `deadline:` line
  return frontmatterStr.replace(
    /^(deadline:.*)$/m,
    `$1\narchivedDate: "${value}"`
  );
}

async function processDir(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // Directory doesn't exist yet
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await processDir(fullPath);
      continue;
    }

    if (!entry.name.endsWith('.md')) continue;

    const content = await readFile(fullPath, 'utf8');
    const parsed = parseFrontmatter(content);
    if (!parsed) continue;

    const status   = extractField(parsed.frontmatterStr, 'status');
    const deadline = extractField(parsed.frontmatterStr, 'deadline');

    if (!deadline) {
      console.warn(`⚠ No deadline in ${entry.name} — skipped`);
      skipped++;
      continue;
    }

    if (status === 'archived') {
      alreadyArchived++;
      continue;
    }

    const deadlineDate = new Date(deadline);
    deadlineDate.setHours(0, 0, 0, 0);

    if (deadlineDate < today) {
      console.log(`📦 Archiving: ${entry.name} (deadline: ${deadline})`);
      archived++;

      if (!DRY_RUN) {
        // Update status → archived
        let newFm = parsed.frontmatterStr.replace(
          /^(status:\s*).*$/m,
          `$1"archived"`
        );
        // Add archivedDate
        newFm = setField(newFm, 'archivedDate', todayStr);

        const newContent = `---\n${newFm}\n---${parsed.body}`;
        await writeFile(fullPath, newContent, 'utf8');
      }
    } else {
      // Check if status needs to be closing-soon
      const daysLeft = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 30 && status !== 'closing-soon') {
        console.log(`⚡ Marking closing-soon: ${entry.name} (${daysLeft}d left)`);
        if (!DRY_RUN) {
          const newFm = parsed.frontmatterStr.replace(
            /^(status:\s*).*$/m,
            `$1"closing-soon"`
          );
          const newContent = `---\n${newFm}\n---${parsed.body}`;
          await writeFile(fullPath, newContent, 'utf8');
        }
      }
    }
  }
}

await processDir(contentRoot);

console.log(`\n✅ Done.`);
console.log(`   Archived:        ${archived}`);
console.log(`   Already archived: ${alreadyArchived}`);
console.log(`   Skipped (no deadline): ${skipped}`);

if (DRY_RUN && archived > 0) {
  console.log('\n💡 Run with --write to apply these changes.');
}
