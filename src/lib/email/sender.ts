// src/lib/email/sender.ts
// Server-only. Never import in client components.
import { Resend } from "resend";
import type { Opportunity } from "@/lib/types";
import { deadlineDisplay, isRollingOpportunity } from "@/lib/deadlines";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set — email sending is disabled.");
  }
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const APP_URL = (process.env.NEXTAUTH_URL ?? process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

function getEmailFrom(): string {
  const raw = process.env.EMAIL_FROM;
  if (!raw || raw === "noreply@example.com") {
    throw new Error(
      "EMAIL_FROM is not set or is still the placeholder. " +
        "Set EMAIL_FROM to an address on a domain verified in Resend."
    );
  }
  return raw;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return escapeHtml(parsed.toString());
    }
  } catch {
    // fall through
  }
  return "#";
}

// ── Batch send helper ─────────────────────────────────────────────────────────
// Resend batch API: up to 100 emails per call, no per-email rate limit.
// Replaces sequential emails.send() which hits the 2 req/sec free-tier limit
// immediately at scale. Returns { sent[], failed[] } so only confirmed
// successes are marked as delivered in notification_log.
const BATCH_SIZE = 100;
const BATCH_PAUSE_MS = 300; // stay comfortably under any secondary limits

type EmailPayload = { from: string; to: string; subject: string; html: string };

export async function batchSend(
  payloads: EmailPayload[]
): Promise<{ sent: string[]; failed: Array<{ to: string; reason: string }> }> {
  const sent: string[] = [];
  const failed: Array<{ to: string; reason: string }> = [];

  for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
    const chunk = payloads.slice(i, i + BATCH_SIZE);
    try {
      const { data, error } = await getResend().batch.send(chunk);
      if (error) {
        for (const p of chunk) failed.push({ to: p.to, reason: error.message });
      } else {
        // Resend returns one entry per accepted email in order
        const accepted = new Set((data?.data ?? []).map((_: unknown, idx: number) => chunk[idx]?.to).filter(Boolean));
        for (const p of chunk) {
          if (accepted.has(p.to)) sent.push(p.to);
          else failed.push({ to: p.to, reason: "not acknowledged by Resend" });
        }
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      for (const p of chunk) failed.push({ to: p.to, reason });
    }
    if (i + BATCH_SIZE < payloads.length) {
      await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
    }
  }
  return { sent, failed };
}

// ── HTML builders (pure, no send) ─────────────────────────────────────────────

