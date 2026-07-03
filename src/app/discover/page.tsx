// src/app/discover/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { getProfile, getSaved } from "@/lib/db/queries";
import { opportunities } from "@/lib/data/opportunities";
import { rankOpportunities } from "@/lib/matching/score";
import { sortDeadlineValue } from "@/lib/deadlines";
import { FilterBar } from "@/components/opportunity/FilterBar";
import { DiscoverFeed } from "./DiscoverFeed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";


interface Props {
  searchParams: { region?: string; category?: string; eligibility?: string; sort?: string; q?: string };
}

export default async function DiscoverPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const profile = await getProfile(session.user.id);
  if (!profile) redirect("/onboarding");

  const saved = await getSaved(session.user.id);
  const savedIds = new Set(saved.map((s) => s.opportunityId));
  const savedStatuses = Object.fromEntries(saved.map((s) => [s.opportunityId, s.status]));

  let ranked = rankOpportunities(opportunities, profile, savedIds);

  // Apply filters from searchParams
  if (searchParams.region && searchParams.region !== "All") {
    ranked = ranked.filter((o) => o.region === searchParams.region || o.region === "Global");
  }
  if (searchParams.category && searchParams.category !== "All") {
    ranked = ranked.filter((o) => o.category === searchParams.category);
  }
  if (searchParams.eligibility && searchParams.eligibility !== "All") {
    ranked = ranked.filter((o) => o.eligibilityTier === searchParams.eligibility);
  }
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    ranked = ranked.filter(
      (o) => o.title.toLowerCase().includes(q) || o.hook.toLowerCase().includes(q) || o.tags.some((t) => t.includes(q))
    );
  }
  if (searchParams.sort === "deadline") {
    ranked.sort((a, b) => sortDeadlineValue(a) - sortDeadlineValue(b));
  }

  const scoredWithStatus = ranked.map((o) => ({
    ...o,
    applicationStatus: savedStatuses[o.id],
  }));

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-gray-900">Discover</h1>
        <p className="text-sm text-gray-500">{ranked.length} opportunities matched to your profile</p>
      </div>
      <FilterBar />
      <DiscoverFeed opportunities={scoredWithStatus} />
    </div>
  );
}
