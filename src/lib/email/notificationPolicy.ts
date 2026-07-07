import type { Opportunity } from "@/lib/types";
import { daysUntilDeadline, isFixedDeadlineOpportunity } from "@/lib/deadlines";

export const FOLLOW_REMINDER_DAYS = [7, 3, 1, 0] as const;
export const DEFAULT_BIWEEKLY_DIGEST_START_DATE = "2026-06-22";

export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function utcStartOfDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function isMondayUtc(date: Date): boolean {
  return date.getUTCDay() === 1;
}

export function isBiweeklyDigestDay(date: Date, startDate = DEFAULT_BIWEEKLY_DIGEST_START_DATE): boolean {
  if (!isMondayUtc(date)) return false;

  const start = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || start.getUTCDay() !== 1) {
    throw new Error(`BIWEEKLY_DIGEST_START_DATE must be a valid Monday YYYY-MM-DD date. Received: ${startDate}`);
  }

  const today = utcStartOfDate(date);
  const daysSinceStart = Math.round((today.getTime() - start.getTime()) / 86_400_000);
  return daysSinceStart >= 0 && daysSinceStart % 14 === 0;
}

export function getClosingWithin7Days(opportunities: Opportunity[], today: Date): Array<{ opp: Opportunity; daysLeft: number }> {
  return opportunities
    .filter(isFixedDeadlineOpportunity)
    .map((opp) => ({ opp, daysLeft: daysUntilDeadline(opp, today) }))
    .filter((item): item is { opp: Opportunity; daysLeft: number } => item.daysLeft !== null && item.daysLeft >= 0 && item.daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft || a.opp.title.localeCompare(b.opp.title));
}

export function getFollowReminderCandidates(opportunities: Opportunity[], today: Date): Array<{ opp: Opportunity; daysLeft: number }> {
  const thresholds = new Set<number>(FOLLOW_REMINDER_DAYS);
  return opportunities
    .filter(isFixedDeadlineOpportunity)
    .map((opp) => ({ opp, daysLeft: daysUntilDeadline(opp, today) }))
    .filter((item): item is { opp: Opportunity; daysLeft: number } => item.daysLeft !== null && thresholds.has(item.daysLeft));
}

export function getBiweeklyNewOpportunities(opportunities: Opportunity[], today: Date): Opportunity[] {
  const fourteenDaysAgo = new Date(today.getTime() - 14 * 86_400_000);
  return opportunities
    .filter((opp) => {
      const days = daysUntilDeadline(opp, today);
      if (!(days === null || days >= 0)) return false;
      if (!opp.newThisWeek) return false;
      const verified = new Date(opp.lastVerified);
      return !Number.isNaN(verified.getTime()) && verified >= fourteenDaysAgo;
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}
