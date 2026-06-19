// src/lib/email/sender.ts
// Server-only. Never import in client components.
import { Resend } from "resend";
import type { Opportunity } from "@/lib/types";

if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? "noreply@example.com";
const APP_URL = process.env.NEXTAUTH_URL ?? process.env.SITE_URL ?? "http://localhost:3000";

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
          <a href="${safeUrl(opp.source)}">View opportunity →</a>
        </li>`
    )
    .join("");

  await resend.emails.send({
    from: FROM,
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
}

export async function sendBiweeklyNewsletterDigest(
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
          <a href="${safeUrl(opp.source)}">View opportunity →</a>
        </li>`
    )
    .join("");

  const unsubscribeUrl = `${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}`;

  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `New AI opportunities — biweekly digest`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="margin-top:0;">New AI opportunities on AI Opportunity Radar</h2>
        <ul style="padding-left:16px;">${items}</ul>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
        <p style="color:#6b7280;font-size:13px;">
          <a href="${safeUrl(unsubscribeUrl)}">Unsubscribe</a> from this biweekly email.
        </p>
      </div>
    `,
  });
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
          <a href="${safeUrl(`${APP_URL}/opportunity/${opp.id}`)}">View →</a>
        </li>`
    )
    .join("");

  await resend.emails.send({
    from: FROM,
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
}


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
          <a href="${safeUrl(opp.source)}">View opportunity →</a>
        </li>`
    )
    .join("");

  const unsubscribeUrl = `${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}`;

  await resend.emails.send({
    from: FROM,
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
}
