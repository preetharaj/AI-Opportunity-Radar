import { NextResponse } from "next/server";
import { getOpportunityById } from "@/lib/data/opportunities";
import { isRollingOpportunity, makeDeadlineIcs, makeIcsFilename } from "@/lib/deadlines";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const opp = getOpportunityById(params.id);

  if (!opp) {
    return NextResponse.json({ error: "Unknown opportunity" }, { status: 404 });
  }

  if (isRollingOpportunity(opp)) {
    return NextResponse.json(
      { error: "Rolling opportunities do not have fixed deadline calendar files" },
      { status: 400 },
    );
  }

  const ics = makeDeadlineIcs(opp);
  if (!ics) {
    // makeDeadlineIcs returns null for two reasons: rolling (already handled above)
    // or an invalid/malformed deadline date string. Both are 400s but different messages.
    return NextResponse.json(
      { error: "Calendar file unavailable — deadline date appears malformed. Please report this." },
      { status: 400 },
    );
  }

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${makeIcsFilename(opp)}"`,
      "Cache-Control": "no-store",
    },
  });
}
