// src/app/api/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { updateStatus } from "@/lib/db/queries";
import { StatusUpdateSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/ratelimit";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { getOpportunityById } from "@/lib/data/opportunities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!FEATURE_FLAGS.showSignIn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!rateLimit(`status:${session.user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = StatusUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  if (!getOpportunityById(parsed.data.opportunityId)) {
    return NextResponse.json({ error: "Unknown opportunity" }, { status: 404 });
  }

  const updated = await updateStatus(session.user.id, parsed.data.opportunityId, parsed.data.status);
  if (!updated) {
    return NextResponse.json({ error: "Opportunity not saved by this user" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
