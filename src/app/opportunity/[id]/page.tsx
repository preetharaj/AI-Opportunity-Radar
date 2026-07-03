// src/app/opportunity/[id]/page.tsx
import { notFound } from "next/navigation";
import { getOpportunityById } from "@/lib/data/opportunities";
import { parseISO, format } from "date-fns";
import Link from "next/link";
import { EligibilityChecker } from "@/components/EligibilityChecker";
import { deadlineDisplay, daysUntilDeadline, isRollingOpportunity, makeGoogleCalendarUrl } from "@/lib/deadlines";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";


const CAT_ICONS: Record<string, string> = {
  grant: "💰", fellowship: "🎓",
  startup: "🚀", course: "📚", internship: "💼",
};

const COST_BADGES: Record<string, { label: string; cls: string }> = {
  free: { label: "🟢 Free", cls: "bg-emerald-50 text-emerald-700" },
  scholarship_available: { label: "🟡 Scholarship Available", cls: "bg-amber-50 text-amber-700" },
  paid: { label: "🔵 Paid", cls: "bg-sky-50 text-sky-700" },
};

export default function OpportunityPage({ params }: { params: { id: string } }) {
  const opp = getOpportunityById(params.id);
  if (!opp) notFound();

  const days = daysUntilDeadline(opp, new Date());
  const rolling = isRollingOpportunity(opp);
  const googleCalendarUrl = makeGoogleCalendarUrl(opp);
  const costBadge = opp.costType ? COST_BADGES[opp.costType] : null;

  return (
    <div className="max-w-2xl mx-auto py-4">
      <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 mb-4 inline-block">
        ← Back to all opportunities
      </Link>

      <div className="card p-6 mb-4">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-base">{CAT_ICONS[opp.category]}</span>
          <span className="badge bg-gray-100 text-gray-600">{opp.category.replace("_", " ")}</span>
          <span className="badge bg-gray-100 text-gray-600">{opp.region}</span>
          {opp.newThisWeek && <span className="badge bg-indigo-50 text-indigo-600">New</span>}
          {rolling && <span className="badge bg-slate-50 text-slate-700 border border-slate-200">Rolling</span>}
          {costBadge && <span className={`badge ${costBadge.cls}`}>{costBadge.label}</span>}
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-4">{opp.title}</h1>

        <div className="bg-indigo-50 rounded-lg p-3 mb-4 border border-indigo-100">
          <p className="text-sm text-indigo-800 font-medium">💡 {opp.hook}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
          <div>
            <span className="label">Deadline</span>
            <span className={`font-medium ${days !== null && days <= 7 ? "text-red-600" : days !== null && days <= 30 ? "text-amber-600" : "text-gray-800"}`}>
              {deadlineDisplay(opp)}
            </span>
            {rolling && <p className="text-xs text-gray-500 mt-1">No fixed closing date published. We show this as rolling and exclude it from countdown reminders.</p>}
          </div>
          <div>
            <span className="label">Effort</span>
            <span className="font-medium text-gray-800 capitalize">{opp.effortLevel}</span>
          </div>
          <div className="col-span-2">
            <span className="label">Eligibility summary</span>
            <span className="text-gray-700">{opp.eligibility}</span>
          </div>
          <div>
            <span className="label">Last verified</span>
            <span className="text-emerald-600 font-mono text-xs">{opp.lastVerified}</span>
          </div>
        </div>

        <div className="mb-4">
          <span className="label">Description</span>
          <p className="text-sm text-gray-700 leading-relaxed">{opp.description}</p>
        </div>

        <div className="pt-4 border-t border-gray-100">
          <div className="flex flex-wrap gap-2">
          <a href={opp.source} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm">
            Apply / Official source ↗
          </a>
            {!rolling && googleCalendarUrl && (
              <>
                <a href={`/api/calendar/${opp.id}`} className="btn-secondary text-sm">Download .ics</a>
                <a href={googleCalendarUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm">Add to Google Calendar</a>
              </>
            )}
          </div>
        </div>
      </div>

      <EligibilityChecker opportunity={opp} />
    </div>
  );
}
