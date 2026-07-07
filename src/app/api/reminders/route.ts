// src/app/api/reminders/route.ts
// Public, email-keyed "Remind me" endpoint. No login, password, session, or
// account creation. The email + opportunity ID is the identity pair.
import { NextRequest, NextResponse } from "next/server";
import { getOpportunityById } from "@/lib/data/opportunities";
import { isFixedDeadlineOpportunity, daysUntilDeadline } from "@/lib/deadlines";
import { unsubscribeEmailFollow, upsertEmailFollow } from "@/lib/db/queries";
import { ReminderFollowSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getClientKey(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

async function parseReminderRequest(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { error: NextResponse.json({ error: "Invalid JSON." }, { status: 400 }) };
  }

  const parsed = ReminderFollowSchema.safeParse(body);
  if (!parsed.success) {
    return { error: NextResponse.json({ error: "Enter a valid email address." }, { status: 400 }) };
  }

  const opportunity = getOpportunityById(parsed.data.opportunityId);
  if (!opportunity) {
    return { error: NextResponse.json({ error: "Opportunity not found." }, { status: 404 }) };
  }

  return { data: parsed.data, opportunity };
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`remind-me:${getClientKey(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const parsed = await parseReminderRequest(req);
  if (parsed.error) return parsed.error;
  const { data, opportunity } = parsed;

  if (!isFixedDeadlineOpportunity(opportunity)) {
    return NextResponse.json({ error: "This opportunity has a rolling deadline, so reminders are not available." }, { status: 400 });
  }

  const daysLeft = daysUntilDeadline(opportunity);
  if (daysLeft === null || daysLeft < 0) {
    return NextResponse.json({ error: "This opportunity has already closed." }, { status: 400 });
  }

  const result = await upsertEmailFollow(data.email, data.opportunityId);
  if (result.blockedByGlobalUnsubscribe) {
    return NextResponse.json(
      { error: "This email is globally unsubscribed. Subscribe again first if you want reminders." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, alreadyFollowing: result.alreadyFollowing });
}

export async function DELETE(req: NextRequest) {
  if (!rateLimit(`unfollow:${getClientKey(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const parsed = await parseReminderRequest(req);
  if (parsed.error) return parsed.error;
  const { data } = parsed;
  const removed = await unsubscribeEmailFollow(data.email, data.opportunityId);
  return NextResponse.json({ ok: true, removed });
}
