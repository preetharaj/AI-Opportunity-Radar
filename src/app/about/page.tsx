// src/app/about/page.tsx
// Trust & methodology page — explains curation policy, deadline handling,
// and the subscription model. Server-rendered, no client JS required.
import type { Metadata } from "next";
import Link from "next/link";
import { PROJECT_STATUS } from "@/lib/projectStatus";

const SITE_URL = (process.env.NEXTAUTH_URL ?? process.env.SITE_URL ?? "https://mapd.cc").replace(/\/$/, "");
const canonicalUrl = `${SITE_URL}/about`;

export const metadata: Metadata = {
  title: "About & Methodology",
  description:
    "How AI Opportunity Radar curates, verifies, and retires listings — no evergreen brands, a deterministic relevance filter, human review, and visible last-verified dates on every entry.",
  alternates: { canonical: canonicalUrl },
  openGraph: {
    title: "About & Methodology | AI Opportunity Radar",
    description:
      "How AI Opportunity Radar curates, verifies, and retires listings.",
    url: canonicalUrl,
    siteName: "AI Opportunity Radar",
    type: "website",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: "About & Methodology",
  url: canonicalUrl,
  isPartOf: { "@type": "WebSite", name: "AI Opportunity Radar", url: SITE_URL },
};

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
        <ol className="flex items-center gap-1.5">
          <li><Link href="/" className="hover:text-slate-600">Home</Link></li>
          <li aria-hidden="true">›</li>
          <li className="text-slate-600" aria-current="page">About</li>
        </ol>
      </nav>

      <div>
        <h1 className="text-3xl sm:text-4xl font-semibold text-slate-950 tracking-tight">About &amp; Methodology</h1>
        <p className="mt-4 text-slate-600 leading-7">
          {PROJECT_STATUS.active ? (
            <>
              AI Opportunity Radar curates AI grants, fellowships, internships, courses, and fractional jobs.
              This page explains how listings get in, how they're kept accurate, and how the free
              subscription works.
            </>
          ) : (
            <>
              AI Opportunity Radar curated AI grants, fellowships, internships, courses, and fractional jobs.
              This page explains how listings were sourced and verified while the project was active, and
              why it's since been paused.
            </>
          )}
        </p>
      </div>

      {!PROJECT_STATUS.active && (
        <section className="card p-6 border-amber-200 bg-amber-50">
          <h2 className="text-lg font-semibold text-amber-900 mb-2">This project is paused</h2>
          <p className="text-sm text-amber-900/90 leading-6">
            As of {PROJECT_STATUS.frozenSince}, this project is no longer being actively curated — no new
            opportunities are being added, and the automated discovery pipeline described below is turned
            off. The listings already on the site remain visible and are accurate as of each entry's
            last-verified date; nothing has been deleted or left to silently go stale. The site is kept
            live as a working demonstration of the project rather than taken down.
          </p>
        </section>
      )}

      <section className="card p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Curation policy</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-slate-700 leading-6">
          <li>
            We deliberately exclude evergreen brand-name programs that are already covered everywhere else,
            in favor of listings that are genuinely harder to discover.
          </li>
          <li>
            Every candidate listing runs through a deterministic relevance filter before it's ever shown to
            a human reviewer or a language model — aggregator domains and listicle-style sources are
            dropped automatically, and primary sources (official program pages, .gov, .edu) are weighted up.
          </li>
          <li>
            A human reviews every entry before it's merged into the public catalog — nothing is
            auto-published straight from a crawler.
          </li>
          <li>
            Listings are periodically re-checked against their official source. The date of the most recent
            check is stored as <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">lastVerified</code> and
            shown on the entry's own page as "Verified on {"{date}"}".
          </li>
        </ul>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Deadline integrity</h2>
        <p className="text-sm text-slate-700 leading-6">
          Opportunities are either <strong>rolling</strong> (no fixed closing date — shown with a "Rolling"
          badge and excluded from countdown reminders) or <strong>fixed-deadline</strong> (shown as a
          countdown, e.g. "12 days left"). We never invent a deadline for a rolling opportunity, and
          fixed-deadline entries are automatically removed from public listings once they close, so search
          engines and readers are never sent to an expired application page.
        </p>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Subscription model</h2>
        <p className="text-sm text-slate-700 leading-6">
          The email digest is free and requires no account. Subscribers receive a biweekly digest of newly
          added opportunities and a weekly roundup of listings closing soon. You can also follow a single
          opportunity for deadline-specific reminders without subscribing to the full digest.
          Unsubscribing is a one-click link included in every email, or available anytime at{" "}
          <Link href="/unsubscribe" className="underline hover:text-indigo-600">/unsubscribe</Link>.
        </p>
      </section>
    </div>
  );
}
