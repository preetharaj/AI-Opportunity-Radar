// src/lib/subscribeStorage.ts
//
// Shared storage keys for subscribe-related client state. Kept in one
// place so SubscribeWidget and ExitIntentSubscribe never drift apart on
// the key name.

/** localStorage — persists across sessions/tabs. Set once a subscribe
 * (or "already subscribed") response succeeds. Never show exit-intent
 * again for this visitor once true. */
export const SUBSCRIBED_STORAGE_KEY = "aior_subscribed";

/** sessionStorage — cleared when the tab/browser session ends. Set when
 * the exit-intent prompt is dismissed (closed without subscribing), or
 * shown at all, so it doesn't reappear repeatedly in one visit. */
export const EXIT_INTENT_DISMISSED_KEY = "aior_exit_intent_dismissed";
export const EXIT_INTENT_SHOWN_KEY = "aior_exit_intent_shown";

function safeGet(storage: Storage | undefined, key: string): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(key) === "1";
  } catch {
    // Storage can throw in private-browsing modes or when disabled by
    // browser settings — treat as "not set" rather than crashing.
    return false;
  }
}

function safeSet(storage: Storage | undefined, key: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, "1");
  } catch {
    // Ignore — worst case the prompt shows again next time, which is
    // harmless, rather than breaking the page.
  }
}

export function hasSubscribedFlag(): boolean {
  if (typeof window === "undefined") return false;
  return safeGet(window.localStorage, SUBSCRIBED_STORAGE_KEY);
}

export function setSubscribedFlag(): void {
  if (typeof window === "undefined") return;
  safeSet(window.localStorage, SUBSCRIBED_STORAGE_KEY);
}

export function hasDismissedExitIntentThisSession(): boolean {
  if (typeof window === "undefined") return false;
  return safeGet(window.sessionStorage, EXIT_INTENT_DISMISSED_KEY);
}

export function setDismissedExitIntentThisSession(): void {
  if (typeof window === "undefined") return;
  safeSet(window.sessionStorage, EXIT_INTENT_DISMISSED_KEY);
}

export function hasShownExitIntentThisSession(): boolean {
  if (typeof window === "undefined") return false;
  return safeGet(window.sessionStorage, EXIT_INTENT_SHOWN_KEY);
}

export function setShownExitIntentThisSession(): void {
  if (typeof window === "undefined") return;
  safeSet(window.sessionStorage, EXIT_INTENT_SHOWN_KEY);
}
