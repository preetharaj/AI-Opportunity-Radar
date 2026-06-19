// src/app/tracking/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { getSaved } from "@/lib/db/queries";
import { getOpportunityById } from "@/lib/data/opportunities";
import { PipelineBoard } from "./PipelineBoard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";


const STATUSES = ["saved", "researching", "applied", "interview", "rejected", "accepted"] as const;

export default async function TrackingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const saved = await getSaved(session.user.id);

  const items = saved
    .map((s) => {
      const opp = getOpportunityById(s.opportunityId);
      if (!opp) return null;
      return { ...s, opportunity: opp };
    })
    .filter(Boolean) as any[];

  const grouped = Object.fromEntries(
    STATUSES.map((status) => [status, items.filter((i: any) => i.status === status)])
  );

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-gray-900">Application Tracker</h1>
        <p className="text-sm text-gray-500">{items.length} application{items.length !== 1 ? "s" : ""} tracked</p>
      </div>
      <PipelineBoard grouped={grouped} statuses={STATUSES} />
    </div>
  );
}
