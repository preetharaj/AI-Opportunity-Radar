// src/components/opportunity/OpportunityCard.tsx
"use client";
import Link from "next/link";
import type { ScoredOpportunity, ApplicationStatus } from "@/lib/types";
import { deadlineShortDisplay, isRollingOpportunity } from "@/lib/deadlines";

const TIER_STYLES = {
  likely: "bg-emerald-50 text-emerald-700 border-emerald-200",
  maybe: "bg-amber-50 text-amber-700 border-amber-200",
  unlikely: "bg-gray-50 text-gray-500 border-gray-200",
};
const TIER_LABELS = { likely: "✓ Likely eligible", maybe: "~ Maybe eligible", unlikely: "✗ Unlikely" };

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  saved: "bg-gray-100 text-gray-600",
  researching: "bg-blue-50 text-blue-700",
  applied: "bg-indigo-50 text-indigo-700",
  interview: "bg-purple-50 text-purple-700",
  rejected: "bg-red-50 text-red-600",
  accepted: "bg-emerald-50 text-emerald-700",
};

const CAT_ICONS: Record<string, string> = {
  grant: "💰", fellowship: "🎓",
  startup: "🚀", course: "📚", internship: "💼",
};

function DeadlineBadge({ opp }: { opp: ScoredOpportunity }) {
  const rolling = isRollingOpportunity(opp);
  const days = opp.daysUntilDeadline;
  const cls = rolling ? "text-slate-600 font-medium" :
    days !== null && days <= 7 ? "text-red-600 font-semibold" :
    days !== null && days <= 30 ? "text-amber-600 font-medium" : "text-gray-500";
  return <span className={`text-xs ${cls}`}>{deadlineShortDisplay(opp)}</span>;
}

interface Props {
  opp: ScoredOpportunity & { matchReasons?: string[] };
  onSave?: (id: string) => void;
  onUnsave?: (id: string) => void;
  showStatus?: boolean;
}

export function OpportunityCard({ opp, onSave, onUnsave, showStatus }: Props) {
  return (
    <div className="card p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-base">{CAT_ICONS[opp.category]}</span>
            <span className="text-xs text-gray-400 uppercase tracking-wide">{opp.category}</span>
            <span className="text-xs text-gray-300">·</span>
            <span className="text-xs text-gray-400">{opp.region}</span>
            {opp.newThisWeek && (
              <span className="badge bg-indigo-50 text-indigo-600 border border-indigo-100">New</span>
            )}
          </div>

          <Link href={`/opportunity/${opp.id}`} className="hover:text-indigo-600 transition-colors">
            <h3 className="text-sm font-semibold text-gray-900 leading-snug">{opp.title}</h3>
          </Link>

          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{opp.hook}</p>
        </div>

        {/* Score */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-lg font-bold text-indigo-600">{opp.score}</span>
          <span className="text-xs text-gray-400">match</span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`badge border ${TIER_STYLES[opp.eligibilityTier]}`}>
            {TIER_LABELS[opp.eligibilityTier]}
          </span>
          {showStatus && opp.applicationStatus && (
            <span className={`badge ${STATUS_COLORS[opp.applicationStatus]}`}>
              {opp.applicationStatus}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <DeadlineBadge opp={opp} />
          {opp.isSaved ? (
            <button
              onClick={() => onUnsave?.(opp.id)}
              className="btn-ghost text-xs"
              title="Remove bookmark"
            >
              🔖
            </button>
          ) : (
            <button
              onClick={() => onSave?.(opp.id)}
              className="btn-secondary text-xs"
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
