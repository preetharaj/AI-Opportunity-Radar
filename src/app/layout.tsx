// src/app/layout.tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { NavBar } from "@/components/ui/NavBar";
import { Providers } from "@/components/Providers";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { UmamiAnalytics } from "@/components/analytics/UmamiAnalytics";

const SITE_URL = (process.env.NEXTAUTH_URL ?? process.env.SITE_URL ?? "https://mapd.cc").replace(/\/$/, "");

// Site-level default metadata. Individual pages override title/description/OG
// via their own generateMetadata export — Next.js merges them automatically.
export const metadata: Metadata = {
  title: {
    default: "AI Opportunity Radar",
    // Page-level titles are used as-is; layout title is the fallback.
    template: "%s | AI Opportunity Radar",
  },
  description:
    "Curated AI grants, fellowships, internships, and startup programs — with biweekly updates and deadline reminders. Strongest coverage in India, SEA, and Australia.",
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: "AI Opportunity Radar",
    description:
      "Curated AI grants, fellowships, internships, and startup programs — biweekly updates and deadline reminders.",
    url: SITE_URL,
    siteName: "AI Opportunity Radar",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "AI Opportunity Radar",
    description:
      "Curated AI grants, fellowships, internships, and startup programs — biweekly updates and deadline reminders.",
    site: "@mapd_cc", // update to your real Twitter handle
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let user: { name?: string | null; email?: string | null } | null = null;
  if (FEATURE_FLAGS.showSignIn) {
    const { auth } = await import("@/lib/auth/config");
    const session = await auth();
    user = session?.user ?? null;
  }

  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
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
