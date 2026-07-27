// src/components/ExitIntentSubscribe.tsx
"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { SubscribeWidget } from "@/components/SubscribeWidget";
import { shouldTriggerExitIntent, isExitIntentExcludedPath } from "@/lib/exitIntent";
import {
  hasSubscribedFlag,
  hasDismissedExitIntentThisSession,
  setDismissedExitIntentThisSession,
  hasShownExitIntentThisSession,
  setShownExitIntentThisSession,
} from "@/lib/subscribeStorage";
import { PROJECT_STATUS } from "@/lib/projectStatus";

/** How long to leave the modal open after a successful subscribe before
 * auto-closing it, so the person sees the confirmation state. */
const AUTO_CLOSE_AFTER_SUCCESS_MS = 2_500;

export function ExitIntentSubscribe() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const mountedAtRef = useRef<number | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback((markDismissed: boolean) => {
    setOpen(false);
    if (markDismissed) setDismissedExitIntentThisSession();
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  // Track mount time for the "don't fire immediately on load" guard.
  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    // Project paused — don't even attach the listener, let alone show the
    // modal. Popping up "sorry, we're not taking subscribers" on exit is
    // exactly the kind of annoying popup this feature was built to avoid.
    if (!PROJECT_STATUS.active) return;
    if (isExitIntentExcludedPath(pathname)) return;

    function handleMouseOut(e: MouseEvent) {
      if (mountedAtRef.current === null) return;

      const shouldShow = shouldTriggerExitIntent({
        clientY: e.clientY,
        relatedTarget: e.relatedTarget,
        msSinceMount: Date.now() - mountedAtRef.current,
        viewportWidth: window.innerWidth,
        hasSubscribed: hasSubscribedFlag(),
        hasDismissedThisSession: hasDismissedExitIntentThisSession(),
        hasShownThisSession: hasShownExitIntentThisSession(),
      });

      if (shouldShow) {
        setShownExitIntentThisSession();
        setOpen(true);
      }
    }

    document.addEventListener("mouseout", handleMouseOut);
    return () => document.removeEventListener("mouseout", handleMouseOut);
  }, [pathname]);

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close(true);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  // Clean up any pending auto-close timer on unmount.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-intent-heading"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close(true);
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl p-1">
        <button
          type="button"
          onClick={() => close(true)}
          aria-label="Close"
          className="absolute top-3 right-3 h-7 w-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          ×
        </button>
        <div className="p-5">
          <h2 id="exit-intent-heading" className="text-sm font-semibold text-slate-950 mb-3 pr-6">
            Before you go — want new AI opportunities in your inbox?
          </h2>
          <SubscribeWidget
            variant="inline"
            onSuccess={() => {
              closeTimerRef.current = setTimeout(() => close(false), AUTO_CLOSE_AFTER_SUCCESS_MS);
            }}
          />
        </div>
      </div>
    </div>
  );
}
