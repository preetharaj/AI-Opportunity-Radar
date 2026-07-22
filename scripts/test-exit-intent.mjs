// scripts/test-exit-intent.mjs
//
// Unit tests for the exit-intent trigger decision logic in
// src/lib/exitIntent.ts. Mirrors that file's shouldTriggerExitIntent
// function exactly (see the note at the top of exitIntent.ts) so this can
// run as a plain node script without a TS/component-testing toolchain,
// matching this repo's existing test-*.mjs convention.
import assert from "node:assert/strict";

const EXIT_INTENT_MIN_DELAY_MS = 8_000;
const EXIT_INTENT_MIN_VIEWPORT_WIDTH = 768;

function shouldTriggerExitIntent(params) {
  const {
    clientY,
    relatedTarget,
    msSinceMount,
    viewportWidth,
    hasSubscribed,
    hasDismissedThisSession,
    hasShownThisSession,
  } = params;

  if (hasSubscribed) return false;
  if (hasDismissedThisSession) return false;
  if (hasShownThisSession) return false;
  if (!Number.isFinite(viewportWidth) || viewportWidth < EXIT_INTENT_MIN_VIEWPORT_WIDTH) return false;
  if (!Number.isFinite(msSinceMount) || msSinceMount < EXIT_INTENT_MIN_DELAY_MS) return false;
  if (relatedTarget !== null && relatedTarget !== undefined) return false;
  if (!Number.isFinite(clientY) || clientY > 0) return false;

  return true;
}

function isExitIntentExcludedPath(pathname) {
  const EXCLUDED = ["/unsubscribe", "/reminders/unsubscribe"];
  if (!pathname) return false;
  return EXCLUDED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// ─── Baseline: every gating condition satisfied ────────────────────────────

const baseline = {
  clientY: -1,
  relatedTarget: null,
  msSinceMount: 10_000,
  viewportWidth: 1280,
  hasSubscribed: false,
  hasDismissedThisSession: false,
  hasShownThisSession: false,
};

assert.equal(shouldTriggerExitIntent(baseline), true, "baseline: all conditions met should trigger");

// ─── clientY / vertical position ────────────────────────────────────────────

assert.equal(
  shouldTriggerExitIntent({ ...baseline, clientY: 0 }),
  true,
  "clientY exactly 0 (top edge) should still trigger"
);
assert.equal(
  shouldTriggerExitIntent({ ...baseline, clientY: 5 }),
  false,
  "positive clientY (pointer still inside viewport) must not trigger"
);
assert.equal(
  shouldTriggerExitIntent({ ...baseline, clientY: Number.NaN }),
  false,
  "non-finite clientY must not trigger"
);

// ─── relatedTarget (leaving the document vs. moving to another element) ────

assert.equal(
  shouldTriggerExitIntent({ ...baseline, relatedTarget: undefined }),
  true,
  "undefined relatedTarget (older browsers) should still trigger"
);
assert.equal(
  shouldTriggerExitIntent({ ...baseline, relatedTarget: {} }),
  false,
  "any non-null relatedTarget (moved onto another in-page element) must not trigger"
);

// ─── viewport width (desktop-only gate) ─────────────────────────────────────

assert.equal(
  shouldTriggerExitIntent({ ...baseline, viewportWidth: 767 }),
  false,
  "just under the desktop threshold must not trigger"
);
assert.equal(
  shouldTriggerExitIntent({ ...baseline, viewportWidth: 768 }),
  true,
  "exactly at the desktop threshold should trigger"
);
assert.equal(
  shouldTriggerExitIntent({ ...baseline, viewportWidth: 375 }),
  false,
  "mobile-width viewport must not trigger"
);
assert.equal(
  shouldTriggerExitIntent({ ...baseline, viewportWidth: Number.NaN }),
  false,
  "non-finite viewport width must not trigger"
);

// ─── minimum delay since mount ───────────────────────────────────────────────

assert.equal(
  shouldTriggerExitIntent({ ...baseline, msSinceMount: 0 }),
  false,
  "immediately on load must not trigger"
);
assert.equal(
  shouldTriggerExitIntent({ ...baseline, msSinceMount: EXIT_INTENT_MIN_DELAY_MS - 1 }),
  false,
  "just under the minimum delay must not trigger"
);
assert.equal(
  shouldTriggerExitIntent({ ...baseline, msSinceMount: EXIT_INTENT_MIN_DELAY_MS }),
  true,
  "exactly at the minimum delay should trigger"
);

// ─── persisted / session state gates ────────────────────────────────────────

assert.equal(
  shouldTriggerExitIntent({ ...baseline, hasSubscribed: true }),
  false,
  "already-subscribed visitors must never see the prompt"
);
assert.equal(
  shouldTriggerExitIntent({ ...baseline, hasDismissedThisSession: true }),
  false,
  "dismissed-this-session must not re-trigger in the same session"
);
assert.equal(
  shouldTriggerExitIntent({ ...baseline, hasShownThisSession: true }),
  false,
  "already-shown-this-session caps it at one appearance, even without explicit dismissal"
);

// Gates are independent of each other — combining several "should block"
// conditions must still block.
assert.equal(
  shouldTriggerExitIntent({
    ...baseline,
    hasSubscribed: true,
    viewportWidth: 375,
    clientY: 100,
  }),
  false,
  "multiple simultaneous blocking conditions must still block"
);

// ─── excluded-path helper ────────────────────────────────────────────────────

assert.equal(isExitIntentExcludedPath("/unsubscribe"), true, "exact match on /unsubscribe must be excluded");
assert.equal(
  isExitIntentExcludedPath("/reminders/unsubscribe"),
  true,
  "exact match on /reminders/unsubscribe must be excluded"
);
assert.equal(
  isExitIntentExcludedPath("/unsubscribe/"),
  true,
  "trailing slash on an excluded path must still be excluded"
);
assert.equal(isExitIntentExcludedPath("/opportunities/some-id"), false, "unrelated paths must not be excluded");
assert.equal(isExitIntentExcludedPath("/"), false, "homepage must not be excluded");
assert.equal(
  isExitIntentExcludedPath("/unsubscribed-newsletter"),
  false,
  "a path that merely starts with the excluded string but isn't a real sub-path must not match"
);
assert.equal(isExitIntentExcludedPath(null), false, "null pathname must not throw and must not be excluded");
assert.equal(isExitIntentExcludedPath(undefined), false, "undefined pathname must not throw and must not be excluded");
assert.equal(isExitIntentExcludedPath(""), false, "empty-string pathname must not be excluded");

console.log("exit intent tests passed");
