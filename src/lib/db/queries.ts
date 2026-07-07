import { db } from "./client";
import type { Profile, SavedOpportunity } from "@/lib/types";

// ── Profile ──────────────────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<Profile | null> {
  const row = await db.execute({ sql: "SELECT * FROM profiles WHERE user_id = ?", args: [userId] });
  if (!row.rows[0]) return null;
  const r = row.rows[0];
  return {
    userId: r.user_id as string,
    status: r.status as Profile["status"],
    region: r.region as string,
    interests: JSON.parse(r.interests as string),
    focusAreas: r.focus_areas as string,
    emailMode: r.email_mode as Profile["emailMode"],
    emailReminders: JSON.parse(r.email_reminders as string),
    emailNewMatches: Boolean(r.email_new_matches),
  };
}

export async function upsertProfile(userId: string, data: Omit<Profile, "userId">): Promise<void> {
  await db.execute({
    sql: `INSERT INTO profiles (user_id, status, region, interests, focus_areas, email_mode, email_reminders, email_new_matches, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
          ON CONFLICT(user_id) DO UPDATE SET
            status = excluded.status,
            region = excluded.region,
            interests = excluded.interests,
            focus_areas = excluded.focus_areas,
            email_mode = excluded.email_mode,
            email_reminders = excluded.email_reminders,
            email_new_matches = excluded.email_new_matches,
            updated_at = unixepoch()`,
    args: [
      userId,
      data.status,
      data.region,
      JSON.stringify(data.interests),
      data.focusAreas,
      data.emailMode,
      JSON.stringify(data.emailReminders),
      data.emailNewMatches ? 1 : 0,
    ],
  });
}

// ── Saved / Tracking ─────────────────────────────────────────────────────────

export async function getSaved(userId: string): Promise<SavedOpportunity[]> {
  const rows = await db.execute({ sql: "SELECT * FROM saved_opportunities WHERE user_id = ? ORDER BY updated_at DESC", args: [userId] });
  return rows.rows.map((r) => ({
    id: r.id as string,
    userId: r.user_id as string,
    opportunityId: r.opportunity_id as string,
    status: r.status as SavedOpportunity["status"],
    notes: r.notes as string,
    savedAt: new Date((r.saved_at as number) * 1000),
    updatedAt: new Date((r.updated_at as number) * 1000),
  }));
}

export async function upsertSaved(userId: string, opportunityId: string, status: SavedOpportunity["status"] = "saved"): Promise<void> {
  await db.execute({
    sql: `INSERT INTO saved_opportunities (id, user_id, opportunity_id, status)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, opportunity_id) DO UPDATE SET
            status = excluded.status,
            updated_at = unixepoch()`,
    args: [crypto.randomUUID(), userId, opportunityId, status],
  });
}

export async function updateStatus(userId: string, opportunityId: string, status: SavedOpportunity["status"]): Promise<boolean> {
  const result = await db.execute({
    sql: `UPDATE saved_opportunities SET status = ?, updated_at = unixepoch()
          WHERE user_id = ? AND opportunity_id = ?`,
    args: [status, userId, opportunityId],
  });
  return (result.rowsAffected ?? 0) > 0;
}

export async function deleteSaved(userId: string, opportunityId: string): Promise<void> {
  await db.execute({ sql: "DELETE FROM saved_opportunities WHERE user_id = ? AND opportunity_id = ?", args: [userId, opportunityId] });
}

// ── Dormant account/profile notifications ───────────────────────────────────
// Keep these for future sign-in reactivation. They must only be called when
// FEATURE_FLAGS.showSignIn is true so the dormant flow produces zero account
// queries while sign-in is hidden.

export async function getUsersForReminders(): Promise<Array<{ email: string; emailReminders: number[]; emailMode: string; opportunities: string[] }>> {
  const rows = await db.execute({
    sql: `SELECT u.email, p.email_reminders, p.email_mode,
               GROUP_CONCAT(s.opportunity_id) as opportunity_ids
          FROM profiles p
          JOIN users u ON u.id = p.user_id
          JOIN saved_opportunities s ON s.user_id = p.user_id
          WHERE s.status NOT IN ('rejected', 'accepted')
          GROUP BY u.id`,
    args: [],
  });
  return rows.rows.map((r) => ({
    email: r.email as string,
    emailReminders: JSON.parse(r.email_reminders as string),
    emailMode: r.email_mode as string,
    opportunities: (r.opportunity_ids as string).split(","),
  }));
}

