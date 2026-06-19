// src/app/api/save/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { upsertSaved, deleteSaved } from "@/lib/db/queries";
import { SaveSchema, DeleteSavedSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/ratelimit";
import { getOpportunityById } from "@/lib/data/opportunities";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!rateLimit(`save:${session.user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  // Validate opportunity exists in our curated list
  if (!getOpportunityById(parsed.data.opportunityId)) {
    return NextResponse.json({ error: "Unknown opportunity" }, { status: 404 });
  }

  await upsertSaved(session.user.id, parsed.data.opportunityId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!rateLimit(`save:${session.user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = DeleteSavedSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  await deleteSaved(session.user.id, parsed.data.opportunityId);
  return NextResponse.json({ ok: true });
}
