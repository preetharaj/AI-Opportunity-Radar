// src/lib/email/sender.ts
// Server-only. Never import in client components.
import { Resend } from "resend";
import type { Opportunity } from "@/lib/types";
import { deadlineDisplay, isRollingOpportunity } from "@/lib/deadlines";

// Lazy-initialise the Resend client so a missing key fails at call time
// (with a clear error) rather than at module import time (which crashes
// the entire /api/notify route before any request handling runs).
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set — email sending is disabled.");
  }
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const APP_URL = (process.env.NEXTAUTH_URL ?? process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

// EMAIL_FROM must be on a domain verified in your Resend account.
// Validate lazily so importing email templates during build never logs or fails.
function getEmailFrom(): string {
  const raw = process.env.EMAIL_FROM;
  if (!raw || raw === "noreply@example.com") {
    throw new Error(
      "EMAIL_FROM is not set or is still the placeholder 'noreply@example.com'. " +
        "Set EMAIL_FROM to an address on a domain verified in Resend."
    );
  }
  return raw;
}

// Curated opportunity data is hand-written today, but titles/hooks may contain
// characters like & < > that would otherwise break the email's HTML structure.
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
    // Fall through to a safe no-op link.
  }
  return "#";
}

export async function sendDeadlineReminder(
  email: string,
  opportunities: Array<{ opp: Opportunity; daysLeft: number }>
): Promise<void> {
  if (opportunities.length === 0) return;

  const items = opportunities
    .map(
      ({ opp, daysLeft }) =>
        `<li style="margin-bottom:12px;">
          <strong>${escapeHtml(opp.title)}</strong><br>
          <span style="color:#dc2626;">${daysLeft} day${daysLeft !== 1 ? "s" : ""} left</span> · ${escapeHtml(opp.category)}<br>
          <a href="${safeUrl(`${APP_URL}/opportunities/${opp.id}`)}">View details + calendar →</a>
        </li>`
    )
    .join("");

  const { error } = await getResend().emails.send({
    from: getEmailFrom(),
    to: email,
    subject: `⏰ ${opportunities.length} deadline${opportunities.length > 1 ? "s" : ""} coming up — AI Opportunity Radar`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="margin-top:0;">Upcoming deadlines</h2>
        <p>You have ${opportunities.length} tracked opportunit${opportunities.length > 1 ? "ies" : "y"} with deadlines approaching:</p>
        <ul style="padding-left:16px;">${items}</ul>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
        <p style="color:#6b7280;font-size:13px;">
          <a href="${safeUrl(`${APP_URL}/tracking`)}">View your tracker</a> ·
          <a href="${safeUrl(`${APP_URL}/settings`)}">Manage email preferences</a>
        </p>
      </div>
    `,
  });
  if (error) throw new Error(`Resend error (sendDeadlineReminder → ${email}): ${error.message}`);
}

export async function sendBiweeklyNewsletterDigest(
  email: string,
  opportunities: Opportunity[]
): Promise<void> {
  if (opportunities.length === 0) return;

  function renderList(itemsToRender: Opportunity[]) {
    return itemsToRender
    .map(
      (opp) =>
        `<li style="margin-bottom:12px;">
          <strong>${escapeHtml(opp.title)}</strong> <span style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:12px;">${escapeHtml(opp.category)}</span><br>
            <span style="color:#6b7280;font-size:13px;">${escapeHtml(deadlineDisplay(opp))}</span><br>
          <span style="color:#6b7280;font-size:13px;">${escapeHtml(opp.hook)}</span><br>
            <a href="${safeUrl(`${APP_URL}/opportunities/${opp.id}`)}">View details →</a>
        </li>`
    )
    .join("");
  }

  const indiaSea = opportunities.filter((opp) => opp.region === "India" || opp.region === "SEA");
  const fixed = opportunities.filter((opp) => !isRollingOpportunity(opp));
  const rolling = opportunities.filter(isRollingOpportunity);
  const unsubscribeUrl = `${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}`;

  const { error } = await getResend().emails.send({
    from: getEmailFrom(),
    to: email,
    subject: `New AI opportunities — biweekly digest`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="margin-top:0;">New AI opportunities on AI Opportunity Radar</h2>
        ${indiaSea.length > 0 ? `<h3>India & SEA highlights</h3><ul style="padding-left:16px;">${renderList(indiaSea)}</ul>` : ""}
        ${fixed.length > 0 ? `<h3>Fixed-deadline opportunities</h3><ul style="padding-left:16px;">${renderList(fixed)}</ul>` : ""}
        ${rolling.length > 0 ? `<h3>Rolling opportunities</h3><p style="color:#6b7280;font-size:13px;">These have no official fixed closing date, so they are not sent as countdown reminders.</p><ul style="padding-left:16px;">${renderList(rolling)}</ul>` : ""}
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
        <p style="color:#6b7280;font-size:13px;">
          <a href="${safeUrl(unsubscribeUrl)}">Unsubscribe</a> from this biweekly email.
        </p>
      </div>
    `,
  });
  if (error) throw new Error(`Resend error (sendBiweeklyNewsletterDigest → ${email}): ${error.message}`);
}

