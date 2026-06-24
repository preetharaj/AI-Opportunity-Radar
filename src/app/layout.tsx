// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { NavBar } from "@/components/ui/NavBar";
import { Providers } from "@/components/Providers";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { UmamiAnalytics } from "@/components/analytics/UmamiAnalytics";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Opportunity Radar",
  description: "Find AI grants, fellowships, internships, and startup programs — with biweekly updates and deadline reminders.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Skip the auth() call entirely in public mode. This avoids an unnecessary
  // Turso round-trip on every page render, and — more importantly — means the
  // public site keeps working even if Turso/Auth.js env vars are never set up,
  // since none of the currently-visible features need them.
  let user: { name?: string | null; email?: string | null } | null = null;
  if (FEATURE_FLAGS.showSignIn) {
    const { auth } = await import("@/lib/auth/config");
    const session = await auth();
    user = session?.user ?? null;
  }

  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 text-gray-900 min-h-screen`}>
        <UmamiAnalytics />
        <Providers>
          <Suspense fallback={<div className="h-14 bg-white border-b border-gray-100" />}>
            <NavBar user={user} />
          </Suspense>
          <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