export async function getProfileByUserEmail(email: string): Promise<Profile | null> {
  const row = await db.execute({ sql: `SELECT p.* FROM profiles p JOIN users u ON u.id = p.user_id WHERE u.email = ?`, args: [email] });
  if (!row.rows[0]) return null;
  const r = row.rows[0];
  return {
    userId: r.user_id as string,
    status: r.status as Profile["status"],
    region: r.region as string,
    interests: JSON.parse(r.interests as string),
    focusAreas: r.focus_areas as string,
    emailMode: r.email_mode as Profile["emailMode"],
    emailReminders: JSON.parse(r.email_reminders as string),
    emailNewMatches: Boolean(r.email_new_matches),
  };
}

// ── Newsletter subscribers (no account needed) ───────────────────────────────

export async function addSubscriber(email: string): Promise<{ alreadySubscribed: boolean }> {
  const existing = await db.execute({ sql: "SELECT status FROM subscribers WHERE email = ?", args: [email] });
  if (existing.rows[0]) {
    if (existing.rows[0].status === "active") return { alreadySubscribed: true };
    await db.execute({ sql: "UPDATE subscribers SET status = 'active', unsubscribed_at = NULL WHERE email = ?", args: [email] });
    return { alreadySubscribed: false };
  }
  await db.execute({ sql: "INSERT INTO subscribers (id, email) VALUES (?, ?)", args: [crypto.randomUUID(), email] });
  return { alreadySubscribed: false };
}

export async function removeSubscriber(email: string): Promise<void> {
  // Global unsubscribe governs all public emails: weekly roundup, biweekly digest,
  // and followed-opportunity reminders.
  await db.batch([
    { sql: "UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = unixepoch() WHERE email = ?", args: [email] },
    { sql: "UPDATE email_follows SET status = 'unsubscribed', unsubscribed_at = unixepoch() WHERE email = ? AND status = 'active'", args: [email] },
  ], "write");
}

export async function getActiveSubscribers(): Promise<string[]> {
  const rows = await db.execute({ sql: "SELECT email FROM subscribers WHERE status = 'active'", args: [] });
  return rows.rows.map((r) => r.email as string);
}

export async function getActiveSubscribersPage(input: { cursor?: string | null; limit: number }): Promise<{ emails: string[]; nextCursor: string | null; hasMore: boolean }> {
  const limit = Math.max(1, Math.min(input.limit, 1000));
  const args: any[] = [];
  let cursorClause = "";
  if (input.cursor) {
    cursorClause = "AND email > ?";
    args.push(input.cursor);
  }
  args.push(limit + 1);
  const rows = await db.execute({
    sql: `SELECT email FROM subscribers
          WHERE status = 'active' ${cursorClause}
          ORDER BY email ASC
          LIMIT ?`,
    args,
  });
  const all = rows.rows.map((r: any) => r.email as string);
  const page = all.slice(0, limit);
  return {
    emails: page,
    nextCursor: all.length > limit ? page[page.length - 1] ?? null : null,
    hasMore: all.length > limit,
  };
}

// Kept for backwards compatibility only. The new system must not call this for
// public subscriber deadline blasts.
export async function getActiveSubscribersForDeadlineReminders(): Promise<Array<{ email: string; emailDeadlineReminders: number[] }>> {
  const rows = await db.execute({
    sql: `SELECT email, email_deadline_reminders FROM subscribers WHERE status = 'active' AND email_deadline_reminders_enabled = 1`,
    args: [],
  });
  return rows.rows.map((r) => ({ email: r.email as string, emailDeadlineReminders: JSON.parse((r.email_deadline_reminders as string) || "[14,7,3,1]") }));
}

