// src/app/saved/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { getSaved } from "@/lib/db/queries";
import { getOpportunityById } from "@/lib/data/opportunities";
import { rankOpportunities } from "@/lib/matching/score";
import { getProfile } from "@/lib/db/queries";
import { DiscoverFeed } from "@/app/discover/DiscoverFeed";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";


export default async function SavedPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const [profile, saved] = await Promise.all([
    getProfile(session.user.id),
    getSaved(session.user.id),
  ]);
  if (!profile) redirect("/onboarding");

  const savedIds = new Set(saved.map((s) => s.opportunityId));
  const rawOpps = saved
    .map((s) => getOpportunityById(s.opportunityId))
    .filter(Boolean) as any[];

  const ranked = rankOpportunities(rawOpps, profile, savedIds, false).map((o) => ({
    ...o,
    applicationStatus: saved.find((s) => s.opportunityId === o.id)?.status,
  }));

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-gray-900">Saved</h1>
        <p className="text-sm text-gray-500">{ranked.length} saved opportunit{ranked.length !== 1 ? "ies" : "y"}</p>
      </div>

      {ranked.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">Nothing saved yet.</p>
          <Link href="/discover" className="text-indigo-500 text-sm mt-1 inline-block">Browse opportunities →</Link>
        </div>
      ) : (
        <DiscoverFeed opportunities={ranked} />
      )}
    </div>
  );
}
