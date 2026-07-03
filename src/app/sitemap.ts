// src/app/sitemap.ts
// Next.js App Router native sitemap — auto-served at /sitemap.xml
// Includes all public opportunity detail pages + static pages.
// robots.txt points here so Google finds it immediately.
import type { MetadataRoute } from "next";
import { opportunities } from "@/lib/data/opportunities";
import { isRollingOpportunity } from "@/lib/deadlines";

const SITE_URL = (process.env.NEXTAUTH_URL ?? process.env.SITE_URL ?? "https://mapd.cc").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Static pages
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/unsubscribe`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.1,
    },
  ];

  // One URL per opportunity
  // - Rolling entries still get indexed (they're always open)
  // - Expired fixed-deadline entries are excluded — no point sending Google
  //   to a closed opportunity page
  const today = now.toISOString().slice(0, 10);
  const opportunityRoutes: MetadataRoute.Sitemap = opportunities
    .filter((opp) => {
      if (isRollingOpportunity(opp)) return true;
      return opp.deadline >= today; // exclude already-closed
    })
    .map((opp) => ({
      url: `${SITE_URL}/opportunities/${opp.id}`,
      lastModified: new Date(opp.lastVerified),
      changeFrequency: "weekly" as const,
      // Higher priority for opportunities closing soon (more urgency = more clicks)
      priority: opp.deadline >= today && !isRollingOpportunity(opp)
        ? 0.9
        : 0.7,
    }));

  return [...staticRoutes, ...opportunityRoutes];
}
