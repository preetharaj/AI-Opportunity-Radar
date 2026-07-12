// src/app/page.tsx
// Homepage = public Discover feed. No login wall — anyone can browse.
// Auth code stays in the repo (see FEATURE_FLAGS.showSignIn) for later use.
import { Suspense } from "react";
import Link from "next/link";
import { opportunities } from "@/lib/data/opportunities";
import { FilterBar } from "@/components/opportunity/FilterBar";
import { SubscribeWidget } from "@/components/SubscribeWidget";
import { PublicFeed } from "./PublicFeed";
import { daysUntilDeadline, isFixedDeadlineOpportunity, sortDeadlineValue } from "@/lib/deadlines";

// Build-time trust signals — plain text, computed once from the static
// catalog. Not client state, so they show up in the first server-rendered
// HTML for crawlers and AI engines to lift directly.
function computeStats() {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const active = opportunities.filter((o) => !isFixedDeadlineOpportunity(o) || o.deadline >= todayStr);
  const closingSoon = active.filter((o) => {
    const d = daysUntilDeadline(o, today);
    return d !== null && d >= 0 && d <= 14;
  }).length;
  const regions = new Set(active.map((o) => o.region));
  const mostRecentVerified = active.reduce((latest, o) => (o.lastVerified > latest ? o.lastVerified : latest), "");

  return {
    total: active.length,
    closingSoon,
    regionCount: regions.size,
    mostRecentVerified,
  };
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";


interface Props {
  searchParams: { region?: string; category?: string; sort?: string; q?: string };
}

export default function HomePage({ searchParams }: Props) {
  let list = opportunities
    .map((o) => ({ ...o, daysUntilDeadline: daysUntilDeadline(o, new Date()) }))
    .filter((o) => o.daysUntilDeadline === null || o.daysUntilDeadline >= 0);

  if (searchParams.region && searchParams.region !== "All") {
    list = list.filter((o) => o.region === searchParams.region || o.region === "Global");
  }
  if (searchParams.category && searchParams.category !== "All") {
    list = list.filter((o) => o.category === searchParams.category);
  }
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    list = list.filter(
      (o) => o.title.toLowerCase().includes(q) || o.hook.toLowerCase().includes(q) || o.tags.some((t) => t.toLowerCase().includes(q))
    );
  }
  if (searchParams.sort === "newest") {
    list = [...list].sort((a, b) => (b.newThisWeek ? 1 : 0) - (a.newThisWeek ? 1 : 0));
  } else {
    list = [...list].sort((a, b) => sortDeadlineValue(a) - sortDeadlineValue(b));
  }

  const stats = computeStats();

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-slate-200/70 bg-white shadow-sm" id="subscribe">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.16),transparent_34%),radial-gradient(circle_at_85%_15%,rgba(14,165,233,0.14),transparent_30%)]" />
        <div className="relative grid md:grid-cols-[1fr_360px] gap-8 items-center p-6 sm:p-8 lg:p-10">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50/80 px-3 py-1 text-xs font-medium text-indigo-700 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
              Curated AI, ML & technology opportunities
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl sm:text-5xl lg:text-6xl font-semibold text-slate-950 leading-[1.03] tracking-[-0.04em]">
              AI Opportunity Radar
            </h1>
            <p className="mt-5 max-w-2xl text-xl sm:text-2xl font-medium text-slate-800 leading-8">
              Discover curated AI, ML and technology opportunities from leading organizations worldwide.
            </p>
            <p className="mt-4 max-w-2xl text-base sm:text-lg text-slate-600 leading-8">
              Curated opportunities for students, researchers, founders and builders. Updated biweekly with grants, fellowships, internships, courses, and fractional jobs worldwide.
            </p>
          </div>
          <SubscribeWidget />
        </div>
      </section>

      {/* Build-time trust signals — plain server-rendered text, no client JS */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600 border-y border-slate-200/70 py-3">
        <span><strong className="text-slate-900">{stats.total}</strong> active opportunities</span>
        <span><strong className="text-slate-900">{stats.closingSoon}</strong> closing within 14 days</span>
        <span><strong className="text-slate-900">{stats.regionCount}</strong> regions covered</span>
        {stats.mostRecentVerified && (
          <span>Most recently verified <strong className="text-slate-900">{stats.mostRecentVerified}</strong></span>
        )}
        <Link href="/about" className="text-indigo-600 hover:underline">How we verify →</Link>
      </div>

      <Suspense fallback={<div className="h-10 mb-4" />}>
        <FilterBar />
      </Suspense>
      <PublicFeed opportunities={list} />
    </div>
  );
}
