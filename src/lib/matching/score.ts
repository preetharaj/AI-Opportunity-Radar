// src/lib/matching/score.ts
// Pure, deterministic — no ML. Server-side only.
import type { Profile, Opportunity, MatchResult, EligibilityTier } from "@/lib/types";
import { differenceInDays, parseISO } from "date-fns";

export function scoreOpportunity(opportunity: Opportunity, profile: Profile): MatchResult {
  let score = 0;
  const reasons: string[] = [];

  // Region match (+3)
  if (opportunity.region === "Global" || opportunity.region === profile.region) {
    score += 3;
    reasons.push(`Open to ${profile.region}`);
  }

  // Status match (+3)
  if (opportunity.targetStatus.length === 0 || opportunity.targetStatus.includes(profile.status)) {
    score += 3;
    reasons.push(`Suits ${profile.status.replace("_", " ")}`);
  }

  // Interest tag overlap (+2 per matching tag, max 3 tags = +6)
  const profileInterests = new Set(profile.interests.map((i) => i.toLowerCase()));
  let tagMatches = 0;
  for (const tag of opportunity.tags) {
    if (tagMatches >= 3) break;
    if (profileInterests.has(tag.toLowerCase())) {
      score += 2;
      tagMatches++;
      reasons.push(`Matches interest: ${tag}`);
    }
  }

  // Deadline modifiers
  const days = differenceInDays(parseISO(opportunity.deadline), new Date());
  if (days > 30) {
    score += 1;
  } else if (days <= 7 && days >= 0) {
    score -= 1;
  }

  // Eligibility tier
  let tier: EligibilityTier;
  if (score >= opportunity.minScore) {
    tier = "likely";
  } else if (score >= opportunity.maybeScore) {
    tier = "maybe";
  } else {
    tier = "unlikely";
  }

  return { score, tier, reasons };
}

export function rankOpportunities<T extends Opportunity>(
  opportunities: T[],
  profile: Profile,
  savedIds: Set<string>,
  excludeExpired: boolean = true
) {
  return opportunities
    .map((opp) => {
      const match = scoreOpportunity(opp, profile);
      const days = differenceInDays(parseISO(opp.deadline), new Date());
      return {
        ...opp,
        score: match.score,
        eligibilityTier: match.tier,
        matchReasons: match.reasons,
        daysUntilDeadline: days,
        isSaved: savedIds.has(opp.id),
      };
    })
    .filter((o) => !excludeExpired || o.daysUntilDeadline >= 0)
    .sort((a, b) => {
      // Primary: score desc. Secondary: deadline asc
      if (b.score !== a.score) return b.score - a.score;
      return a.daysUntilDeadline - b.daysUntilDeadline;
    });
}
