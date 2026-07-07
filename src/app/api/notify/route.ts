// src/app/api/notify/route.ts
// Called by GitHub Actions cron. Protected by CRON_SECRET.
// Public email model:
// 1) Followed-opportunity reminders: exact 7/3/1/0 day reminders only to people
//    who clicked "Remind me" for that opportunity.
// 2) Weekly closing roundup: every Monday, all subscribers, opportunities closing
//    within 7 days.
// 3) Biweekly new-opportunity digest: every second Monday, all subscribers.
//
// Important production detail: subscriber sends are processed as cursor-based
// batches. 3.2k+ emails should not be sent in one serverless request.
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  deleteExpiredSessions,
  getActiveFollowsForOpportunityIdsPage,
  getActiveSubscribersPage,
  getProfileByUserEmail,
  getUsersForReminders,
  hasNotificationBeenSent,
  markNotificationDeliveryFailed,
  markNotificationDeliverySent,
  recordNotificationSent,
  reserveNotificationDelivery,
} from "@/lib/db/queries";
import {
  sendBiweeklyNewsletterDigest,
  sendDeadlineReminder,
  sendFollowedOpportunityReminder,
  sendNewMatchDigest,
  sendWeeklyClosingRoundup,
} from "@/lib/email/sender";
import { getOpportunityById, opportunities } from "@/lib/data/opportunities";
import { findNewMatches } from "@/lib/matching/newMatches";
import { daysUntilDeadline } from "@/lib/deadlines";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import type { Opportunity } from "@/lib/types";
import { getBiweeklyNewOpportunities, getClosingWithin7Days, getFollowReminderCandidates, isBiweeklyDigestDay, isMondayUtc, isoDay } from "@/lib/email/notificationPolicy";

const SEND_CONCURRENCY = Math.max(1, Number(process.env.NOTIFY_SEND_CONCURRENCY ?? 5));
const BATCH_LIMIT = Math.max(1, Math.min(Number(process.env.NOTIFY_BATCH_LIMIT ?? 250), 1000));
const BIWEEKLY_DIGEST_START_DATE = process.env.BIWEEKLY_DIGEST_START_DATE;

type NotifyPhase = "daily" | "weekly" | "biweekly";
type SendWork = () => Promise<boolean>;

type FollowCursor = { email: string; opportunityId: string };

function encodeFollowCursor(cursor: FollowCursor | null): string | null {
  if (!cursor) return null;
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeFollowCursor(raw: string | null): FollowCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<FollowCursor>;
    if (typeof parsed.email === "string" && typeof parsed.opportunityId === "string") return { email: parsed.email, opportunityId: parsed.opportunityId };
  } catch {
    // ignored below
  }
  throw new Error("Invalid follow reminder cursor.");
}

function requestedPhase(req: NextRequest): NotifyPhase {
  const phase = req.nextUrl.searchParams.get("phase") ?? "daily";
  if (phase === "daily" || phase === "weekly" || phase === "biweekly") return phase;
  throw new Error("Invalid phase. Use daily, weekly, or biweekly.");
}

async function runWithConcurrency(tasks: SendWork[], concurrency = SEND_CONCURRENCY): Promise<number> {
  let sent = 0;
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const current = tasks[next++];
      if (await current()) sent++;
    }
  }
  const workerCount = Math.min(concurrency, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return sent;
}

async function withoutAlreadySent(
  email: string,
  notificationType: string,
  items: Array<{ opp: Opportunity; daysLeft: number }>
): Promise<Array<{ opp: Opportunity; daysLeft: number }>> {
  const pending: Array<{ opp: Opportunity; daysLeft: number }> = [];
  for (const item of items) {
    const alreadySent = await hasNotificationBeenSent({ email, notificationType, opportunityId: item.opp.id, daysLeft: item.daysLeft });
    if (!alreadySent) pending.push(item);
  }
  return pending;
}

async function markSent(email: string, notificationType: string, items: Array<{ opp: Opportunity; daysLeft: number }>): Promise<void> {
  for (const item of items) {
    await recordNotificationSent({ email, notificationType, opportunityId: item.opp.id, daysLeft: item.daysLeft });
  }
}

