// src/app/opportunities/[id]/page.tsx
// Canonical opportunity detail page.
// SEO: generateMetadata for title/description/OG/Twitter + JSON-LD structured data.
// Old URL (/opportunity/[id]) redirects here via next.config.js redirects.

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getOpportunityById, opportunities } from "@/lib/data/opportunities";
import type { Opportunity } from "@/lib/types";
import { EligibilityChecker } from "@/components/EligibilityChecker";
import { FollowButton } from "@/components/opportunity/FollowButton";
import {
  deadlineDisplay,
  daysUntilDeadline,
  isRollingOpportunity,
  makeGoogleCalendarUrl,
} from "@/lib/deadlines";

// ─── constants ────────────────────────────────────────────────────────────────

const SITE_URL = (process.env.NEXTAUTH_URL ?? process.env.SITE_URL ?? "https://mapd.cc").replace(/\/$/, "");

const CAT_LABELS: Record<string, string> = {
  grant: "Grant",
  fellowship: "Fellowship",
  course: "Course",
  internship: "Internship",
  fractional_job: "Fractional Job",
};

const CAT_ICONS: Record<string, string> = {
  grant: "💰", fellowship: "🎓",
  course: "📚", internship: "💼", fractional_job: "🧩",
};

const COST_BADGES: Record<string, { label: string; cls: string }> = {
  free: { label: "🟢 Free", cls: "bg-emerald-50 text-emerald-700" },
  scholarship_available: { label: "🟡 Scholarship Available", cls: "bg-amber-50 text-amber-700" },
  paid: { label: "🔵 Paid", cls: "bg-sky-50 text-sky-700" },
};

// ─── static params (tells Next.js every valid [id] at build time) ─────────────

export function generateStaticParams() {
  return opportunities.map((opp) => ({ id: opp.id }));
}