function buildDigestHtml(email: string, opportunities: Opportunity[]): string {
  function renderList(items: Opportunity[]) {
    return items.map((opp) =>
      `<li style="margin-bottom:12px;">
        <strong>${escapeHtml(opp.title)}</strong> <span style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:12px;">${escapeHtml(opp.category)}</span><br>
        <span style="color:#6b7280;font-size:13px;">${escapeHtml(deadlineDisplay(opp))}</span><br>
        <span style="color:#6b7280;font-size:13px;">${escapeHtml(opp.hook)}</span><br>
        <a href="${safeUrl(`${APP_URL}/opportunities/${opp.id}`)}">View details →</a>
      </li>`
    ).join("");
  }
  const indiaSea = opportunities.filter((o) => o.region === "India" || o.region === "SEA");
  const fixed = opportunities.filter((o) => !isRollingOpportunity(o));
  const rolling = opportunities.filter(isRollingOpportunity);
  const unsubUrl = `${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}`;
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <h2 style="margin-top:0;">New AI opportunities on AI Opportunity Radar</h2>
    ${indiaSea.length > 0 ? `<h3>India &amp; SEA highlights</h3><ul style="padding-left:16px;">${renderList(indiaSea)}</ul>` : ""}
    ${fixed.length > 0 ? `<h3>Fixed-deadline opportunities</h3><ul style="padding-left:16px;">${renderList(fixed)}</ul>` : ""}
    ${rolling.length > 0 ? `<h3>Rolling opportunities</h3><ul style="padding-left:16px;">${renderList(rolling)}</ul>` : ""}
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
    <p style="color:#6b7280;font-size:13px;"><a href="${safeUrl(unsubUrl)}">Unsubscribe</a></p>
  </div>`;
}

function buildRoundupHtml(email: string, opportunities: Array<{ opp: Opportunity; daysLeft: number }>): string {
  const items = opportunities.map(({ opp, daysLeft }) => {
    const timing = daysLeft === 0 ? "closes today" : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`;
    return `<li style="margin-bottom:12px;">
      <strong>${escapeHtml(opp.title)}</strong><br>
      <span style="color:#dc2626;">${escapeHtml(timing)}</span><br>
      <span style="color:#6b7280;font-size:13px;">${escapeHtml(opp.hook)}</span><br>
      <a href="${safeUrl(`${APP_URL}/opportunities/${opp.id}`)}">View details →</a>
    </li>`;
  }).join("");
  const unsubUrl = `${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}`;
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <h2 style="margin-top:0;">Closing in the next 7 days</h2>
    <ul style="padding-left:16px;">${items}</ul>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
    <p style="color:#6b7280;font-size:13px;">AI Opportunity Radar · <a href="${safeUrl(unsubUrl)}">Unsubscribe</a></p>
  </div>`;
}

// ── Batch send functions (digest + roundup) ───────────────────────────────────
// These replace per-subscriber emails.send() calls. The route calls these once
// with all recipients; batchSend handles chunking and pacing internally.

export async function sendBiweeklyNewsletterDigestBatch(
  emails: string[],
  opportunities: Opportunity[]
): Promise<{ sent: string[]; failed: Array<{ to: string; reason: string }> }> {
  if (emails.length === 0 || opportunities.length === 0) return { sent: [], failed: [] };
  const from = getEmailFrom();
  const payloads: EmailPayload[] = emails.map((email) => ({
    from,
    to: email,
    subject: "New AI opportunities — biweekly digest",
    html: buildDigestHtml(email, opportunities),
  }));
  return batchSend(payloads);
}

export async function sendWeeklyClosingRoundupBatch(
  emails: string[],
  opportunities: Array<{ opp: Opportunity; daysLeft: number }>
): Promise<{ sent: string[]; failed: Array<{ to: string; reason: string }> }> {
  if (emails.length === 0 || opportunities.length === 0) return { sent: [], failed: [] };
  const from = getEmailFrom();
  const payloads: EmailPayload[] = emails.map((email) => ({
    from,
    to: email,
    subject: `This week's AI opportunity deadlines (${opportunities.length})`,
    html: buildRoundupHtml(email, opportunities),
  }));
  return batchSend(payloads);
}

// ── Single-recipient functions (kept as-is — per-person by nature) ────────────

