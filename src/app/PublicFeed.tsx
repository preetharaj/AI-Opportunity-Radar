// src/app/PublicFeed.tsx
"use client";
import Link from "next/link";
import type { Opportunity } from "@/lib/types";
import { deadlineShortDisplay, isRollingOpportunity } from "@/lib/deadlines";

const CAT_LABELS: Record<string, string> = {
  grant: "Grant", fellowship: "Fellowship",
  course: "Course", internship: "Internship",
  fractional_job: "Fractional job",
};

interface PublicOpp extends Opportunity {
  daysUntilDeadline: number | null;
}

function formatDeadline(deadline: string): string {
  const d = new Date(deadline);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatusPill({ opp, days, isNew }: { opp: Opportunity; days: number | null; isNew?: boolean }) {
  const pills: { label: string; cls: string }[] = [];
  if (isNew) pills.push({ label: "New", cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" });
  if (isRollingOpportunity(opp)) pills.push({ label: "Rolling", cls: "bg-slate-50 text-slate-700 ring-1 ring-slate-200" });
  else if (days !== null && days <= 14 && days >= 0) pills.push({ label: "Closing soon", cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-100" });
  else if (days !== null && days > 14) pills.push({ label: "Active", cls: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100" });
  if (pills.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5">
      {pills.map((p) => (
        <span key={p.label} className={`text-xs font-medium px-2.5 py-1 rounded-md ${p.cls}`}>
          {p.label}
        </span>
      ))}
    </div>
  );
}

const BORDER_COLOR_MAP: Record<string, string> = {
  grant: "bg-emerald-400",
  fellowship: "bg-indigo-400",
  course: "bg-sky-400",
  internship: "bg-teal-400",
  fractional_job: "bg-violet-400",
};

// Tailwind's compiler statically scans source for literal class strings —
// it can't see classes built by string interpolation (e.g. `border-l-${x}`).
// Using a 3px colored bg bar instead of a border-l-* utility sidesteps that
// entirely, since every value above is a complete, literal class name.
function CategoryAccent({ category }: { category: string }) {
  return <span className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl ${BORDER_COLOR_MAP[category] ?? "bg-slate-300"}`} />;
}

function CostBadge({ costType }: { costType?: "free" | "paid" | "scholarship_available" }) {
  if (!costType) return null;
  if (costType === "free") {
    return <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">🟢 Free</span>;
  }
  if (costType === "scholarship_available") {
    return <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 ring-1 ring-amber-100">🟡 Scholarship Available</span>;
  }
  return <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 ring-1 ring-sky-100">🔵 Paid</span>;
}

function IconRow({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-slate-600">
      <span className="text-sm shrink-0">{icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function PublicFeed({ opportunities }: { opportunities: PublicOpp[] }) {
  if (opportunities.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-sm">No opportunities match your current filters.</p>
        <a href="/" className="text-indigo-500 text-sm mt-1 inline-block">Reset filters</a>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {opportunities.map((opp) => {
        const days = opp.daysUntilDeadline;
        const rolling = isRollingOpportunity(opp);
        const deadlineColor = rolling ? "text-slate-600" : days !== null && days <= 14 ? "text-rose-600" : days !== null && days <= 30 ? "text-amber-600" : "text-slate-600";
        return (
          <div
            key={opp.id}
            className="group relative bg-white/95 rounded-2xl border border-slate-200/80 p-5 pl-6 shadow-sm shadow-slate-200/60 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-xl hover:shadow-slate-200/80 transition-all duration-200 flex flex-col overflow-hidden"
          >
            <CategoryAccent category={opp.category} />
            <div className="flex items-center justify-between mb-2 gap-2">
              <StatusPill opp={opp} days={days} isNew={opp.newThisWeek} />
              <span className="text-[11px] text-slate-400 uppercase tracking-wide shrink-0">
                {CAT_LABELS[opp.category]}
              </span>
            </div>

            <Link href={`/opportunities/${opp.id}`} className="hover:text-indigo-600 transition-colors">
              <h3 className="text-[15px] font-semibold text-slate-950 leading-snug mb-1">{opp.title}</h3>
            </Link>
            {opp.hook && (
              <p className="text-xs text-indigo-700/90 leading-snug mb-2 line-clamp-2">💡 {opp.hook}</p>
            )}
            {opp.costType && (
              <div className="mb-2">
                <CostBadge costType={opp.costType} />
              </div>
            )}

            <div className="space-y-1.5 flex-1 mt-1">
              <IconRow icon="📅">
                <span className={`font-medium ${deadlineColor}`}>{rolling ? "Rolling" : formatDeadline(opp.deadline)}</span>
                {!rolling && <span className="text-slate-400"> ({deadlineShortDisplay(opp)})</span>}
              </IconRow>
              <IconRow icon="🌍">
                {opp.locationNote ? `${opp.region} (${opp.locationNote})` : opp.region === "Global" ? "Global (Remote)" : opp.region}
              </IconRow>
              <IconRow icon="👤">
                {opp.eligibility}
              </IconRow>
            </div>

            <div className="flex justify-end mt-3 pt-3 border-t border-slate-100">
              <a href={opp.source} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs">
                View ↗
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
