import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const notifyRoute = readFileSync('src/app/api/notify/route.ts', 'utf8');
const workflow = readFileSync('.github/workflows/notifications.yml', 'utf8');
const queries = readFileSync('src/lib/db/queries.ts', 'utf8');
const dbInit = readFileSync('scripts/db-init.js', 'utf8');

assert(!notifyRoute.includes('getActiveSubscribersForDeadlineReminders'), 'notify route must not use legacy global deadline subscriber blast query');
assert(!notifyRoute.includes('sendSubscriberDeadlineReminder'), 'notify route must not send legacy global deadline blasts');
assert(notifyRoute.includes('phase=daily') || notifyRoute.includes('requestedPhase'), 'notify route should support explicit notification phases');
assert(notifyRoute.includes('BATCH_LIMIT'), 'notify route should be batch-limited');
assert(workflow.includes('call_phase daily'), 'workflow must call daily phase');
assert(workflow.includes('call_phase weekly'), 'workflow must call weekly phase');
assert(workflow.includes('call_phase biweekly'), 'workflow must call biweekly phase');
assert(workflow.includes('hasMore'), 'workflow must loop using hasMore');
assert(workflow.includes('nextCursor'), 'workflow must loop using nextCursor');
assert(queries.includes('getActiveSubscribersPage'), 'subscriber pagination query is missing');
assert(queries.includes('getActiveFollowsForOpportunityIdsPage'), 'follow pagination query is missing');
assert(dbInit.includes('idx_subscribers_status_email'), 'subscriber pagination index is missing');
assert(dbInit.includes('idx_email_follows_due_page'), 'follow pagination index is missing');

console.log('notification pipeline tests passed');
