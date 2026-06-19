// src/app/api/subscribe/route.ts
// Public route — no session required. Rate-limited by IP via header fallback.
import { NextRequest, NextResponse } from "next/server";
import { addSubscriber, removeSubscriber } from "@/lib/db/queries";
import { SubscribeSchema, UnsubscribeSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/ratelimit";

function getClientKey(req: NextRequest): string {
  // Best-effort client identifier for rate limiting on a public, unauthenticated route
  return req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`subscribe:${getClientKey(req)}`, 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = SubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const { alreadySubscribed } = await addSubscriber(parsed.data.email);
  return NextResponse.json({ ok: true, alreadySubscribed });
}

export async function DELETE(req: NextRequest) {
  if (!rateLimit(`unsubscribe:${getClientKey(req)}`, 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = UnsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  await removeSubscriber(parsed.data.email);
  return NextResponse.json({ ok: true });
}