// ─── Item 3: generateMetadata ─────────────────────────────────────────────────
// Title pattern: "<Title> | Deadline, Eligibility & <Category> — AI Opportunity Radar"
// Description: hook sentence + eligibility snippet + deadline.
// OG + Twitter cards share the same data.
// Canonical URL points to the /opportunities/ path to avoid duplicate-content
// issues with any lingering /opportunity/ references.

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const opp = getOpportunityById(params.id);
  if (!opp) return { title: "Opportunity not found | AI Opportunity Radar" };

  const rolling = isRollingOpportunity(opp);
  const catLabel = CAT_LABELS[opp.category] ?? opp.category;
  const deadlineText = rolling ? "Rolling deadline" : deadlineDisplay(opp);

  const title = `${opp.title} | Deadline, Eligibility & ${catLabel}`;
  // Keep description ≤160 chars for Google preview
  const description = `${opp.hook} ${rolling ? "Rolling applications." : `Deadline: ${opp.deadline}.`} ${opp.eligibility.slice(0, 100)}${opp.eligibility.length > 100 ? "…" : ""}`;

  const canonicalUrl = `${SITE_URL}/opportunities/${opp.id}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: "AI Opportunity Radar",
      type: "website",
      locale: "en_US",
    },
    twitter: {
      card: "summary",
      title,
      description,
      site: "@mapd_cc",   // update to your real handle
    },
    keywords: [
      opp.title,
      catLabel,
      opp.region,
      ...opp.tags,
      "AI opportunities",
      "AI " + catLabel.toLowerCase(),
      deadlineText,
    ].join(", "),
  };
}

// ─── Item 4: JSON-LD builder ──────────────────────────────────────────────────
// Schema.org EducationalOccupationalProgram is the correct type for fellowships,
// grants, internships, and courses. Google uses this for rich results in search.
// We also add BreadcrumbList so Google shows the navigation path in snippets.

function buildJsonLd(opp: ReturnType<typeof getOpportunityById>) {
  if (!opp) return null;

  const rolling = isRollingOpportunity(opp);
  const canonicalUrl = `${SITE_URL}/opportunities/${opp.id}`;
  const categoryUrl = `${SITE_URL}/category/${opp.category}`;
  const regionUrl = `${SITE_URL}/region/${opp.region.toLowerCase()}`;

  const program = {
    "@context": "https://schema.org",
    "@type": "EducationalOccupationalProgram",
    "name": opp.title,
    "description": opp.description,
    "url": canonicalUrl,
    "applicationDeadline": rolling ? undefined : opp.deadline,
    "offers": {
      "@type": "Offer",
      "category": CAT_LABELS[opp.category] ?? opp.category,
      "eligibleRegion": opp.region,
      "availability": "https://schema.org/InStock",
      "price": opp.costType === "free" ? "0" : undefined,
      "priceCurrency": opp.costType === "free" ? "USD" : undefined,
    },
    "provider": {
      "@type": "Organization",
      "name": "AI Opportunity Radar",
      "url": SITE_URL,
    },
    "educationalProgramMode": opp.isRemote ? "online" : "onsite",
    "inLanguage": "en",
    "keywords": opp.tags.join(", "),
    "dateModified": opp.lastVerified,
  };

  // Remove undefined keys — JSON.stringify drops them but being explicit is cleaner
  Object.keys(program).forEach((k) => {
    if ((program as Record<string, unknown>)[k] === undefined) {
      delete (program as Record<string, unknown>)[k];
    }
  });

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": SITE_URL },
      { "@type": "ListItem", "position": 2, "name": CAT_LABELS[opp.category] ?? opp.category, "item": categoryUrl },
      { "@type": "ListItem", "position": 3, "name": opp.region, "item": regionUrl },
      { "@type": "ListItem", "position": 4, "name": opp.title, "item": canonicalUrl },
    ],
  };

  return [program, breadcrumb];
}

// ─── FAQ: built purely from fields already on the entry — never invents facts ──

interface FaqItem {
  question: string;
  answer: string;
}

function buildFaqItems(opp: Opportunity): FaqItem[] {
  const items: FaqItem[] = [];
  const rolling = isRollingOpportunity(opp);

  items.push({ question: "Who can apply?", answer: opp.eligibility });

  items.push({
    question: "Is this remote?",
    answer:
      opp.isRemote === true
        ? opp.remoteEligibleRegions && opp.remoteEligibleRegions.length > 0
          ? `Yes, remote — open to applicants based in ${opp.remoteEligibleRegions.join(", ")}.`
          : "Yes, this can be done remotely, in whole or in part."
        : opp.isRemote === false
        ? "No, this is not listed as a remote opportunity."
        : "Remote eligibility isn't specified for this listing — check the official source for details.",
  });

  items.push({
    question: "Is there a hard deadline?",
    answer: rolling
      ? "No — this opportunity has a rolling, ongoing application process with no fixed closing date."
      : `Yes — applications close on ${opp.deadline}.`,
  });

  if (opp.costType) {
    items.push({
      question: "Is it free?",
      answer:
        opp.costType === "free"
          ? "Yes, this is free to participate in."
          : opp.costType === "scholarship_available"
          ? "It's paid, but scholarships are available."
          : "This is a paid program.",
    });
  }

  return items;
}

function buildFaqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": items.map((item) => ({
      "@type": "Question",
      "name": item.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.answer,
      },
    })),
  };
}

// ─── Related opportunities: same category or region, active only, max 4 ──────

function getRelatedOpportunities(opp: Opportunity): Opportunity[] {
  const today = new Date().toISOString().slice(0, 10);
  const isActive = (o: Opportunity) => isRollingOpportunity(o) || o.deadline >= today;

  const related = opportunities.filter(
    (o) => o.id !== opp.id && isActive(o) && (o.category === opp.category || o.region === opp.region)
  );

  // Prefer same-category matches first, then same-region.
  related.sort((a, b) => {
    const aScore = (a.category === opp.category ? 2 : 0) + (a.region === opp.region ? 1 : 0);
    const bScore = (b.category === opp.category ? 2 : 0) + (b.region === opp.region ? 1 : 0);
    return bScore - aScore;
  });

  return related.slice(0, 4);
}

// ─── Page component ────────────────────────────────────────────────────────────

export default function OpportunityPage({ params }: { params: { id: string } }) {
  const opp = getOpportunityById(params.id);
  if (!opp) notFound();

  const days = daysUntilDeadline(opp, new Date());
  const rolling = isRollingOpportunity(opp);
  const googleCalendarUrl = makeGoogleCalendarUrl(opp);
  const costBadge = opp.costType ? COST_BADGES[opp.costType] : null;
  const jsonLd = buildJsonLd(opp);
  const faqItems = buildFaqItems(opp);
  const faqJsonLd = buildFaqJsonLd(faqItems);
  const related = getRelatedOpportunities(opp);

  return (
    <>
      {/* Item 4: JSON-LD structured data — injected in <head> via Next.js script tag */}
      {jsonLd && jsonLd.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <div className="max-w-2xl mx-auto py-4">
        {/* Item 5: Breadcrumb navigation */}
        <nav aria-label="Breadcrumb" className="mb-4">
          <ol className="flex items-center gap-1.5 text-xs text-gray-400 flex-wrap">
            <li><Link href="/" className="hover:text-gray-600">Home</Link></li>
            <li aria-hidden="true">›</li>
            <li>
              <Link href={`/category/${opp.category}`} className="hover:text-gray-600 capitalize">
                {CAT_LABELS[opp.category] ?? opp.category}
              </Link>
            </li>
            <li aria-hidden="true">›</li>
            <li>
              <Link href={`/region/${opp.region.toLowerCase()}`} className="hover:text-gray-600">
                {opp.region}
              </Link>
            </li>
            <li aria-hidden="true">›</li>
            <li className="text-gray-600 truncate max-w-[200px]" aria-current="page">
              {opp.title}
            </li>
          </ol>
        </nav>

        <div className="card p-6 mb-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-base">{CAT_ICONS[opp.category]}</span>
            <span className="badge bg-gray-100 text-gray-600">{opp.category.replace("_", " ")}</span>
            <span className="badge bg-gray-100 text-gray-600">{opp.region}</span>
            {opp.newThisWeek && <span className="badge bg-indigo-50 text-indigo-600">New</span>}
            {rolling && <span className="badge bg-slate-50 text-slate-700 border border-slate-200">Rolling</span>}
            {costBadge && <span className={`badge ${costBadge.cls}`}>{costBadge.label}</span>}
          </div>

          {/* H1 — must be the opportunity title for on-page SEO */}
          <h1 className="text-xl font-semibold text-gray-900 mb-4">{opp.title}</h1>

          {/* Answer-ready facts block — plain server-rendered dl, no client JS,
              so AI engines and snippet extractors can lift it directly. */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs border border-slate-100 rounded-lg p-3 mb-4 bg-slate-50/60">
            <div>
              <dt className="text-slate-400">Deadline</dt>
              <dd className="text-slate-800 font-medium">{rolling ? "Rolling" : opp.deadline}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Deadline type</dt>
              <dd className="text-slate-800 font-medium capitalize">{rolling ? "Rolling" : "Fixed"}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Region</dt>
              <dd className="text-slate-800 font-medium">{opp.region}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Category</dt>
              <dd className="text-slate-800 font-medium capitalize">{CAT_LABELS[opp.category] ?? opp.category}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-400">Eligibility</dt>
              <dd className="text-slate-800">{opp.eligibility}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Remote</dt>
              <dd className="text-slate-800 font-medium">
                {opp.isRemote === true ? "Yes" : opp.isRemote === false ? "No" : "Not specified"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Last verified</dt>
              <dd className="text-slate-800 font-medium">Verified on {opp.lastVerified}</dd>
            </div>
          </dl>

          <div className="bg-indigo-50 rounded-lg p-3 mb-4 border border-indigo-100">
            <p className="text-sm text-indigo-800 font-medium">💡 {opp.hook}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
            <div>
              <span className="label">Deadline</span>
              <span className={`font-medium ${days !== null && days <= 7 ? "text-red-600" : days !== null && days <= 30 ? "text-amber-600" : "text-gray-800"}`}>
                {deadlineDisplay(opp)}
              </span>
              {rolling && (
                <p className="text-xs text-gray-500 mt-1">
                  No fixed closing date published. We show this as rolling and exclude it from countdown reminders.
                </p>
              )}
            </div>
            <div>
              <span className="label">Effort</span>
              <span className="font-medium text-gray-800 capitalize">{opp.effortLevel}</span>
            </div>
            <div className="col-span-2">
              <span className="label">Eligibility summary</span>
              <span className="text-gray-700">{opp.eligibility}</span>
            </div>
            <div>
              {/* Item 3.15 — Freshness signal */}
              <span className="label">Last verified</span>
              <span className="text-emerald-600 font-mono text-xs">{opp.lastVerified}</span>
            </div>
            <div>
              <span className="label">Category</span>
              <span className="text-gray-800 capitalize text-sm">
                {CAT_LABELS[opp.category] ?? opp.category}
              </span>
            </div>
            <div>
              <span className="label">Region</span>
              <span className="text-gray-800 text-sm">
                {opp.region}
              </span>
            </div>
          </div>

          <div className="mb-4">
            <span className="label">Description</span>
            <p className="text-sm text-gray-700 leading-relaxed">{opp.description}</p>
          </div>

          {opp.tags.length > 0 && (
            <div className="mb-4">
              <span className="label">Tags</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {opp.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-gray-100">
            <div className="flex flex-wrap gap-2">
              <a href={opp.source} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="btn-primary text-sm">
                Apply / Official source ↗
              </a>
              {!rolling && googleCalendarUrl && (
                <>
                  <a href={`/api/calendar/${opp.id}`} className="btn-secondary text-sm">Download .ics</a>
                  <a href={googleCalendarUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="btn-secondary text-sm">
                    Add to Google Calendar
                  </a>
                </>
              )}
            </div>
          </div>
        </div>

        {!rolling && days !== null && days >= 0 && (
          <div className="mb-4">
            <FollowButton opportunityId={opp.id} />
          </div>
        )}

        {/* FAQ — plain visible HTML, built only from fields already on this
            entry; mirrored in FAQPage JSON-LD above. */}
        <div className="card p-6 mb-4">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Frequently asked questions</h2>
          <dl className="space-y-3">
            {faqItems.map((item) => (
              <div key={item.question}>
                <dt className="text-sm font-medium text-slate-800">{item.question}</dt>
                <dd className="text-sm text-slate-600 mt-0.5">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </div>

        {related.length > 0 && (
          <div className="card p-6 mb-4">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Related opportunities</h2>
            <ul className="space-y-2">
              {related.map((r) => (
                <li key={r.id}>
                  <Link href={`/opportunities/${r.id}`} className="text-sm text-indigo-600 hover:underline">
                    {r.title}
                  </Link>
                  <span className="text-xs text-slate-400 ml-2 capitalize">
                    {CAT_LABELS[r.category] ?? r.category} · {r.region}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <EligibilityChecker opportunity={opp} />
      </div>
    </>
  );
}
