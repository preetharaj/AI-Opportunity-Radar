#!/usr/bin/env node
/**
 * new-opportunity.mjs
 * ─────────────────────────────────────────────────────────
 * CLI helper to scaffold a new opportunity Markdown file.
 * Creates the file with all required frontmatter fields pre-filled.
 *
 * Usage:
 *   node scripts/new-opportunity.mjs
 *   node scripts/new-opportunity.mjs --category grants --slug my-grant-2025
 *
 * Then open the generated file and fill in the real data.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CATEGORIES = ['grants', 'fellowships', 'startup-programs', 'competitions', 'courses'];

// Parse CLI args
const args = process.argv.slice(2);
let argCategory = args[args.indexOf('--category') + 1];
let argSlug = args[args.indexOf('--slug') + 1];

// Simple readline prompt
async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Slugify a string
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Get category
let category = argCategory;
if (!CATEGORIES.includes(category)) {
  console.log('\nAvailable categories:');
  CATEGORIES.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
  const choice = await prompt('\nChoose category (number or name): ');
  const idx = parseInt(choice, 10);
  category = idx >= 1 && idx <= CATEGORIES.length
    ? CATEGORIES[idx - 1]
    : CATEGORIES.find(c => c === choice) ?? CATEGORIES[0];
}

// Get slug
let slug = argSlug;
if (!slug) {
  const title = await prompt('Opportunity title (for filename): ');
  const year = new Date().getFullYear();
  slug = slugify(title) + `-${year}`;
  console.log(`  → Slug: ${slug}`);
}

const today = new Date().toISOString().split('T')[0];
const outputDir = join(__dirname, '..', 'content', 'opportunities', category);
const outputPath = join(outputDir, `${slug}.md`);

await mkdir(outputDir, { recursive: true });

const template = `---
# ============================================================
# NEW OPPORTUNITY — Fill in all fields before publishing
# ============================================================
title: "REPLACE: Full opportunity title"
provider: "REPLACE: Organisation name"
category: "${category}"
deadline: "REPLACE: YYYY-MM-DD"
amount: "REPLACE: e.g. $50,000 or Free"
region: "REPLACE: e.g. Global, USA, Europe"
eligibility: "REPLACE: Who can apply — be specific"
summary: "REPLACE: 1-2 sentence summary. Be specific about what this offers and who it's for."
applyLink: "REPLACE: https://..."
sourceLink: "REPLACE: https://... (official announcement page)"
publicationDate: "${today}"
# Status options: active | closing-soon | archived
# closing-soon = deadline within 30 days
status: "active"
tags: ["REPLACE", "add-relevant-tags"]
# Remove the line below when this is real data
sampleData: true
---

REPLACE: Write a clear description of this opportunity.

Include:
- What it offers (money, mentorship, access, etc.)
- Who it's designed for
- Key dates or timeline
- How to apply (steps, requirements)
- Any important eligibility details not in the frontmatter

> ⚠️ **Sample Placeholder** — Replace all REPLACE fields with real verified data before publishing.
`;

await writeFile(outputPath, template, 'utf8');
console.log(`\n✅ Created: content/opportunities/${category}/${slug}.md`);
console.log('\nNext steps:');
console.log('  1. Open the file and fill in all REPLACE fields');
console.log('  2. Verify the deadline, apply link, and eligibility from the official source');
console.log('  3. Remove or set sampleData: false when real');
console.log('  4. Run: npm run build');
