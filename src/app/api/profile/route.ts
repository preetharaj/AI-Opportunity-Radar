// src/app/api/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { upsertProfile } from "@/lib/db/queries";
import { ProfileSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!rateLimit(`profile:${session.user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  await upsertProfile(session.user.id, {
    ...parsed.data,
    userId: session.user.id,
  } as any);

  return NextResponse.json({ ok: true });
}
