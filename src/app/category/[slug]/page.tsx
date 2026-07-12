// src/app/category/[slug]/page.tsx
// Category landing page — one per opportunity category. Statically generated.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { opportunities } from "@/lib/data/opportunities";
import { daysUntilDeadline, isFixedDeadlineOpportunity } from "@/lib/deadlines";
import { PublicFeed } from "@/app/PublicFeed";
import type { Opportunity } from "@/lib/types";

const SITE_URL = (process.env.NEXTAUTH_URL ?? process.env.SITE_URL ?? "https://mapd.cc").replace(/\/$/, "");

type CategorySlug = Opportunity["category"];

const CATEGORY_META: Record<CategorySlug, { label: string; plural: string; intro: string }> = {
  grant: {
    label: "AI Grant",
    plural: "AI Grants",
    intro:
      "Non-dilutive funding for AI research, tooling, and public-interest projects, sourced directly from foundations, governments, and research bodies. Every grant below links to its official application page and carries a last-verified date.",
  },
  fellowship: {
    label: "AI Fellowship",
    plural: "AI Fellowships",
    intro:
      "Structured fellowship programs for researchers, engineers, and builders working on AI — spanning academic, industry, and public-interest tracks. Each listing is manually checked against its official source before publication.",
  },
  course: {
    label: "AI Course",
    plural: "AI Courses",
    intro:
      "Courses and structured learning programs covering AI and machine learning, from free self-paced material to paid cohort-based programs. Cost type is shown on every entry so you know what you're signing up for.",
  },
  internship: {
    label: "AI Internship",
    plural: "AI Internships",
    intro:
      "Internships at labs, startups, and research groups working on AI, curated for relevance and freshness rather than volume. Expired listings are removed rather than left indexed.",
  },
  fractional_job: {
    label: "Fractional AI Job",
    plural: "Fractional AI Jobs",
    intro:
      "Part-time and fractional roles for experienced AI practitioners — advisory, fractional CAIO, and part-time technical positions sourced from fractional-work marketplaces and direct company postings.",
  },
};

const CATEGORY_SLUGS = Object.keys(CATEGORY_META) as CategorySlug[];

export function generateStaticParams() {
  return CATEGORY_SLUGS.map((slug) => ({ slug }));
}

function getMeta(slug: string) {
  return CATEGORY_META[slug as CategorySlug];
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const meta = getMeta(params.slug);
  if (!meta) return { title: "Category not found | AI Opportunity Radar" };

  const title = `${meta.plural} — Curated, Deadline-Verified`;
  const description = `${meta.intro.slice(0, 145)}${meta.intro.length > 145 ? "…" : ""}`;
  const canonicalUrl = `${SITE_URL}/category/${params.slug}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: { title, description, url: canonicalUrl, siteName: "AI Opportunity Radar", type: "website" },
    twitter: { card: "summary", title, description, site: "@mapd_cc" },
  };
}

export default function CategoryPage({ params }: { params: { slug: string } }) {
  const meta = getMeta(params.slug);
  if (!meta) notFound();
  const slug = params.slug as CategorySlug;

  const today = new Date().toISOString().slice(0, 10);
  const active = opportunities
    .filter((o) => o.category === slug)
    .filter((o) => !isFixedDeadlineOpportunity(o) || o.deadline >= today)
    .map((o) => ({ ...o, daysUntilDeadline: daysUntilDeadline(o, new Date()) }));

  const canonicalUrl = `${SITE_URL}/category/${slug}`;

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
      { "@type": "ListItem", position: 2, name: meta.plural, item: canonicalUrl },
    ],
  };

  const otherCategories = CATEGORY_SLUGS.filter((c) => c !== slug);
  const regions = [
    { slug: "global", label: "Global" },
    { slug: "india", label: "India" },
    { slug: "sea", label: "Southeast Asia" },
    { slug: "europe", label: "Europe" },
    { slug: "usa", label: "USA" },
    { slug: "australia", label: "Australia" },
  ];

  return (
    <div className="space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
        <ol className="flex items-center gap-1.5">
          <li><Link href="/" className="hover:text-slate-600">Home</Link></li>
          <li aria-hidden="true">›</li>
          <li className="text-slate-600" aria-current="page">{meta.plural}</li>
        </ol>
      </nav>

      <div>
        <h1 className="text-3xl sm:text-4xl font-semibold text-slate-950 tracking-tight">{meta.plural} — Curated, Deadline-Verified</h1>
        <p className="mt-4 max-w-2xl text-slate-600 leading-7">{meta.intro}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {otherCategories.map((c) => (
          <Link key={c} href={`/category/${c}`} className="btn-secondary text-xs">
            {CATEGORY_META[c].plural}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="text-slate-400 self-center">Browse by region:</span>
        {regions.map((r) => (
          <Link key={r.slug} href={`/region/${r.slug}`} className="btn-secondary text-xs">
            {r.label}
          </Link>
        ))}
      </div>

      <PublicFeed opportunities={active} />
    </div>
  );
}
