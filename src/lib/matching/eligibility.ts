// src/lib/matching/eligibility.ts
// Stateless eligibility checker. Takes the form input + an opportunity's
// criteria fields and returns Likely / Maybe / Unlikely with reasons.
// No account, no persistence — purely a function of (input, opportunity).
import type { EligibilityCheckInput, EligibilityTier, Opportunity, ExperienceLevel } from "@/lib/types";

const EXPERIENCE_ORDER: ExperienceLevel[] = ["none", "some_projects", "1_3_years", "3_plus_years"];

function experienceMeetsMin(have: ExperienceLevel, min: ExperienceLevel): boolean {
  return EXPERIENCE_ORDER.indexOf(have) >= EXPERIENCE_ORDER.indexOf(min);
}

export interface EligibilityResult {
  tier: EligibilityTier;
  reasons: string[];      // positive signals
  concerns: string[];     // things that lower or block eligibility
}

export function checkEligibility(input: EligibilityCheckInput, opp: Opportunity): EligibilityResult {
  const reasons: string[] = [];
  const concerns: string[] = [];
  let hardFail = false; // any hard constraint violated → Unlikely, regardless of other signals

  // Education level
  // "any" in the opportunity's allowed list means "no restriction" — it should
  // never be compared literally against the user's actual selected level.
  if (opp.eligibleEducationLevels && opp.eligibleEducationLevels.length > 0) {
    const isOpenToAll = opp.eligibleEducationLevels.includes("any");
    if (isOpenToAll || opp.eligibleEducationLevels.includes(input.educationLevel)) {
      reasons.push(isOpenToAll ? "Open to all education levels" : "Your education level matches");
    } else {
      hardFail = true;
      concerns.push("Education level doesn't match the stated requirement");
    }
  }

  // Field of study (soft match — substring, case-insensitive)
  if (opp.eligibleFields && opp.eligibleFields.length > 0) {
    const fieldLower = input.fieldOfStudy.trim().toLowerCase();
    const matches = fieldLower.length > 0 && opp.eligibleFields.some(
      (f) => f.toLowerCase().includes(fieldLower) || fieldLower.includes(f.toLowerCase())
    );
    if (matches) {
      reasons.push("Your field of study fits");
    } else if (fieldLower.length > 0) {
      concerns.push("Field of study may not be a direct fit — worth double-checking");
    }
  }

  // Citizenship
  if (opp.eligibleCitizenshipRegions && opp.eligibleCitizenshipRegions.length > 0) {
    if (input.citizenshipRegion !== "Other" && opp.eligibleCitizenshipRegions.includes(input.citizenshipRegion)) {
      reasons.push("Citizenship requirement met");
    } else {
      hardFail = true;
      concerns.push("Citizenship requirement likely not met");
    }
  }

  // Residence
  if (opp.eligibleResidenceRegions && opp.eligibleResidenceRegions.length > 0) {
    if (input.residenceRegion !== "Other" && opp.eligibleResidenceRegions.includes(input.residenceRegion)) {
      reasons.push("Residency requirement met");
    } else {
      hardFail = true;
      concerns.push("Residency requirement likely not met");
    }
  }

  // Age
  if (opp.minAge !== undefined && input.age < opp.minAge) {
    hardFail = true;
    concerns.push(`Below minimum age of ${opp.minAge}`);
  }
  if (opp.maxAge !== undefined && input.age > opp.maxAge) {
    hardFail = true;
    concerns.push(`Above maximum age of ${opp.maxAge}`);
  }
  if (
    (opp.minAge === undefined || input.age >= opp.minAge) &&
    (opp.maxAge === undefined || input.age <= opp.maxAge) &&
    (opp.minAge !== undefined || opp.maxAge !== undefined)
  ) {
    reasons.push("Age requirement met");
  }

  // Experience level
  if (opp.minExperienceLevel) {
    if (experienceMeetsMin(input.experienceLevel, opp.minExperienceLevel)) {
      reasons.push("Experience level sufficient");
    } else {
      concerns.push("May need more experience than you currently have");
    }
  }

  let tier: EligibilityTier;
  if (hardFail) {
    tier = "unlikely";
  } else if (concerns.length === 0) {
    tier = "likely";
  } else {
    tier = "maybe";
  }

  // If the opportunity has no criteria fields set at all, fall back to "maybe"
  // with a note — we genuinely don't know without more curated data.
  const hasAnyCriteria =
    (opp.eligibleEducationLevels?.length ?? 0) > 0 ||
    (opp.eligibleFields?.length ?? 0) > 0 ||
    (opp.eligibleCitizenshipRegions?.length ?? 0) > 0 ||
    (opp.eligibleResidenceRegions?.length ?? 0) > 0 ||
    opp.minAge !== undefined ||
    opp.maxAge !== undefined ||
    !!opp.minExperienceLevel;

  if (!hasAnyCriteria) {
    return {
      tier: "maybe",
      reasons: [],
      concerns: ["This opportunity doesn't have detailed eligibility criteria yet — check the official source"],
    };
  }

  return { tier, reasons, concerns };
}
