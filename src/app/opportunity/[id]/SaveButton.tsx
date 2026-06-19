// src/app/opportunity/[id]/SaveButton.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function SaveButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to save. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button onClick={handleSave} disabled={saving} className="btn-secondary text-sm">
        {saving ? "Saving…" : "Save opportunity"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
