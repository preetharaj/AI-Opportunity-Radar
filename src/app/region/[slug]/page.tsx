// src/app/region/[slug]/page.tsx
// Region landing page — one per covered region. Statically generated.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { opportunities } from "@/lib/data/opportunities";
import { daysUntilDeadline, isFixedDeadlineOpportunity } from "@/lib/deadlines";
import { PublicFeed } from "@/app/PublicFeed";
import { SubscribeWidget } from "@/components/SubscribeWidget";
import type { Region } from "@/lib/types";

const SITE_URL = (process.env.NEXTAUTH_URL ?? process.env.SITE_URL ?? "https://mapd.cc").replace(/\/$/, "");

const REGION_META: Record<string, { region: Region; label: string; intro: string }> = {
  global: {
    region: "Global",
    label: "Global",
    intro:
      "Opportunities open to applicants anywhere in the world, or run entirely remotely with no residency restriction — grants, fellowships, courses, internships, and fractional jobs with no geographic gate.",
  },
  india: {
    region: "India",
    label: "India",
    intro:
      "AI opportunities based in or specifically open to applicants in India — one of this catalog's deepest regional verticals, covering government and private grants, university fellowships, and remote-friendly fractional roles, alongside Global-region listings that India-based applicants are also eligible for.",
  },
  sea: {
    region: "SEA",
    label: "Southeast Asia",
    intro:
      "Opportunities based in or open to Southeast Asia — Singapore, Indonesia, Vietnam, Malaysia, the Philippines, and neighboring markets — another region this catalog deliberately over-indexes on relative to typical aggregators, alongside Global-region listings SEA-based applicants can also apply to.",
  },
  europe: {
    region: "Europe",
    label: "Europe",
    intro:
      "AI grants, fellowships, courses, internships, and fractional roles based in or open to Europe, plus Global-region listings European applicants are also eligible for.",
  },
  usa: {
    region: "USA",
    label: "USA",
    intro:
      "AI opportunities based in or open to applicants in the United States, plus Global-region listings USA-based applicants can also apply to.",
  },
  australia: {
    region: "Australia",
    label: "Australia",
    intro:
      "AI opportunities based in or open to Australia — a smaller but actively tracked region in this catalog — plus Global-region listings Australia-based applicants are also eligible for.",
  },
};

const REGION_SLUGS = Object.keys(REGION_META);

export function generateStaticParams() {
  return REGION_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const meta = REGION_META[params.slug];
  if (!meta) return { title: "Region not found | AI Opportunity Radar" };

  const title = `AI Opportunities in ${meta.label} — Curated & Verified`;
  const description = `${meta.intro.slice(0, 145)}${meta.intro.length > 145 ? "…" : ""}`;
  const canonicalUrl = `${SITE_URL}/region/${params.slug}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: { title, description, url: canonicalUrl, siteName: "AI Opportunity Radar", type: "website" },
    twitter: { card: "summary", title, description, site: "@mapd_cc" },
  };
}

export default function RegionPage({ params }: { params: { slug: string } }) {
  const meta = REGION_META[params.slug];
  if (!meta) notFound();

  const today = new Date().toISOString().slice(0, 10);
  // Global-region entries are relevant to every region page, matching the
  // homepage's existing region-filter behavior (region === selected || "Global").
  const active = opportunities
    .filter((o) => o.region === meta.region || (meta.region !== "Global" && o.region === "Global"))
    .filter((o) => !isFixedDeadlineOpportunity(o) || o.deadline >= today)
    .map((o) => ({ ...o, daysUntilDeadline: daysUntilDeadline(o, new Date()) }));

  const canonicalUrl = `${SITE_URL}/region/${params.slug}`;

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: active.map((o, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/opportunities/${o.id}`,
      name: o.title,
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: meta.label, item: canonicalUrl },
    ],
  };

  const otherRegions = REGION_SLUGS.filter((s) => s !== params.slug);
  const categories = [
    { slug: "grant", label: "Grants" },
    { slug: "fellowship", label: "Fellowships" },
    { slug: "course", label: "Courses" },
    { slug: "internship", label: "Internships" },
    { slug: "fractional_job", label: "Fractional Jobs" },
  ];

  return (
    <div className="space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
        <ol className="flex items-center gap-1.5">
          <li><Link href="/" className="hover:text-slate-600">Home</Link></li>
          <li aria-hidden="true">›</li>
          <li className="text-slate-600" aria-current="page">{meta.label}</li>
        </ol>
      </nav>

      <div>
        <h1 className="text-3xl sm:text-4xl font-semibold text-slate-950 tracking-tight">AI Opportunities in {meta.label}</h1>
        <p className="mt-4 max-w-2xl text-slate-600 leading-7">{meta.intro}</p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="text-slate-400 self-center">Browse by category:</span>
        {categories.map((c) => (
          <Link key={c.slug} href={`/category/${c.slug}`} className="btn-secondary text-xs">
            {c.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="text-slate-400 self-center">Other regions:</span>
        {otherRegions.map((s) => (
          <Link key={s} href={`/region/${s}`} className="btn-secondary text-xs">
            {REGION_META[s].label}
          </Link>
        ))}
      </div>

      <PublicFeed opportunities={active} />

      <div className="pt-4 border-t border-slate-100">
        <SubscribeWidget variant="inline" />
      </div>
    </div>
  );
}
