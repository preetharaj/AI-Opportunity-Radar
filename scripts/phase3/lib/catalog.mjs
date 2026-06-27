// scripts/phase3/lib/catalog.mjs
//
// Shared read-only helpers for parsing src/lib/data/opportunities.ts as
// plain text. Both discover.mjs (needs existing ids, to avoid proposing
// duplicates) and check-links.mjs (needs id+source pairs, to check links)
// independently re-implemented the same extraction regex before this file
// existed — centralizing it here means the catalog's id/field conventions
// only need to be encoded once. If the catalog's id format ever changes
// (e.g. a different slug convention), this is the one place to update.
//
// Deliberately regex-based, not a TS/AST parser, for the same reason noted
// in discover.mjs: this is read-only extraction feeding either a duplicate
// check or a link check, not data the app depends on being perfectly
// parsed. A missed entry just means one fewer id checked, never silent
// corruption — both callers already treat their result sets this way.

const ID_RE = /id:\s*"([a-z0-9-]+)"/;
const SOURCE_RE = /source:\s*"([^"]+)"/;

/**
 * Returns the full set of opportunity ids currently in the catalog file's
 * text content. Used by discover.mjs to avoid proposing a duplicate id.
 */
export function extractExistingIds(fileContent) {
  const ids = new Set();
  const re = new RegExp(ID_RE, "g");
  let m;
  while ((m = re.exec(fileContent))) ids.add(m[1]);
  return ids;
}

/**
 * Returns { id, source } pairs for every entry in the catalog file's text
 * content. Used by check-links.mjs to know what to ping.
 *
 * Splits on the same `\n  {` boundary discover.mjs's renderCandidateAsTs
 * emits for each object literal, so this stays correct as long as both
 * files agree on indentation (2 spaces) — which they do, since
 * renderCandidateAsTs in discover.mjs follows the same convention as the
 * existing, human-authored entries in opportunities.ts.
 */
export function extractIdAndSourcePairs(fileContent) {
  const objectBlocks = fileContent.split(/\n  \{/).slice(1);
  const entries = [];
  for (const block of objectBlocks) {
    const id = block.match(ID_RE)?.[1];
    const source = block.match(SOURCE_RE)?.[1];
    if (id && source) entries.push({ id, source });
  }
  return entries;
}
