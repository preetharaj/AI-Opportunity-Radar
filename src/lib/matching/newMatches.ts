// src/lib/matching/newMatches.ts
import { opportunities } from "@/lib/data/opportunities";
import { scoreOpportunity } from "./score";
import type { Profile } from "@/lib/types";
import { differenceInDays, parseISO } from "date-fns";

// An opportunity counts as a "new match" worth emailing about if:
// - it's not expired
// - it's "newThisWeek" (freshly added to the curated list) AND scores at least "maybe"
// This avoids spamming users with the same matches every single day.
export function findNewMatches(profile: Profile) {
  const today = new Date();
  return opportunities.filter((opp) => {
    const days = differenceInDays(parseISO(opp.deadline), today);
    if (days < 0) return false;
    if (!opp.newThisWeek) return false;
    const match = scoreOpportunity(opp, profile);
    return match.tier !== "unlikely";
  });
}
