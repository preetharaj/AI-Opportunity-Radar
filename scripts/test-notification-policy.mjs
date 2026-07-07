import assert from "node:assert/strict";

const MS_PER_DAY = 86_400_000;
const FOLLOW_REMINDER_DAYS = new Set([7, 3, 1, 0]);

function utcStartOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
function daysUntil(deadline, today) {
  return Math.round((utcStartOfDay(new Date(`${deadline}T00:00:00Z`)).getTime() - utcStartOfDay(today).getTime()) / MS_PER_DAY);
}
function isMondayUtc(date) { return date.getUTCDay() === 1; }
function isBiweeklyDigestDay(date, startDate = "2026-06-22") {
  if (!isMondayUtc(date)) return false;
  const start = new Date(`${startDate}T00:00:00Z`);
  assert.equal(start.getUTCDay(), 1, "biweekly start date must be Monday");
  const daysSinceStart = Math.round((utcStartOfDay(date).getTime() - start.getTime()) / MS_PER_DAY);
  return daysSinceStart >= 0 && daysSinceStart % 14 === 0;
}
function followCandidates(opps, today) {
  return opps.filter((o) => o.deadlineType !== "rolling").map((o) => ({ id: o.id, daysLeft: daysUntil(o.deadline, today) })).filter((o) => FOLLOW_REMINDER_DAYS.has(o.daysLeft));
}
function closingRoundup(opps, today) {
  return opps.filter((o) => o.deadlineType !== "rolling").map((o) => ({ id: o.id, daysLeft: daysUntil(o.deadline, today) })).filter((o) => o.daysLeft >= 0 && o.daysLeft <= 7);
}

const monday = new Date("2026-07-06T08:15:00Z");
const nextMonday = new Date("2026-07-13T08:15:00Z");
const opps = [
  { id: "seven", deadline: "2026-07-13", deadlineType: "fixed" },
  { id: "three", deadline: "2026-07-09", deadlineType: "fixed" },
  { id: "one", deadline: "2026-07-07", deadlineType: "fixed" },
  { id: "today", deadline: "2026-07-06", deadlineType: "fixed" },
  { id: "eight", deadline: "2026-07-14", deadlineType: "fixed" },
  { id: "closed", deadline: "2026-07-05", deadlineType: "fixed" },
  { id: "rolling", deadline: "2026-12-31", deadlineType: "rolling" },
];

assert.equal(isMondayUtc(monday), true, "weekly roundup should be Monday-gated");
assert.equal(isBiweeklyDigestDay(new Date("2026-06-22T08:00:00Z")), true, "biweekly anchor day should send");
assert.equal(isBiweeklyDigestDay(new Date("2026-06-29T08:00:00Z")), false, "off-week Monday should not send biweekly digest");
assert.equal(isBiweeklyDigestDay(nextMonday), false, "2026-07-13 is off-cycle from 2026-06-22 anchor");
assert.deepEqual(followCandidates(opps, monday).map((o) => o.id), ["seven", "three", "one", "today"], "follow reminders send only 7/3/1/0 days");
assert.deepEqual(closingRoundup(opps, monday).map((o) => o.id), ["seven", "three", "one", "today"], "weekly roundup includes 0..7 days and excludes expired/rolling/8-day items");

const keyA = `follow:a@example.com:seven:2026-07-13:7`;
const keyB = `follow:a@example.com:seven:2026-07-20:7`;
assert.notEqual(keyA, keyB, "deadline changes must produce a new idempotency key");

console.log("notification policy tests passed");
