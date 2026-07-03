// src/app/api/notify/route.ts
// Called daily by GitHub Actions cron. Protected by CRON_SECRET.
// Never called from the browser.
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  getUsersForReminders,
  deleteExpiredSessions,
  getProfileByUserEmail,
  getActiveSubscribers,
  getActiveSubscribersForDeadlineReminders,
  hasNotificationBeenSent,
  recordNotificationSent,
} from "@/lib/db/queries";
import {
  sendDeadlineReminder,
  sendNewMatchDigest,
  sendBiweeklyNewsletterDigest,
  sendSubscriberDeadlineReminder,
} from "@/lib/email/sender";
import { getOpportunityById, opportunities } from "@/lib/data/opportunities";
import { findNewMatches } from "@/lib/matching/newMatches";
import type { Opportunity } from "@/lib/types";
import { daysUntilDeadline, isFixedDeadlineOpportunity } from "@/lib/deadlines";

const DEFAULT_SUBSCRIBER_DEADLINE_REMINDERS = [14, 7, 3, 1];
const BIWEEKLY_DIGEST_START_DATE = process.env.BIWEEKLY_DIGEST_START_DATE ?? "2026-06-22"; // Monday UTC

// Digest emails go out once every two weeks on Monday UTC.
// The cron still runs daily so deadline reminders can be sent on the exact threshold day.
function isBiweeklyDigestDay(date: Date): boolean {
  if (date.getUTCDay() !== 1) return false;

  const start = new Date(`${BIWEEKLY_DIGEST_START_DATE}T00:00:00Z`);
  const today = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const daysSinceStart = Math.round((today.getTime() - start.getTime()) / 86_400_000);

  return daysSinceStart >= 0 && daysSinceStart % 14 === 0;
}

function getSubscriberDeadlineMatches(today: Date, reminders: number[] = DEFAULT_SUBSCRIBER_DEADLINE_REMINDERS) {
  const thresholds = new Set(reminders);
  return opportunities
    .filter(isFixedDeadlineOpportunity)
    .map((opp) => ({ opp, daysLeft: daysUntilDeadline(opp, today) }))
    .filter((item): item is { opp: Opportunity; daysLeft: number } => item.daysLeft !== null && item.daysLeft >= 0 && thresholds.has(item.daysLeft));
}

async function withoutAlreadySent(
  email: string,
  notificationType: string,
  items: Array<{ opp: Opportunity; daysLeft: number }>
): Promise<Array<{ opp: Opportunity; daysLeft: number }>> {
  const pending: Array<{ opp: Opportunity; daysLeft: number }> = [];

  for (const item of items) {
    const alreadySent = await hasNotificationBeenSent({
      email,
      notificationType,
      opportunityId: item.opp.id,
      daysLeft: item.daysLeft,
    });
    if (!alreadySent) pending.push(item);
  }

  return pending;
}

async function markSent(
  email: string,
  notificationType: string,
  items: Array<{ opp: Opportunity; daysLeft: number }>
): Promise<void> {
  for (const item of items) {
    await recordNotificationSent({
      email,
      notificationType,
      opportunityId: item.opp.id,
      daysLeft: item.daysLeft,
    });
  }
}

// N2 fix: deduplicate biweekly newsletter sends via notification_log.
// notification_log.days_left is INT NOT NULL — use -1 as a sentinel for
// "newsletter sent this cycle" (not a real daysLeft value; newsletters
// aren't tied to a single opportunity or day count).
async function hasNewsletterBeenSentToday(email: string, today: Date): Promise<boolean> {
  // We use the ISO date string as the opportunityId to make the unique key
  // (email, "newsletter_digest", dateString, -1) — one row per email per digest date.
  const dateKey = today.toISOString().slice(0, 10);
  return hasNotificationBeenSent({
    email,
    notificationType: "newsletter_digest",
    opportunityId: dateKey,
    daysLeft: -1,
  });
}

