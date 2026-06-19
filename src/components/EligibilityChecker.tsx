// src/components/EligibilityChecker.tsx
"use client";
import { useState } from "react";
import { checkEligibility } from "@/lib/matching/eligibility";
import type { Opportunity, EligibilityCheckInput, EducationLevel, ExperienceLevel, Region } from "@/lib/types";

const EDUCATION_OPTIONS: { value: EducationLevel; label: string }[] = [
  { value: "high_school", label: "High school" },
  { value: "undergrad", label: "Undergraduate" },
  { value: "postgrad_masters", label: "Master's" },
  { value: "postgrad_phd", label: "PhD" },
  { value: "early_career", label: "Early-career professional" },
  { value: "any", label: "Other / not a student" },
];

const EXPERIENCE_OPTIONS: { value: ExperienceLevel; label: string }[] = [
  { value: "none", label: "No prior experience" },
  { value: "some_projects", label: "Some personal/academic projects" },
  { value: "1_3_years", label: "1–3 years" },
  { value: "3_plus_years", label: "3+ years" },
];

const REGION_OPTIONS: (Region | "Other")[] = ["India", "SEA", "Europe", "USA", "Australia", "Global", "Other"];

const TIER_STYLES = {
  likely: "bg-emerald-50 text-emerald-700 border-emerald-200",
  maybe: "bg-amber-50 text-amber-700 border-amber-200",
  unlikely: "bg-gray-50 text-gray-500 border-gray-200",
};
const TIER_LABELS = { likely: "Likely eligible", maybe: "Maybe eligible", unlikely: "Unlikely eligible" };
const TIER_ICONS = { likely: "✓", maybe: "~", unlikely: "✗" };

export function EligibilityChecker({ opportunity }: { opportunity: Opportunity }) {
  const [input, setInput] = useState<EligibilityCheckInput>({
    educationLevel: "undergrad",
    fieldOfStudy: "",
    citizenshipRegion: "India",
    residenceRegion: "India",
    age: 22,
    experienceLevel: "some_projects",
  });
  const [result, setResult] = useState<ReturnType<typeof checkEligibility> | null>(null);

  function handleCheck(e: React.FormEvent) {
    e.preventDefault();
    setResult(checkEligibility(input, opportunity));
  }

  function update<K extends keyof EligibilityCheckInput>(key: K, value: EligibilityCheckInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
    setResult(null); // invalidate stale result when inputs change
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">🔍</span>
        <p className="text-sm font-semibold text-gray-900">Check your eligibility</p>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Answer a few quick questions — nothing is saved, this just checks against this opportunity's stated criteria.
      </p>

      <form onSubmit={handleCheck} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Education level</label>
            <select
              value={input.educationLevel}
              onChange={(e) => update("educationLevel", e.target.value as EducationLevel)}
              className="input"
            >
              {EDUCATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Field of study</label>
            <input
              type="text"
              value={input.fieldOfStudy}
              onChange={(e) => update("fieldOfStudy", e.target.value.slice(0, 60))}
              placeholder="e.g. Computer Science"
              className="input"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Citizenship</label>
            <select
              value={input.citizenshipRegion}
              onChange={(e) => update("citizenshipRegion", e.target.value as Region | "Other")}
              className="input"
            >
              {REGION_OPTIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Current residence</label>
            <select
              value={input.residenceRegion}
              onChange={(e) => update("residenceRegion", e.target.value as Region | "Other")}
              className="input"
            >
              {REGION_OPTIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Age</label>
            <input
              type="number"
              min={14}
              max={90}
              value={input.age}
              onChange={(e) => update("age", Math.max(14, Math.min(90, Number(e.target.value) || 14)))}
              className="input"
            />
          </div>
          <div>
            <label className="label">Relevant experience</label>
            <select
              value={input.experienceLevel}
              onChange={(e) => update("experienceLevel", e.target.value as ExperienceLevel)}
              className="input"
            >
              {EXPERIENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <button type="submit" className="btn-primary w-full justify-center">
          Check eligibility
        </button>
      </form>

      {result && (
        <div className={`mt-4 rounded-lg p-3 border ${TIER_STYLES[result.tier]}`}>
          <p className="text-sm font-semibold">
            {TIER_ICONS[result.tier]} {TIER_LABELS[result.tier]}
          </p>
          {result.reasons.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {result.reasons.map((r, i) => (
                <li key={i} className="text-xs opacity-80">✓ {r}</li>
              ))}
            </ul>
          )}
          {result.concerns.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {result.concerns.map((c, i) => (
                <li key={i} className="text-xs opacity-80">⚠ {c}</li>
              ))}
            </ul>
          )}
          <p className="text-xs opacity-60 mt-2">
            This is an estimate based on stated criteria — always confirm on the official source.
          </p>
        </div>
      )}
    </div>
  );
}
