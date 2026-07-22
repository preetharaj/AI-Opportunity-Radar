// src/lib/exitIntent.ts
//
// Pure decision logic for the exit-intent subscribe prompt, kept separate
// from any DOM/React code so it can be unit-tested without a browser or
// component-testing framework (see scripts/test-exit-intent.mjs, which
// mirrors this logic exactly — keep the two in sync on any change).

/** Don't fire in the first N ms after mount — avoids false triggers from
 * the cursor's natural path to the address bar right after page load. */
export const EXIT_INTENT_MIN_DELAY_MS = 8_000;

/** Below this viewport width, treat as a touch device — mouseleave-based
 * exit intent doesn't make sense without a mouse. */
export const EXIT_INTENT_MIN_VIEWPORT_WIDTH = 768;

export interface ExitIntentCheckParams {
  /** clientY from the triggering mouseleave/mouseout event. */
  clientY: number;
  /** relatedTarget from the same event. null/undefined means the pointer
   * left the document entirely (toward the browser chrome), rather than
   * moving onto another in-page element. */
  relatedTarget: unknown;
  /** Milliseconds since the listener was mounted. */
  msSinceMount: number;
  /** Current viewport width in px. */
  viewportWidth: number;
  /** True if this visitor has ever successfully subscribed (persisted,
   * e.g. in localStorage) — never show again if so. */
  hasSubscribed: boolean;
  /** True if this visitor dismissed the prompt earlier in this session
   * (e.g. sessionStorage) — don't re-show within the same session. */
  hasDismissedThisSession: boolean;
  /** True if the prompt has already been shown once this session, even
   * if not explicitly dismissed (e.g. they subscribed via a different
   * widget on the page) — caps it at one appearance per session. */
  hasShownThisSession: boolean;
}

/**
 * Decide whether an exit-intent mouseleave event should trigger the
 * subscribe prompt. Pure function, no side effects, no DOM access —
 * callers pass in everything it needs to know.
 */
export function shouldTriggerExitIntent(params: ExitIntentCheckParams): boolean {
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
  // relatedTarget present means the pointer moved onto another in-page
  // element (e.g. a link, another widget) — that's normal in-page
  // movement, not the pointer leaving the window toward browser chrome.
  if (relatedTarget !== null && relatedTarget !== undefined) return false;
  // Leaving toward the top of the viewport (address bar / tab strip) is
  // the classic exit-intent signal. clientY <= 0 covers the pointer
  // having crossed above the document.
  if (!Number.isFinite(clientY) || clientY > 0) return false;

  return true;
}

/** Paths where the exit-intent prompt should never render, even if the
 * component is mounted globally in the layout. */
export const EXIT_INTENT_EXCLUDED_PATHS = ["/unsubscribe", "/reminders/unsubscribe"];

export function isExitIntentExcludedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return EXIT_INTENT_EXCLUDED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