async function markNewsletterSent(email: string, today: Date): Promise<void> {
  const dateKey = today.toISOString().slice(0, 10);
  await recordNotificationSent({
    email,
    notificationType: "newsletter_digest",
    opportunityId: dateKey,
    daysLeft: -1,
  });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  // Gate for stale newThisWeek entries — only count opportunities verified in the last 14 days.
  const fourteenDaysAgo = new Date(today.getTime() - 14 * 86_400_000);

  const errors: string[] = [];

  try {
    await deleteExpiredSessions();
  } catch (err) {
    // Non-fatal — log and continue. Session cleanup failing doesn't block email sends.
    errors.push(`deleteExpiredSessions: ${err instanceof Error ? err.message : String(err)}`);
  }

  const users = await getUsersForReminders();
  let accountDeadlineRemindersSent = 0;
  let matchDigestsSent = 0;

  for (const user of users) {
    // N4 fix: per-user try/catch so one bad address or Resend error doesn't
    // kill the rest of the queue.
    try {
      // Account/profile flow: remind only for saved/tracked opportunities.
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
        // N5: markSent only runs if send doesn't throw (sender now throws on Resend error).
        await sendDeadlineReminder(user.email, pending);
        await markSent(user.email, "account_deadline", pending);
        accountDeadlineRemindersSent++;
      }

      // New match digest. per_event checks daily. digest checks on the biweekly digest day.
      const shouldCheckMatches = user.emailMode === "per_event" || isBiweeklyDigestDay(today);
      if (shouldCheckMatches) {
        const profile = await getProfileByUserEmail(user.email);
        if (profile?.emailNewMatches) {
          // N1 fix: deduplicate new-match emails via notification_log.
          // findNewMatches returns newThisWeek:true entries — but newThisWeek is never
          // cleared between digest cycles, so without dedup per_event users would get
          // the same "new matches" email every single day until someone manually edits
          // opportunities.ts. The lastVerified gate in findNewMatches handles the
          // "genuinely new" check; notification_log handles the "not already emailed" check.
          const matches = findNewMatches(profile, fourteenDaysAgo);
          // Use daysLeft = -1 as a sentinel (not a real deadline count) to make a
          // unique log key per opportunity per user for this notification type.
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
      console.error("[notify] account flow error:", msg);
      errors.push(msg);
      // Continue — don't let one user's failure block everyone else.
    }
  }

  // Public subscriber flow: no account/login. Subscribers receive:
  // 1) deadline reminders for all curated active opportunities on threshold days, and
  // 2) new-opportunity digest once every two weeks.
  let subscriberDeadlineRemindersSent = 0;
  const subscribersForDeadlines = await getActiveSubscribersForDeadlineReminders();
  for (const subscriber of subscribersForDeadlines) {
    try {
      const matches = getSubscriberDeadlineMatches(today, subscriber.emailDeadlineReminders);
      const pending = await withoutAlreadySent(subscriber.email, "subscriber_deadline", matches);
      if (pending.length > 0) {
        await sendSubscriberDeadlineReminder(subscriber.email, pending);
        await markSent(subscriber.email, "subscriber_deadline", pending);
        subscriberDeadlineRemindersSent++;
      }
    } catch (err) {
      const msg = `subscriber ${subscriber.email}: ${err instanceof Error ? err.message : String(err)}`;
      console.error("[notify] subscriber deadline error:", msg);
      errors.push(msg);
    }
  }

  let newsletterSent = 0;
  if (isBiweeklyDigestDay(today)) {
    const newThisWeek = opportunities.filter((o) => {
      const days = daysUntilDeadline(o, today);
      if (!(days === null || days >= 0)) return false;
      if (!o.newThisWeek) return false;
      // Guard against stale newThisWeek: only include entries verified within
      // the last 14 days (one digest cycle).
      const verified = new Date(o.lastVerified);
      return verified >= fourteenDaysAgo;
    });

    if (newThisWeek.length > 0) {
      const subscribers = await getActiveSubscribers();
      for (const email of subscribers) {
        try {
          // N2 fix: deduplicate — if cron runs twice on the same Monday, skip.
          const alreadySent = await hasNewsletterBeenSentToday(email, today);
          if (alreadySent) continue;

          await sendBiweeklyNewsletterDigest(email, newThisWeek);
          await markNewsletterSent(email, today);
          newsletterSent++;
        } catch (err) {
          const msg = `newsletter ${email}: ${err instanceof Error ? err.message : String(err)}`;
          console.error("[notify] newsletter error:", msg);
          errors.push(msg);
        }
      }
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    digestDay: isBiweeklyDigestDay(today),
    usersChecked: users.length,
    accountDeadlineRemindersSent,
    subscriberDeadlineRemindersSent,
    matchDigestsSent,
    newsletterSent,
    errors: errors.length > 0 ? errors : undefined,
  }, { status: errors.length > 0 ? 207 : 200 }); // 207 Multi-Status: partial success
}
