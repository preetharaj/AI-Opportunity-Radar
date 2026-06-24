// src/lib/types.ts

export type UserStatus = "undergrad" | "postgrad" | "early_career" | "other";
export type EmailMode = "digest" | "per_event";
export type ApplicationStatus = "saved" | "researching" | "applied" | "interview" | "rejected" | "accepted";
export type EligibilityTier = "likely" | "maybe" | "unlikely";
export type Region = "Global" | "India" | "SEA" | "Europe" | "USA" | "Australia";

export type EducationLevel = "high_school" | "undergrad" | "postgrad_masters" | "postgrad_phd" | "early_career" | "any";
export type ExperienceLevel = "none" | "some_projects" | "1_3_years" | "3_plus_years";

// What the public eligibility checker form collects. Nothing persists — this is
// computed client-side per opportunity, no account/profile required.
export interface EligibilityCheckInput {
  educationLevel: EducationLevel;
  fieldOfStudy: string;          // free text, e.g. "Computer Science"
  citizenshipRegion: Region | "Other";
  residenceRegion: Region | "Other";
  age: number;
  experienceLevel: ExperienceLevel;
}

export interface Profile {
  userId: string;
  status: UserStatus;
  region: string;
  interests: string[];   // e.g. ["AI", "research", "climate"]
  focusAreas: string;    // free text, max 200 chars
  emailMode: EmailMode;
  emailReminders: number[]; // days before deadline, e.g. [7, 3, 1]
  emailNewMatches: boolean;
}

export interface Opportunity {
  id: string;
  title: string;
  category: "grant" | "fellowship" | "startup" | "course" | "internship";
  region: Region;
  deadline: string;        // ISO date string
  eligibility: string;     // human-readable summary
  minScore: number;        // score >= this = "likely"
  maybeScore: number;      // score >= this = "maybe"
  targetStatus: UserStatus[];
  tags: string[];          // interest tags
  source: string;          // URL
  description: string;
  hook: string;            // one-sentence why it matters
  effortLevel: "low" | "medium" | "high";
  lastVerified: string;    // ISO date
  newThisWeek?: boolean;
  locationNote?: string;   // optional richer detail, e.g. "Remote and Oxford in-person options"

  // ── Rich eligibility criteria (all optional — absence means "no constraint") ──
  eligibleEducationLevels?: EducationLevel[];  // e.g. ["postgrad_masters", "postgrad_phd"]
  eligibleFields?: string[];                    // e.g. ["Computer Science", "Engineering"] — substring-matched, case-insensitive
  eligibleCitizenshipRegions?: Region[];         // citizenship restriction, if any
  eligibleResidenceRegions?: Region[];           // residence restriction, if any
  minAge?: number;
  maxAge?: number;
  minExperienceLevel?: ExperienceLevel;          // ordered: none < some_projects < 1_3_years < 3_plus_years
}

export interface SavedOpportunity {
  id: string;
  userId: string;
  opportunityId: string;
  status: ApplicationStatus;
  notes: string;
  savedAt: Date;
  updatedAt: Date;
}

export interface ScoredOpportunity extends Opportunity {
  score: number;
  eligibilityTier: EligibilityTier;
  daysUntilDeadline: number;
  isSaved: boolean;
  applicationStatus?: ApplicationStatus;
}

export interface MatchResult {
  score: number;
  tier: EligibilityTier;
  reasons: string[];
}
