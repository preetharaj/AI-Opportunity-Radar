// src/app/discover/DiscoverFeed.tsx
"use client";
import { useState } from "react";
import { OpportunityCard } from "@/components/opportunity/OpportunityCard";
import type { ScoredOpportunity, ApplicationStatus } from "@/lib/types";

type Props = {
  opportunities: (ScoredOpportunity & { matchReasons?: string[]; applicationStatus?: ApplicationStatus })[];
};

export function DiscoverFeed({ opportunities: initial }: Props) {
  const [savedSet, setSavedSet] = useState(
    new Set(initial.filter((o) => o.isSaved).map((o) => o.id))
  );
  // Per-card in-flight tracking — saving one card no longer disables every other card
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [errorFor, setErrorFor] = useState<string | null>(null);

  function setPendingFor(id: string, isPending: boolean) {
    setPending((prev) => {
      const next = new Set(prev);
      if (isPending) next.add(id); else next.delete(id);
      return next;
    });
  }

  async function save(opportunityId: string) {
    setPendingFor(opportunityId, true);
    setErrorFor(null);
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId }),
      });
      if (!res.ok) {
        setErrorFor(opportunityId);
        return; // don't update local state — keep it in sync with what actually happened
      }
      setSavedSet((s) => new Set([...s, opportunityId]));
    } catch {
      setErrorFor(opportunityId);
    } finally {
      setPendingFor(opportunityId, false);
    }
  }

  async function unsave(opportunityId: string) {
    setPendingFor(opportunityId, true);
    setErrorFor(null);
    try {
      const res = await fetch("/api/save", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId }),
      });
      if (!res.ok) {
        setErrorFor(opportunityId);
        return;
      }
      setSavedSet((s) => { const n = new Set(s); n.delete(opportunityId); return n; });
    } catch {
      setErrorFor(opportunityId);
    } finally {
      setPendingFor(opportunityId, false);
    }
  }

  if (initial.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-sm">No opportunities match your current filters.</p>
        <a href="/discover" className="text-indigo-500 text-sm mt-1 inline-block">Reset filters</a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {errorFor && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          Couldn't update that opportunity. Try again.
        </div>
      )}
      {initial.map((opp) => (
        <OpportunityCard
          key={opp.id}
          opp={{ ...opp, isSaved: savedSet.has(opp.id) }}
          onSave={pending.has(opp.id) ? undefined : save}
          onUnsave={pending.has(opp.id) ? undefined : unsave}
        />
      ))}
    </div>
  );
}