async function runDormantAccountFlow(today: Date, errors: string[]) {
  if (!FEATURE_FLAGS.showSignIn) {
    return { usersChecked: 0, accountDeadlineRemindersSent: 0, matchDigestsSent: 0 };
  }

  try {
    await deleteExpiredSessions();
  } catch (err) {
    errors.push(`deleteExpiredSessions: ${err instanceof Error ? err.message : String(err)}`);
  }

  const fourteenDaysAgo = new Date(today.getTime() - 14 * 86_400_000);
  const users = await getUsersForReminders();
  let accountDeadlineRemindersSent = 0;
  let matchDigestsSent = 0;

  for (const user of users) {
    try {
      const toRemind = user.opportunities
        .map((oppId) => {
          const opp = getOpportunityById(oppId);
          if (!opp) return null;
          const days = daysUntilDeadline(opp, today);
          if (days !== null && days >= 0 && user.emailReminders.includes(days)) return { opp, daysLeft: days };
          return null;
        })
        .filter(Boolean) as Array<{ opp: Opportunity; daysLeft: number }>;

      const pending = await withoutAlreadySent(user.email, "account_deadline", toRemind);
      if (pending.length > 0) {
        await sendDeadlineReminder(user.email, pending);
        await markSent(user.email, "account_deadline", pending);
        accountDeadlineRemindersSent++;
      }

      const shouldCheckMatches = user.emailMode === "per_event" || isBiweeklyDigestDay(today, BIWEEKLY_DIGEST_START_DATE);
      if (shouldCheckMatches) {
        const profile = await getProfileByUserEmail(user.email);
        if (profile?.emailNewMatches) {
          const matches = findNewMatches(profile, fourteenDaysAgo);
          const matchItems = matches.map((opp) => ({ opp, daysLeft: -1 }));
          const pendingMatches = await withoutAlreadySent(user.email, "new_match", matchItems);
          if (pendingMatches.length > 0) {
            await sendNewMatchDigest(user.email, pendingMatches.map((m) => m.opp));
            await markSent(user.email, "new_match", pendingMatches);
            matchDigestsSent++;
          }
        }
      }
    } catch (err) {
      const msg = `user ${user.email}: ${err instanceof Error ? err.message : String(err)}`;
      console.error("[notify] dormant account flow error:", msg);
      errors.push(msg);
    }
  }

  return { usersChecked: users.length, accountDeadlineRemindersSent, matchDigestsSent };
}

async function sendWithReservation(sendKey: string, send: () => Promise<void>, errors: string[]): Promise<boolean> {
  try {
    await send();
    await markNotificationDeliverySent(sendKey);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markNotificationDeliveryFailed(sendKey, message);
    errors.push(message);
    return false;
  }
}

async function runDailyFollowedReminders(today: Date, cursorRaw: string | null, errors: string[]) {
  const cursor = decodeFollowCursor(cursorRaw);
  const followCandidates = getFollowReminderCandidates(opportunities, today);
  const page = await getActiveFollowsForOpportunityIdsPage(followCandidates.map((c) => c.opp.id), {
    cursorEmail: cursor?.email,
    cursorOpportunityId: cursor?.opportunityId,
    limit: BATCH_LIMIT,
  });
  const candidateById = new Map(followCandidates.map((c) => [c.opp.id, c]));

  const sent = await runWithConcurrency(page.follows.flatMap((follow): SendWork[] => {
    const item = candidateById.get(follow.opportunityId);
    if (!item) return [];
    return [async () => {
      const sendKey = `follow:${follow.email}:${item.opp.id}:${item.opp.deadline}:${item.daysLeft}`;
      const reserved = await reserveNotificationDelivery({
        email: follow.email,
        notificationType: "follow_deadline",
        sendKey,
        opportunityId: item.opp.id,
        deadlineDate: item.opp.deadline,
        daysLeft: item.daysLeft,
      });
      if (!reserved) return false;
      return sendWithReservation(sendKey, () => sendFollowedOpportunityReminder(follow.email, item), errors);
    }];
  }));

  return { sent, hasMore: page.hasMore, nextCursor: encodeFollowCursor(page.nextCursor) };
}

