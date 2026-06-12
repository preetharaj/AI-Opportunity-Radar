/**
 * content.ts — Content loading utilities for AI Opportunity Radar
 *
 * All opportunity data lives in /content/opportunities/{category}/*.md
 * These helpers load, parse, and sort them for use in Astro pages.
 *
 * No database. No API. Pure static.
 */

export type OpportunityStatus = 'active' | 'closing-soon' | 'archived';

export interface Opportunity {
  slug: string;
  category: string;
  title: string;
  provider: string;
  deadline: string;
  amount: string;
  region: string;
  eligibility: string;
  summary: string;
  applyLink: string;
  sourceLink: string;
  publicationDate: string;
  status: OpportunityStatus;
  tags: string[];
  sampleData?: boolean;
  body?: string;
}

export interface WeeklyDigest {
  slug: string;
  title: string;
  weekNumber: number;
  publishDate: string;
  summary: string;
  featured: string[];
  sampleData?: boolean;
  body?: string;
}

/** All valid opportunity categories */
export const CATEGORIES = [
  { slug: 'grants',           label: 'Grants',          icon: '💰', description: 'Research grants and funding programs' },
  { slug: 'fellowships',      label: 'Fellowships',     icon: '🎓', description: 'Fellowship programs for researchers and students' },
  { slug: 'startup-programs', label: 'Startup Programs',icon: '🚀', description: 'Accelerators, incubators, and startup credits' },
  { slug: 'competitions',     label: 'Competitions',    icon: '🏆', description: 'Challenges, hackathons, and prize competitions' },
  { slug: 'courses',          label: 'Courses',         icon: '📚', description: 'Free and funded AI/ML courses and programs' },
  { slug: 'residencies',      label: 'Residencies',     icon: '🔬', description: 'Paid research residencies at AI labs and companies' },
] as const;

/**
 * Returns true if an opportunity's deadline has passed.
 * Used by the archive script and status display logic.
 */
export function isExpired(deadline: string): boolean {
  const d = new Date(deadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

/**
 * Returns true if deadline is within the next 30 days.
 */
export function isClosingSoon(deadline: string): boolean {
  const d = new Date(deadline);
  const today = new Date();
  const in30 = new Date();
  in30.setDate(today.getDate() + 30);
  return d >= today && d <= in30;
}

/**
 * Sort opportunities: closing-soon first, then active by deadline, then archived.
 */
export function sortOpportunities(opps: Opportunity[]): Opportunity[] {
  const priority = (o: Opportunity) => {
    if (o.status === 'closing-soon') return 0;
    if (o.status === 'active') return 1;
    return 2;
  };
  return [...opps].sort((a, b) => {
    const pd = priority(a) - priority(b);
    if (pd !== 0) return pd;
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });
}

/**
 * Format a deadline string as a human-readable date.
 */
export function formatDeadline(deadline: string): string {
  return new Date(deadline).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

/**
 * Days remaining until a deadline. Negative = already passed.
 */
export function daysUntil(deadline: string): number {
  const d = new Date(deadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
