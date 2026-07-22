// src/lib/remote.ts
// Single source of truth for "is this genuinely remote-anywhere" — used by
// both the homepage filter and the card badge so they can never disagree.
//
// BUG this fixes: the filter used to check only `remoteEligibleRegions`.
// Most entries never set that field — their actual restriction lives in
// `eligibleResidenceRegions` instead (e.g. a Fractional CTO role tagged
// region: "USA" with eligibleResidenceRegions: ["USA"]). Checking only
// remoteEligibleRegions treated "field not set" as "no restriction," which
// is wrong: absence of remoteEligibleRegions just means nobody filled in
// that specific field, not that the role is open to any country. The result
// was fractional jobs and an India-only fellowship showing up under
// "Remote — Anywhere" despite being tied to one country.
//
// Fix: a role only counts as anywhere-remote if isRemote is true AND
// *neither* remoteEligibleRegions *nor* eligibleResidenceRegions carries a
// restriction. Either field having entries means "restricted," full stop.

import type { Opportunity } from "@/lib/types";

function hasResidencyRestriction(opp: Opportunity): boolean {
  return (
    (!!opp.remoteEligibleRegions && opp.remoteEligibleRegions.length > 0) ||
    (!!opp.eligibleResidenceRegions && opp.eligibleResidenceRegions.length > 0)
  );
}

/** Genuinely open to any country — the "Remote — Anywhere" bucket. */
export function isAnywhereRemote(opp: Opportunity): boolean {
  return !!opp.isRemote && !hasResidencyRestriction(opp);
}

/** Remote, but tied to a specific country/region — the "Region-Specific" bucket. */
export function isRegionRestrictedRemote(opp: Opportunity): boolean {
  return !!opp.isRemote && hasResidencyRestriction(opp);
}