// ── Email-keyed follows / Remind me ──────────────────────────────────────────

export async function upsertEmailFollow(email: string, opportunityId: string): Promise<{ alreadyFollowing: boolean; blockedByGlobalUnsubscribe: boolean }> {
  const existing = await db.execute({ sql: "SELECT status FROM email_follows WHERE email = ? AND opportunity_id = ?", args: [email, opportunityId] });
  if (existing.rows[0]?.status === "active") return { alreadyFollowing: true, blockedByGlobalUnsubscribe: false };

  // A reminder follow should not force global newsletter subscription. If the
  // person is already globally unsubscribed, keep that override respected.
  const subscriber = await db.execute({ sql: "SELECT status FROM subscribers WHERE email = ?", args: [email] });
  if (subscriber.rows[0]?.status === "unsubscribed") {
    await db.execute({
      sql: `INSERT INTO email_follows (id, email, opportunity_id, status, created_at, updated_at)
            VALUES (?, ?, ?, 'unsubscribed', unixepoch(), unixepoch())
            ON CONFLICT(email, opportunity_id) DO UPDATE SET status = 'unsubscribed', updated_at = unixepoch()`,
      args: [crypto.randomUUID(), email, opportunityId],
    });
    return { alreadyFollowing: false, blockedByGlobalUnsubscribe: true };
  }

  await db.execute({
    sql: `INSERT INTO email_follows (id, email, opportunity_id, status, created_at, updated_at)
          VALUES (?, ?, ?, 'active', unixepoch(), unixepoch())
          ON CONFLICT(email, opportunity_id) DO UPDATE SET
            status = 'active', unsubscribed_at = NULL, updated_at = unixepoch()`,
    args: [crypto.randomUUID(), email, opportunityId],
  });
  return { alreadyFollowing: false, blockedByGlobalUnsubscribe: false };
}


export async function unsubscribeEmailFollow(email: string, opportunityId: string): Promise<boolean> {
  const result = await db.execute({
    sql: `UPDATE email_follows
          SET status = 'unsubscribed', unsubscribed_at = unixepoch(), updated_at = unixepoch()
          WHERE email = ? AND opportunity_id = ? AND status = 'active'`,
    args: [email, opportunityId],
  });
  return (result.rowsAffected ?? 0) > 0;
}

export async function getActiveFollowsForOpportunityIds(opportunityIds: string[]): Promise<Array<{ email: string; opportunityId: string }>> {
  if (opportunityIds.length === 0) return [];
  const placeholders = opportunityIds.map(() => "?").join(",");
  const rows = await db.execute({
    sql: `SELECT f.email, f.opportunity_id
          FROM email_follows f
          LEFT JOIN subscribers s ON s.email = f.email
          WHERE f.status = 'active'
            AND f.opportunity_id IN (${placeholders})
            AND COALESCE(s.status, 'active') = 'active'`,
    args: opportunityIds,
  });
  return rows.rows.map((r) => ({ email: r.email as string, opportunityId: r.opportunity_id as string }));
}

export async function getActiveFollowsForOpportunityIdsPage(
  opportunityIds: string[],
  input: { cursorEmail?: string | null; cursorOpportunityId?: string | null; limit: number }
): Promise<{ follows: Array<{ email: string; opportunityId: string }>; nextCursor: { email: string; opportunityId: string } | null; hasMore: boolean }> {
  if (opportunityIds.length === 0) return { follows: [], nextCursor: null, hasMore: false };
  const limit = Math.max(1, Math.min(input.limit, 1000));
  const placeholders = opportunityIds.map(() => "?").join(",");
  const args: any[] = [...opportunityIds];
  let cursorClause = "";
  if (input.cursorEmail && input.cursorOpportunityId) {
    cursorClause = "AND (f.email > ? OR (f.email = ? AND f.opportunity_id > ?))";
    args.push(input.cursorEmail, input.cursorEmail, input.cursorOpportunityId);
  }
  args.push(limit + 1);
  const rows = await db.execute({
    sql: `SELECT f.email, f.opportunity_id
          FROM email_follows f
          LEFT JOIN subscribers s ON s.email = f.email
          WHERE f.status = 'active'
            AND f.opportunity_id IN (${placeholders})
            AND COALESCE(s.status, 'active') = 'active'
            ${cursorClause}
          ORDER BY f.email ASC, f.opportunity_id ASC
          LIMIT ?`,
    args,
  });
  const all = rows.rows.map((r: any) => ({ email: r.email as string, opportunityId: r.opportunity_id as string }));
  const page = all.slice(0, limit);
  const last = page[page.length - 1];
  return {
    follows: page,
    nextCursor: all.length > limit && last ? { email: last.email, opportunityId: last.opportunityId } : null,
    hasMore: all.length > limit,
  };
}

