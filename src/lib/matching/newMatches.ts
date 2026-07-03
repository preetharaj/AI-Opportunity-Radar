// src/lib/matching/newMatches.ts
import { opportunities } from "@/lib/data/opportunities";
import { scoreOpportunity } from "./score";
import type { Profile } from "@/lib/types";
import { daysUntilDeadline } from "@/lib/deadlines";

// An opportunity counts as a "new match" worth emailing about if:
// - it's not expired
// - it's "newThisWeek" (freshly added to the curated list) AND scores at least "maybe"
// - it was lastVerified within the current digest cycle (14 days)
//
// The lastVerified gate is critical: newThisWeek is a static boolean in
// opportunities.ts that is never automatically reset between digest cycles.
// Without the date gate, per_event users would receive the same "new matches"
// email every single day until someone manually edits the catalog.
export function findNewMatches(profile: Profile, since?: Date) {
  const today = new Date();
  const cutoff = since ?? new Date(today.getTime() - 14 * 86_400_000);

  return opportunities.filter((opp) => {
    const days = daysUntilDeadline(opp, today);
    if (days !== null && days < 0) return false;
    if (!opp.newThisWeek) return false;
    // Only include opportunities verified within the current 14-day cycle.
    const verified = new Date(opp.lastVerified);
    if (verified < cutoff) return false;
    const match = scoreOpportunity(opp, profile);
    return match.tier !== "unlikely";
  });
}
