// src/components/ui/SiteFooter.tsx
// Plain server-rendered footer — no client JS required. Gives crawlers a
// second, always-present path to every category, region, and the about page.
import Link from "next/link";

const CATEGORIES = [
  { slug: "grant", label: "Grants" },
  { slug: "fellowship", label: "Fellowships" },
  { slug: "course", label: "Courses" },
  { slug: "internship", label: "Internships" },
  { slug: "fractional_job", label: "Fractional Jobs" },
];

const REGIONS = [
  { slug: "global", label: "Global" },
  { slug: "india", label: "India" },
  { slug: "sea", label: "Southeast Asia" },
  { slug: "europe", label: "Europe" },
  { slug: "usa", label: "USA" },
  { slug: "australia", label: "Australia" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200/70 bg-white/60 mt-16">
      <div className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8 text-sm">
        <div>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Categories</h2>
          <ul className="space-y-2">
            {CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link href={`/category/${c.slug}`} className="text-slate-600 hover:text-indigo-600">
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Regions</h2>
          <ul className="space-y-2">
            {REGIONS.map((r) => (
              <li key={r.slug}>
                <Link href={`/region/${r.slug}`} className="text-slate-600 hover:text-indigo-600">
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">About</h2>
          <ul className="space-y-2">
            <li>
              <Link href="/about" className="text-slate-600 hover:text-indigo-600">
                Methodology &amp; verification
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Subscribe</h2>
          <ul className="space-y-2">
            <li>
              <Link href="/#subscribe" className="text-slate-600 hover:text-indigo-600">
                Biweekly digest
              </Link>
            </li>
            <li>
              <Link href="/unsubscribe" className="text-slate-600 hover:text-indigo-600">
                Unsubscribe
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-4 pb-8 text-xs text-slate-400">
        © {new Date().getFullYear()} AI Opportunity Radar. Every opportunity links to its official source.
      </div>
    </footer>
  );
}
