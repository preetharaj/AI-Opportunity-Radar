// src/app/sitemap.ts
// Next.js App Router native sitemap — auto-served at /sitemap.xml
// Includes all public opportunity detail pages + static pages.
// robots.txt points here so Google finds it immediately.
import type { MetadataRoute } from "next";
import { opportunities } from "@/lib/data/opportunities";
import { isRollingOpportunity } from "@/lib/deadlines";

const SITE_URL = (process.env.NEXTAUTH_URL ?? process.env.SITE_URL ?? "https://mapd.cc").replace(/\/$/, "");

const CATEGORY_SLUGS = ["grant", "fellowship", "course", "internship", "fractional_job"];
const REGION_SLUGS = ["global", "india", "sea", "europe", "usa", "australia"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Most-recent lastVerified across the catalog — used as a freshness proxy
  // for the category/region listing pages, which aggregate many entries.
  const latestVerified = opportunities.reduce((latest, opp) => {
    const d = new Date(opp.lastVerified);
    return d > latest ? d : latest;
  }, new Date(0));

  // Static pages
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/unsubscribe`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.1,
    },
  ];

  const categoryRoutes: MetadataRoute.Sitemap = CATEGORY_SLUGS.map((slug) => ({
    url: `${SITE_URL}/category/${slug}`,
    lastModified: latestVerified,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  const regionRoutes: MetadataRoute.Sitemap = REGION_SLUGS.map((slug) => ({
    url: `${SITE_URL}/region/${slug}`,
    lastModified: latestVerified,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

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

  return [...staticRoutes, ...categoryRoutes, ...regionRoutes, ...opportunityRoutes];
}