async function runWeeklyClosingRoundup(today: Date, cursor: string | null, todayKey: string, errors: string[]) {
  if (!isMondayUtc(today)) return { sent: 0, hasMore: false, nextCursor: null as string | null, skipped: "not_monday" };
  const closing = getClosingWithin7Days(opportunities, today);
  if (closing.length === 0) return { sent: 0, hasMore: false, nextCursor: null as string | null, skipped: "no_closing_opportunities" };

  const page = await getActiveSubscribersPage({ cursor, limit: BATCH_LIMIT });
  const sent = await runWithConcurrency(page.emails.map((email) => async () => {
    const sendKey = `weekly-closing:${email}:${todayKey}`;
    const reserved = await reserveNotificationDelivery({ email, notificationType: "weekly_closing_roundup", sendKey });
    if (!reserved) return false;
    return sendWithReservation(sendKey, () => sendWeeklyClosingRoundup(email, closing), errors);
  }));

  return { sent, hasMore: page.hasMore, nextCursor: page.nextCursor, skipped: null as string | null };
}

async function runBiweeklyDigest(today: Date, cursor: string | null, todayKey: string, errors: string[]) {
  if (!isBiweeklyDigestDay(today, BIWEEKLY_DIGEST_START_DATE)) return { sent: 0, hasMore: false, nextCursor: null as string | null, skipped: "not_biweekly_monday" };
  const newThisCycle = getBiweeklyNewOpportunities(opportunities, today);
  if (newThisCycle.length === 0) return { sent: 0, hasMore: false, nextCursor: null as string | null, skipped: "no_new_opportunities" };

  const page = await getActiveSubscribersPage({ cursor, limit: BATCH_LIMIT });
  const sent = await runWithConcurrency(page.emails.map((email) => async () => {
    const sendKey = `biweekly-new:${email}:${todayKey}`;
    const reserved = await reserveNotificationDelivery({ email, notificationType: "biweekly_new_digest", sendKey });
    if (!reserved) return false;
    return sendWithReservation(sendKey, () => sendBiweeklyNewsletterDigest(email, newThisCycle), errors);
  }));

  return { sent, hasMore: page.hasMore, nextCursor: page.nextCursor, skipped: null as string | null };
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let phase: NotifyPhase;
  try {
    phase = requestedPhase(req);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }

  const today = new Date();
  const todayKey = isoDay(today);
  const cursor = req.nextUrl.searchParams.get("cursor");
  const errors: string[] = [];

  const dormant = phase === "daily" && !cursor ? await runDormantAccountFlow(today, errors) : { usersChecked: 0, accountDeadlineRemindersSent: 0, matchDigestsSent: 0 };

  let result: { sent: number; hasMore: boolean; nextCursor: string | null; skipped?: string | null };
  try {
    if (phase === "daily") result = await runDailyFollowedReminders(today, cursor, errors);
    else if (phase === "weekly") result = await runWeeklyClosingRoundup(today, cursor, todayKey, errors);
    else result = await runBiweeklyDigest(today, cursor, todayKey, errors);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    result = { sent: 0, hasMore: false, nextCursor: null };
  }

  return NextResponse.json(
    {
      ok: errors.length === 0,
      date: todayKey,
      phase,
      batchLimit: BATCH_LIMIT,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
      skipped: result.skipped ?? undefined,
      weeklyClosingDay: isMondayUtc(today),
      biweeklyDigestDay: isBiweeklyDigestDay(today, BIWEEKLY_DIGEST_START_DATE),
      dormantAccountFlowEnabled: FEATURE_FLAGS.showSignIn,
      usersChecked: dormant.usersChecked,
      accountDeadlineRemindersSent: dormant.accountDeadlineRemindersSent,
      matchDigestsSent: dormant.matchDigestsSent,
      sent: result.sent,
      errors: errors.length > 0 ? errors : undefined,
    },
    { status: errors.length > 0 ? 207 : 200 }
  );
}
