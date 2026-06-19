// src/app/api/notify/route.ts
// Called daily by GitHub Actions cron. Protected by CRON_SECRET.
// Never called from the browser.
import { NextRequest, NextResponse } from "next/server";
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
import { parseISO } from "date-fns";

const DEFAULT_SUBSCRIBER_DEADLINE_REMINDERS = [14, 7, 3, 1];
const BIWEEKLY_DIGEST_START_DATE = process.env.BIWEEKLY_DIGEST_START_DATE ?? "2026-06-22"; // Monday UTC

function utcStartOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysUntilDeadline(deadline: string, today: Date): number {
  const parsed = parseISO(deadline);
  const deadlineUtc = utcStartOfDay(parsed);
  const todayUtc = utcStartOfDay(today);
  return Math.round((deadlineUtc.getTime() - todayUtc.getTime()) / 86_400_000);
}

// Digest emails go out once every two weeks on Monday UTC.
// The cron still runs daily so deadline reminders can be sent on the exact threshold day.
function isBiweeklyDigestDay(date: Date): boolean {
  if (date.getUTCDay() !== 1) return false;

  const start = utcStartOfDay(parseISO(BIWEEKLY_DIGEST_START_DATE));
  const today = utcStartOfDay(date);
  const daysSinceStart = Math.round((today.getTime() - start.getTime()) / 86_400_000);

  return daysSinceStart >= 0 && daysSinceStart % 14 === 0;
}

function getSubscriberDeadlineMatches(today: Date, reminders: number[] = DEFAULT_SUBSCRIBER_DEADLINE_REMINDERS) {
  const thresholds = new Set(reminders);
  return opportunities
    .map((opp) => ({ opp, daysLeft: daysUntilDeadline(opp.deadline, today) }))
    .filter(({ daysLeft }) => daysLeft >= 0 && thresholds.has(daysLeft));
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

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();

  try {
    await deleteExpiredSessions();

    const users = await getUsersForReminders();
    let accountDeadlineRemindersSent = 0;
    let matchDigestsSent = 0;

    for (const user of users) {
      // Account/profile flow: remind only for saved/tracked opportunities.
      const toRemind = user.opportunities
        .map((oppId) => {
          const opp = getOpportunityById(oppId);
          if (!opp) return null;
          const days = daysUntilDeadline(opp.deadline, today);
          if (days >= 0 && user.emailReminders.includes(days)) return { opp, daysLeft: days };
          return null;
        })
        .filter(Boolean) as Array<{ opp: Opportunity; daysLeft: number }>;

      const pending = await withoutAlreadySent(user.email, "account_deadline", toRemind);
      if (pending.length > 0) {
        await sendDeadlineReminder(user.email, pending);
        await markSent(user.email, "account_deadline", pending);
        accountDeadlineRemindersSent++;
      }

      // New match digest. per_event checks daily. digest checks on the biweekly digest day.
      const shouldCheckMatches = user.emailMode === "per_event" || isBiweeklyDigestDay(today);
      if (shouldCheckMatches) {
        const profile = await getProfileByUserEmail(user.email);
        if (profile?.emailNewMatches) {
          const matches = findNewMatches(profile);
          if (matches.length > 0) {
            await sendNewMatchDigest(user.email, matches);
            matchDigestsSent++;
          }
        }
      }
    }

    // Public subscriber flow: no account/login. Subscribers receive:
    // 1) deadline reminders for all curated active opportunities on threshold days, and
    // 2) new-opportunity digest once every two weeks.
    let subscriberDeadlineRemindersSent = 0;
    const subscribersForDeadlines = await getActiveSubscribersForDeadlineReminders();
    for (const subscriber of subscribersForDeadlines) {
      const matches = getSubscriberDeadlineMatches(today, subscriber.emailDeadlineReminders);
      const pending = await withoutAlreadySent(subscriber.email, "subscriber_deadline", matches);
      if (pending.length > 0) {
        await sendSubscriberDeadlineReminder(subscriber.email, pending);
        await markSent(subscriber.email, "subscriber_deadline", pending);
        subscriberDeadlineRemindersSent++;
      }
    }

    let newsletterSent = 0;
    if (isBiweeklyDigestDay(today)) {
      const newThisWeek = opportunities.filter((o) => o.newThisWeek && daysUntilDeadline(o.deadline, today) >= 0);
      if (newThisWeek.length > 0) {
        const subscribers = await getActiveSubscribers();
        for (const email of subscribers) {
          await sendBiweeklyNewsletterDigest(email, newThisWeek);
          newsletterSent++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      digestDay: isBiweeklyDigestDay(today),
      usersChecked: users.length,
      accountDeadlineRemindersSent,
      subscriberDeadlineRemindersSent,
      matchDigestsSent,
      newsletterSent,
    });
  } catch (err) {
    console.error("Notify cron error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
