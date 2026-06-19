// src/lib/db/queries.ts
import { db } from "./client";
import type { Profile, SavedOpportunity } from "@/lib/types";

// ── Profile ──────────────────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<Profile | null> {
  const row = await db.execute({
    sql: "SELECT * FROM profiles WHERE user_id = ?",
    args: [userId],
  });
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
  const rows = await db.execute({
    sql: "SELECT * FROM saved_opportunities WHERE user_id = ? ORDER BY updated_at DESC",
    args: [userId],
  });
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
  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO saved_opportunities (id, user_id, opportunity_id, status)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, opportunity_id) DO UPDATE SET
            status = excluded.status,
            updated_at = unixepoch()`,
    args: [id, userId, opportunityId, status],
  });
}

export async function updateStatus(userId: string, opportunityId: string, status: SavedOpportunity["status"]): Promise<boolean> {
  const result = await db.execute({
    sql: `UPDATE saved_opportunities SET status = ?, updated_at = unixepoch()
          WHERE user_id = ? AND opportunity_id = ?`,
    args: [status, userId, opportunityId],
  });
  // rowsAffected === 0 means the user never saved this opportunity — caller should treat as 404
  return (result.rowsAffected ?? 0) > 0;
}

export async function deleteSaved(userId: string, opportunityId: string): Promise<void> {
  await db.execute({
    sql: "DELETE FROM saved_opportunities WHERE user_id = ? AND opportunity_id = ?",
    args: [userId, opportunityId],
  });
}

// ── Email / notifications ─────────────────────────────────────────────────────

export async function getUsersForReminders(): Promise<
  Array<{ email: string; emailReminders: number[]; emailMode: string; opportunities: string[] }>
> {
  // Returns users with saved/tracked opportunities (excluding terminal states)
  // and their tracked opportunity IDs. Deadline-window filtering happens in the caller
  // (/api/notify) since opportunity deadlines live in the static curated data, not the DB.
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
  const row = await db.execute({
    sql: `SELECT p.* FROM profiles p JOIN users u ON u.id = p.user_id WHERE u.email = ?`,
    args: [email],
  });
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

// ── Newsletter subscribers (no account needed) ────────────────────────────────

export async function addSubscriber(email: string): Promise<{ alreadySubscribed: boolean }> {
  const existing = await db.execute({
    sql: "SELECT status FROM subscribers WHERE email = ?",
    args: [email],
  });

  if (existing.rows[0]) {
    if (existing.rows[0].status === "active") {
      return { alreadySubscribed: true };
    }
    // Re-subscribe someone who previously unsubscribed
    await db.execute({
      sql: "UPDATE subscribers SET status = 'active', unsubscribed_at = NULL WHERE email = ?",
      args: [email],
    });
    return { alreadySubscribed: false };
  }

  await db.execute({
    sql: "INSERT INTO subscribers (id, email) VALUES (?, ?)",
    args: [crypto.randomUUID(), email],
  });
  return { alreadySubscribed: false };
}

export async function removeSubscriber(email: string): Promise<void> {
  await db.execute({
    sql: "UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = unixepoch() WHERE email = ?",
    args: [email],
  });
}


export async function getActiveSubscribers(): Promise<string[]> {
  const rows = await db.execute({
    sql: "SELECT email FROM subscribers WHERE status = 'active'",
    args: [],
  });
  return rows.rows.map((r) => r.email as string);
}

export async function getActiveSubscribersForDeadlineReminders(): Promise<
  Array<{ email: string; emailDeadlineReminders: number[] }>
> {
  const rows = await db.execute({
    sql: `SELECT email, email_deadline_reminders
          FROM subscribers
          WHERE status = 'active' AND email_deadline_reminders_enabled = 1`,
    args: [],
  });

  return rows.rows.map((r) => {
    let reminders = [14, 7, 3, 1];
    try {
      const parsed = JSON.parse((r.email_deadline_reminders as string) || "[]");
      if (Array.isArray(parsed) && parsed.every((n) => Number.isInteger(n))) {
        reminders = parsed;
      }
    } catch {
      // Keep default reminder thresholds if legacy/bad data exists.
    }
    return {
      email: r.email as string,
      emailDeadlineReminders: reminders,
    };
  });
}

export async function hasNotificationBeenSent(input: {
  email: string;
  notificationType: string;
  opportunityId: string;
  daysLeft: number;
}): Promise<boolean> {
  const rows = await db.execute({
    sql: `SELECT 1 FROM notification_log
          WHERE email = ? AND notification_type = ? AND opportunity_id = ? AND days_left = ?
          LIMIT 1`,
    args: [input.email, input.notificationType, input.opportunityId, input.daysLeft],
  });
  return Boolean(rows.rows[0]);
}

export async function recordNotificationSent(input: {
  email: string;
  notificationType: string;
  opportunityId: string;
  daysLeft: number;
}): Promise<void> {
  await db.execute({
    sql: `INSERT OR IGNORE INTO notification_log
          (id, email, notification_type, opportunity_id, days_left)
          VALUES (?, ?, ?, ?, ?)`,
    args: [crypto.randomUUID(), input.email, input.notificationType, input.opportunityId, input.daysLeft],
  });
}

export async function deleteExpiredSessions(): Promise<void> {
  await db.execute({
    sql: "DELETE FROM sessions WHERE expires_at < unixepoch()",
    args: [],
  });
}