// ── Idempotent deliveries ────────────────────────────────────────────────────

export async function hasNotificationBeenSent(input: { email: string; notificationType: string; opportunityId: string; daysLeft: number }): Promise<boolean> {
  const rows = await db.execute({
    sql: `SELECT 1 FROM notification_log WHERE email = ? AND notification_type = ? AND opportunity_id = ? AND days_left = ? LIMIT 1`,
    args: [input.email, input.notificationType, input.opportunityId, input.daysLeft],
  });
  return Boolean(rows.rows[0]);
}

export async function recordNotificationSent(input: { email: string; notificationType: string; opportunityId: string; daysLeft: number }): Promise<void> {
  await db.execute({
    sql: `INSERT OR IGNORE INTO notification_log (id, email, notification_type, opportunity_id, days_left) VALUES (?, ?, ?, ?, ?)`,
    args: [crypto.randomUUID(), input.email, input.notificationType, input.opportunityId, input.daysLeft],
  });
}

const DELIVERY_STALE_SECONDS = Number(process.env.NOTIFICATION_STALE_SECONDS ?? 30 * 60);
const DELIVERY_MAX_ATTEMPTS = Number(process.env.NOTIFICATION_MAX_ATTEMPTS ?? 5);

export async function reserveNotificationDelivery(input: { email: string; notificationType: string; sendKey: string; opportunityId?: string | null; deadlineDate?: string | null; daysLeft?: number | null }): Promise<boolean> {
  const insert = await db.execute({
    sql: `INSERT OR IGNORE INTO notification_deliveries
          (id, email, notification_type, send_key, opportunity_id, deadline_date, days_left, attempt_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    args: [crypto.randomUUID(), input.email, input.notificationType, input.sendKey, input.opportunityId ?? null, input.deadlineDate ?? null, input.daysLeft ?? null],
  });

  if ((insert.rowsAffected ?? 0) > 0) return true;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const staleBefore = nowSeconds - DELIVERY_STALE_SECONDS;

  // Atomically claim retryable deliveries. This prevents two retrying cron
  // invocations from both seeing a failed/stale row and sending the same email.
  const retry = await db.execute({
    sql: `UPDATE notification_deliveries
          SET status = 'reserved', created_at = unixepoch(), attempt_count = attempt_count + 1, last_error = NULL
          WHERE send_key = ?
            AND status != 'sent'
            AND attempt_count < ?
            AND (
              status = 'failed'
              OR (status = 'reserved' AND created_at <= ?)
            )`,
    args: [input.sendKey, DELIVERY_MAX_ATTEMPTS, staleBefore],
  });

  return (retry.rowsAffected ?? 0) > 0;
}

export async function markNotificationDeliverySent(sendKey: string): Promise<void> {
  await db.execute({ sql: "UPDATE notification_deliveries SET status = 'sent', sent_at = unixepoch(), last_error = NULL WHERE send_key = ?", args: [sendKey] });
}

export async function markNotificationDeliveryFailed(sendKey: string, error: string): Promise<void> {
  await db.execute({ sql: "UPDATE notification_deliveries SET status = 'failed', last_error = ? WHERE send_key = ?", args: [error.slice(0, 500), sendKey] });
}

export async function deleteExpiredSessions(): Promise<void> {
  await db.execute({ sql: "DELETE FROM sessions WHERE expires_at < unixepoch()", args: [] });
}
