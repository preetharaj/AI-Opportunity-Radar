// scripts/phase3/schema.mjs
//
// Single source of truth for what a "candidate opportunity" must look like.
// This mirrors src/lib/types.ts (`Opportunity`) field-for-field. If that type
// changes, update this schema in the same PR — they are not auto-synced.
//
// Used by:
//   - discover.mjs        (validates LLM output before it's allowed into a PR)
//   - lib/ollama.mjs       (derives the JSON Schema passed to Ollama's `format`
//                            field, so the model is constrained at decode time,
//                            not just checked after the fact)
//
// Deliberately stricter than the live Opportunity type in a few places
// (e.g. minLength on free-text fields, enum-only category/region) because
// candidates are unverified LLM output, not hand-entered data. A human
// reviewer is the final gate, but garbage should never even reach the PR.

import { z } from "zod";

// Keep this list in sync with `Region` in src/lib/types.ts.
export const REGIONS = ["Global", "India", "SEA", "Europe", "USA", "Australia"];

// Keep this list in sync with `Opportunity.category` in src/lib/types.ts.
export const CATEGORIES = ["grant", "fellowship", "course", "internship", "fractional_job"];

// Mirrors EducationLevel in src/lib/types.ts. Optional on the candidate —
// absence means "no constraint," same convention as the live schema.
export const EDUCATION_LEVELS = [
  "high_school",
  "undergrad",
  "postgrad_masters",
  "postgrad_phd",
  "early_career",
  "any",
];

export const EXPERIENCE_LEVELS = ["none", "some_projects", "1_3_years", "3_plus_years"];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date string YYYY-MM-DD");

export const CandidateOpportunitySchema = z.object({
  // Slug-style id, same convention as existing entries
  // (e.g. "anthropic-fellows-program-2026-rolling").
  id: z
    .string()
    .min(8)
    .max(120)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be lowercase kebab-case"),

  title: z.string().min(8).max(160),
  category: z.enum(CATEGORIES),
  region: z.enum(REGIONS),
  deadline: isoDate,
  eligibility: z.string().min(10).max(600),

  // Discovery agent doesn't know the catalog's internal scoring model, so it
  // proposes a default rather than guessing — these are clamped, not trusted,
  // and a reviewer is expected to sanity-check them like every other field.
  minScore: z.number().int().min(0).max(10).default(5),
  maybeScore: z.number().int().min(0).max(10).default(2),

  targetStatus: z
    .array(z.enum(["undergrad", "postgrad", "early_career", "other"]))
    .min(1),

  tags: z.array(z.string().min(1).max(50)).min(1).max(10),

  // SECURITY: z.string().url() alone accepts any scheme Node's URL parser
  // accepts — including `javascript:`, `data:`, `vbscript:`. The live app
  // renders this field directly as <a href={opp.source}> in both
  // PublicFeed.tsx and opportunity/[id]/page.tsx with no further
  // sanitization, so an unvalidated scheme here is a real injection path
  // if a reviewer merges without manually re-checking the literal URL
  // string (which the PR review checklist asks for, but shouldn't be the
  // only layer). Restricting to http/https closes it at the schema level
  // regardless of reviewer diligence.
  source: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), { message: "source must be an http(s) URL" }),

  description: z.string().min(40).max(1200),
  hook: z.string().min(10).max(220),

  effortLevel: z.enum(["low", "medium", "high"]),

  // Set by discover.mjs at write time, not by the model — the model should
  // never claim to have "verified" anything itself.
  lastVerified: isoDate.optional(),

  eligibleEducationLevels: z.array(z.enum(EDUCATION_LEVELS)).optional(),
  eligibleFields: z.array(z.string().min(1).max(60)).optional(),
  eligibleCitizenshipRegions: z.array(z.enum(REGIONS)).optional(),
  eligibleResidenceRegions: z.array(z.enum(REGIONS)).optional(),
  minAge: z.number().int().min(0).max(120).optional(),
  maxAge: z.number().int().min(0).max(120).optional(),
  minExperienceLevel: z.enum(EXPERIENCE_LEVELS).optional(),

  // Required from the agent, never silently defaulted: forces it to surface
  // doubt rather than padding a confident-sounding entry. Reviewers read
  // this first.
  uncertaintyNotes: z.string().max(400),
});

// The agent's full structured response for one search pass: zero or more
// candidates it's proposing, plus the ones it looked at and discarded.
export const DiscoveryResponseSchema = z.object({
  candidates: z.array(CandidateOpportunitySchema).max(8),
  rejected: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        reason: z.string().min(1).max(300),
      })
    )
    .default([]),
});

/**
 * Validate one candidate. Returns { ok: true, data } or { ok: false, errors }.
 * Never throws — callers decide what to do with a bad candidate (drop it,
 * log it, surface it in the PR body as a rejection), but a thrown exception
 * here would crash the whole weekly job over one bad entry.
 */
export function validateCandidate(raw) {
  const result = CandidateOpportunitySchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

/**
 * Validate the whole structured response from one discovery pass.
 */
export function validateDiscoveryResponse(raw) {
  const result = DiscoveryResponseSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}
