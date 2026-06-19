// src/components/Providers.tsx
"use client";
import { SessionProvider } from "next-auth/react";
import { FEATURE_FLAGS } from "@/lib/featureFlags";

export function Providers({ children }: { children: React.ReactNode }) {
  if (!FEATURE_FLAGS.showSignIn) {
    // Public mode — skip SessionProvider entirely so it never fires its
    // background /api/auth/session fetch on pages that don't need it.
    return <>{children}</>;
  }
  return <SessionProvider>{children}</SessionProvider>;
}
