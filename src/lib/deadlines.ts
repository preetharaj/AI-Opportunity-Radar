import { differenceInDays, format, parseISO, isValid } from "date-fns";
import type { Opportunity } from "@/lib/types";

const MS_PER_DAY = 86_400_000;

export function isRollingOpportunity(opp: Pick<Opportunity, "deadline" | "id" | "title" | "description">): boolean {
  // Explicit type declaration wins over all heuristics — check it first.
  const typed = opp as Opportunity;
  if (typed.deadlineType === "fixed") return false;
  if (typed.deadlineType === "rolling") return true;
  // Legacy heuristic: id convention (pre-deadlineType field).
  if (opp.id.endsWith("-rolling")) return true;
  // Last resort: Dec-31 placeholder + text signal. Only fires when deadlineType is absent.
  const text = `${opp.title} ${opp.description}`.toLowerCase();
  return opp.deadline === "2026-12-31" && (text.includes("rolling") || text.includes("no fixed deadline") || text.includes("open-ended"));
}

export function isFixedDeadlineOpportunity(opp: Opportunity): boolean {
  return !isRollingOpportunity(opp);
}

export function utcStartOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function daysUntilDeadline(opp: Opportunity, today = new Date()): number | null {
  if (isRollingOpportunity(opp)) return null;
  const parsed = parseISO(opp.deadline);
  if (!isValid(parsed)) return null; // guard against malformed date strings
  const deadlineUtc = utcStartOfDay(parsed);
  const todayUtc = utcStartOfDay(today);
  return Math.round((deadlineUtc.getTime() - todayUtc.getTime()) / MS_PER_DAY);
}

export function deadlineDisplay(opp: Opportunity, today = new Date()): string {
  const days = daysUntilDeadline(opp, today);
  if (days === null) return "Rolling";
  const date = format(parseISO(opp.deadline), "d MMM yyyy");
  if (days < 0) return `${date} (closed)`;
  if (days === 0) return `${date} (closes today)`;
  return `${date} (${days} days left)`;
}

export function deadlineShortDisplay(opp: Opportunity, today = new Date()): string {
  const days = daysUntilDeadline(opp, today);
  if (days === null) return "Rolling";
  if (days < 0) return "Closed";
  if (days === 0) return "Closes today";
  return `${days}d left`;
}

export function sortDeadlineValue(opp: Opportunity, today = new Date()): number {
  const days = daysUntilDeadline(opp, today);
  return days === null ? Number.MAX_SAFE_INTEGER : days;
}

export function makeGoogleCalendarUrl(opp: Opportunity): string | null {
  if (isRollingOpportunity(opp)) return null;
  const deadline = parseISO(opp.deadline);
  if (!isValid(deadline)) return null;
  const start = format(deadline, "yyyyMMdd");
  const endDate = new Date(deadline.getTime() + MS_PER_DAY);
  const end = format(endDate, "yyyyMMdd");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Deadline: ${opp.title}`,
    dates: `${start}/${end}`,
    details: `${opp.hook}\n\nEligibility: ${opp.eligibility}\n\nOfficial source: ${opp.source}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function foldIcsLine(line: string): string {
  const chunks: string[] = [];
  let remaining = line;
  while (remaining.length > 73) {
    chunks.push(remaining.slice(0, 73));
    remaining = ` ${remaining.slice(73)}`;
  }
  chunks.push(remaining);
  return chunks.join("\r\n");
}

function formatIcsDate(date: Date): string {
  return format(date, "yyyyMMdd");
}

function formatIcsDateTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function makeIcsFilename(opp: Opportunity): string {
  return `${opp.id}-deadline.ics`;
}

export function makeDeadlineIcs(opp: Opportunity, now = new Date()): string | null {
  if (isRollingOpportunity(opp)) return null;

  const deadline = parseISO(opp.deadline);
  if (!isValid(deadline)) return null;
  const endDate = new Date(deadline.getTime() + MS_PER_DAY);
  const description = [
    opp.hook,
    "",
    `Eligibility: ${opp.eligibility}`,
    `Region: ${opp.region}`,
    `Category: ${opp.category}`,
    `Official source: ${opp.source}`
  ].join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AI Opportunity Radar//Deadline Reminder//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(`${opp.id}@ai-opportunity-radar`)}`,
    `DTSTAMP:${formatIcsDateTime(now)}`,
    `DTSTART;VALUE=DATE:${formatIcsDate(deadline)}`,
    `DTEND;VALUE=DATE:${formatIcsDate(endDate)}`,
    `SUMMARY:${escapeIcsText(`Deadline: ${opp.title}`)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `URL:${escapeIcsText(opp.source)}`,
    "TRANSP:TRANSPARENT",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(`7-day reminder: ${opp.title} deadline`)}`,
    "TRIGGER:-P7D",
    "END:VALARM",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(`1-day reminder: ${opp.title} deadline`)}`,
    "TRIGGER:-P1D",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
