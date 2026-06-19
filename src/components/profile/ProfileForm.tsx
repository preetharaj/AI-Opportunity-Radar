// src/components/profile/ProfileForm.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/types";

const STATUSES = [
  { value: "undergrad", label: "Undergraduate student" },
  { value: "postgrad", label: "Postgraduate / PhD" },
  { value: "early_career", label: "Early-career professional" },
  { value: "other", label: "Other" },
];

const REGIONS = ["Global", "India", "SEA", "Europe", "USA", "Australia"];

const INTEREST_OPTIONS = [
  "AI", "machine learning", "research", "climate", "health", "education",
  "open source", "entrepreneurship", "NLP", "computer vision", "robotics",
  "policy", "nonprofit", "data science", "deep learning",
];

interface Props {
  initial?: Partial<Profile>;
  isOnboarding?: boolean;
}

export function ProfileForm({ initial, isOnboarding }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    status: initial?.status ?? "undergrad",
    region: initial?.region ?? "India",
    interests: initial?.interests ?? [],
    focusAreas: initial?.focusAreas ?? "",
    emailMode: initial?.emailMode ?? "digest",
    emailNewMatches: initial?.emailNewMatches ?? true,
  });

  function toggleInterest(tag: string) {
    setForm((f) => ({
      ...f,
      interests: f.interests.includes(tag)
        ? f.interests.filter((i) => i !== tag)
        : f.interests.length >= 8 ? f.interests : [...f.interests, tag],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.interests.length === 0) { setError("Select at least one interest."); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed to save."); return; }
      router.push(isOnboarding ? "/discover" : "/settings");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      {/* Status */}
      <div>
        <label className="label">Current status *</label>
        <select
          value={form.status}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as any }))}
          className="input"
          required
        >
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Region */}
      <div>
        <label className="label">Your region *</label>
        <select
          value={form.region}
          onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
          className="input"
          required
        >
          {REGIONS.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>

      {/* Interests */}
      <div>
        <label className="label">Interests * (pick 1–8)</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {INTEREST_OPTIONS.map((tag) => {
            const selected = form.interests.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleInterest(tag)}
                className={`badge border cursor-pointer transition-colors ${
                  selected
                    ? "bg-indigo-100 text-indigo-700 border-indigo-300"
                    : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-1">{form.interests.length}/8 selected</p>
      </div>

      {/* Focus areas */}
      <div>
        <label className="label">Focus areas (optional)</label>
        <textarea
          value={form.focusAreas}
          onChange={(e) => setForm((f) => ({ ...f, focusAreas: e.target.value.slice(0, 200) }))}
          className="input h-20 resize-none"
          placeholder="e.g. NLP for low-resource languages, climate tech startups…"
          maxLength={200}
        />
        <p className="text-xs text-gray-400">{form.focusAreas.length}/200</p>
      </div>

      {!isOnboarding && (
        <>
          <div>
            <label className="label">Email digest mode</label>
            <select
              value={form.emailMode}
              onChange={(e) => setForm((f) => ({ ...f, emailMode: e.target.value as any }))}
              className="input"
            >
              <option value="digest">Biweekly digest</option>
              <option value="per_event">Per deadline</option>
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.emailNewMatches}
              onChange={(e) => setForm((f) => ({ ...f, emailNewMatches: e.target.checked }))}
              className="rounded"
            />
            Email me when new opportunities match my profile
          </label>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
        {saving ? "Saving…" : isOnboarding ? "Get started →" : "Save profile"}
      </button>
    </form>
  );
}