export async function sendNewMatchDigest(
  email: string,
  opportunities: Opportunity[]
): Promise<void> {
  if (opportunities.length === 0) return;

  const items = opportunities
    .map(
      (opp) =>
        `<li style="margin-bottom:12px;">
          <strong>${escapeHtml(opp.title)}</strong> <span style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:12px;">${escapeHtml(opp.category)}</span><br>
          <span style="color:#6b7280;font-size:13px;">${escapeHtml(opp.hook)}</span><br>
          <a href="${safeUrl(`${APP_URL}/opportunities/${opp.id}`)}">View →</a>
        </li>`
    )
    .join("");

  const { error } = await getResend().emails.send({
    from: getEmailFrom(),
    to: email,
    subject: `${opportunities.length} new match${opportunities.length > 1 ? "es" : ""} for you — AI Opportunity Radar`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="margin-top:0;">New opportunities matching your profile</h2>
        <ul style="padding-left:16px;">${items}</ul>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
        <p style="color:#6b7280;font-size:13px;">
          <a href="${safeUrl(`${APP_URL}/discover`)}">See all opportunities</a> ·
          <a href="${safeUrl(`${APP_URL}/settings`)}">Manage email preferences</a>
        </p>
      </div>
    `,
  });
  if (error) throw new Error(`Resend error (sendNewMatchDigest → ${email}): ${error.message}`);
}

// Deprecated: kept only to avoid breaking older imports during deploys.
// Do not call this from /api/notify; Phase 3 replaced broad deadline blasts with
// followed-opportunity reminders + weekly closing roundup.
export async function sendSubscriberDeadlineReminder(
  email: string,
  opportunities: Array<{ opp: Opportunity; daysLeft: number }>
): Promise<void> {
  if (opportunities.length === 0) return;

  const items = opportunities
    .map(
      ({ opp, daysLeft }) =>
        `<li style="margin-bottom:12px;">
          <strong>${escapeHtml(opp.title)}</strong> <span style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:12px;">${escapeHtml(opp.category.replace(/_/g, " "))}</span><br>
          <span style="color:#dc2626;">${daysLeft === 0 ? "closes today" : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`}</span><br>
          <span style="color:#6b7280;font-size:13px;">${escapeHtml(opp.hook)}</span><br>
          <a href="${safeUrl(`${APP_URL}/opportunities/${opp.id}`)}">View details + calendar →</a>
        </li>`
    )
    .join("");

  const unsubscribeUrl = `${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}`;

  const { error } = await getResend().emails.send({
    from: getEmailFrom(),
    to: email,
    subject: `Deadline reminder: ${opportunities.length} AI opportunit${opportunities.length > 1 ? "ies" : "y"} closing soon`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="margin-top:0;">AI opportunity deadline reminder</h2>
        <p>These curated opportunities are reaching an application deadline:</p>
        <ul style="padding-left:16px;">${items}</ul>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
        <p style="color:#6b7280;font-size:13px;">
          You are receiving this because you subscribed to AI Opportunity Radar alerts.<br>
          <a href="${safeUrl(unsubscribeUrl)}">Unsubscribe</a> anytime.
        </p>
      </div>
    `,
  });
  if (error) throw new Error(`Resend error (sendSubscriberDeadlineReminder → ${email}): ${error.message}`);
}

export async function sendFollowedOpportunityReminder(
  email: string,
  item: { opp: Opportunity; daysLeft: number }
): Promise<void> {
  const { opp, daysLeft } = item;
  const unsubscribeUrl = `${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}`;
  const unfollowUrl = `${APP_URL}/reminders/unsubscribe?email=${encodeURIComponent(email)}&opportunityId=${encodeURIComponent(opp.id)}`;
  const timing = daysLeft === 0 ? "closes today" : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`;

  const { error } = await getResend().emails.send({
    from: getEmailFrom(),
    to: email,
    subject: `Reminder: ${opp.title} ${timing}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="margin-top:0;">Reminder for an opportunity you followed</h2>
        <p>You asked AI Opportunity Radar to remind you about this opportunity.</p>
        <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:16px 0;">
          <strong>${escapeHtml(opp.title)}</strong><br>
          <span style="color:#dc2626;font-weight:600;">${escapeHtml(timing)}</span><br>
          <span style="color:#6b7280;font-size:13px;">${escapeHtml(opp.hook)}</span><br><br>
          <a href="${safeUrl(`${APP_URL}/opportunities/${opp.id}`)}">View details + calendar →</a>
        </div>
        <p style="color:#6b7280;font-size:13px;">Deadline: ${escapeHtml(deadlineDisplay(opp))}</p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
        <p style="color:#6b7280;font-size:13px;">
          <a href="${safeUrl(unfollowUrl)}">Stop reminders for this opportunity</a> ·
          <a href="${safeUrl(unsubscribeUrl)}">Unsubscribe from all AI Opportunity Radar emails</a>.
        </p>
      </div>
    `,
  });
  if (error) throw new Error(`Resend error (sendFollowedOpportunityReminder → ${email}): ${error.message}`);
}

export async function sendWeeklyClosingRoundup(
  email: string,
  opportunities: Array<{ opp: Opportunity; daysLeft: number }>
): Promise<void> {
  if (opportunities.length === 0) return;

  const items = opportunities
    .map(({ opp, daysLeft }) => {
      const timing = daysLeft === 0 ? "closes today" : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`;
      return `<li style="margin-bottom:12px;">
        <strong>${escapeHtml(opp.title)}</strong> <span style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:12px;">${escapeHtml(opp.category)}</span><br>
        <span style="color:#dc2626;">${escapeHtml(timing)}</span><br>
        <span style="color:#6b7280;font-size:13px;">${escapeHtml(opp.hook)}</span><br>
        <a href="${safeUrl(`${APP_URL}/opportunities/${opp.id}`)}">View details →</a>
      </li>`;
    })
    .join("");

  const unsubscribeUrl = `${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}`;

  const { error } = await getResend().emails.send({
    from: getEmailFrom(),
    to: email,
    subject: `This week's AI opportunity deadlines (${opportunities.length})`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="margin-top:0;">Closing in the next 7 days</h2>
        <p>One weekly roundup replaces the previous repeated deadline blasts.</p>
        <ul style="padding-left:16px;">${items}</ul>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
        <p style="color:#6b7280;font-size:13px;">
          You are receiving this because you subscribed to AI Opportunity Radar.<br>
          <a href="${safeUrl(unsubscribeUrl)}">Unsubscribe</a> anytime.
        </p>
      </div>
    `,
  });
  if (error) throw new Error(`Resend error (sendWeeklyClosingRoundup → ${email}): ${error.message}`);
}