export async function sendDeadlineReminder(
  email: string,
  opportunities: Array<{ opp: Opportunity; daysLeft: number }>
): Promise<void> {
  if (opportunities.length === 0) return;
  const items = opportunities.map(({ opp, daysLeft }) =>
    `<li style="margin-bottom:12px;">
      <strong>${escapeHtml(opp.title)}</strong><br>
      <span style="color:#dc2626;">${daysLeft} day${daysLeft !== 1 ? "s" : ""} left</span> · ${escapeHtml(opp.category)}<br>
      <a href="${safeUrl(`${APP_URL}/opportunities/${opp.id}`)}">View details →</a>
    </li>`
  ).join("");
  const { error } = await getResend().emails.send({
    from: getEmailFrom(),
    to: email,
    subject: `⏰ ${opportunities.length} deadline${opportunities.length > 1 ? "s" : ""} coming up — AI Opportunity Radar`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="margin-top:0;">Upcoming deadlines</h2>
      <ul style="padding-left:16px;">${items}</ul>
    </div>`,
  });
  if (error) throw new Error(`Resend error (sendDeadlineReminder → ${email}): ${error.message}`);
}

export async function sendFollowedOpportunityReminder(
  email: string,
  item: { opp: Opportunity; daysLeft: number }
): Promise<void> {
  const { opp, daysLeft } = item;
  const timing = daysLeft === 0 ? "closes today" : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`;
  const unsubUrl = `${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}`;
  const unfollowUrl = `${APP_URL}/reminders/unsubscribe?email=${encodeURIComponent(email)}&opportunityId=${encodeURIComponent(opp.id)}`;
  const { error } = await getResend().emails.send({
    from: getEmailFrom(),
    to: email,
    subject: `Reminder: ${opp.title} ${timing}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="margin-top:0;">Reminder for an opportunity you followed</h2>
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:16px 0;">
        <strong>${escapeHtml(opp.title)}</strong><br>
        <span style="color:#dc2626;font-weight:600;">${escapeHtml(timing)}</span><br>
        <span style="color:#6b7280;font-size:13px;">${escapeHtml(opp.hook)}</span><br><br>
        <a href="${safeUrl(`${APP_URL}/opportunities/${opp.id}`)}">View details →</a>
      </div>
      <p style="color:#6b7280;font-size:13px;">Deadline: ${escapeHtml(deadlineDisplay(opp))}</p>
      <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
      <p style="color:#6b7280;font-size:13px;">
        <a href="${safeUrl(unfollowUrl)}">Stop reminders for this opportunity</a> ·
        <a href="${safeUrl(unsubUrl)}">Unsubscribe from all emails</a>
      </p>
    </div>`,
  });
  if (error) throw new Error(`Resend error (sendFollowedOpportunityReminder → ${email}): ${error.message}`);
}

export async function sendNewMatchDigest(email: string, opportunities: Opportunity[]): Promise<void> {
  if (opportunities.length === 0) return;
  const items = opportunities.map((opp) =>
    `<li style="margin-bottom:12px;">
      <strong>${escapeHtml(opp.title)}</strong><br>
      <span style="color:#6b7280;font-size:13px;">${escapeHtml(opp.hook)}</span><br>
      <a href="${safeUrl(`${APP_URL}/opportunities/${opp.id}`)}">View →</a>
    </li>`
  ).join("");
  const { error } = await getResend().emails.send({
    from: getEmailFrom(),
    to: email,
    subject: `${opportunities.length} new match${opportunities.length > 1 ? "es" : ""} for you — AI Opportunity Radar`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="margin-top:0;">New opportunities matching your profile</h2>
      <ul style="padding-left:16px;">${items}</ul>
    </div>`,
  });
  if (error) throw new Error(`Resend error (sendNewMatchDigest → ${email}): ${error.message}`);
}

// Deprecated — kept to avoid breaking older imports during deploys.
export async function sendSubscriberDeadlineReminder(
  email: string,
  opportunities: Array<{ opp: Opportunity; daysLeft: number }>
): Promise<void> {
  await sendDeadlineReminder(email, opportunities);
}

// Deprecated single-email versions — route now calls batch variants.
export async function sendBiweeklyNewsletterDigest(email: string, opportunities: Opportunity[]): Promise<void> {
  const { failed } = await sendBiweeklyNewsletterDigestBatch([email], opportunities);
  if (failed.length > 0) throw new Error(`Resend error (sendBiweeklyNewsletterDigest → ${email}): ${failed[0].reason}`);
}

export async function sendWeeklyClosingRoundup(
  email: string,
  opportunities: Array<{ opp: Opportunity; daysLeft: number }>
): Promise<void> {
  const { failed } = await sendWeeklyClosingRoundupBatch([email], opportunities);
  if (failed.length > 0) throw new Error(`Resend error (sendWeeklyClosingRoundup → ${email}): ${failed[0].reason}`);
}
