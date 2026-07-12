// src/components/ui/NavBar.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { FEATURE_FLAGS } from "@/lib/featureFlags";

const ACCOUNT_NAV = [
  { href: "/discover", label: "Discover" },
  { href: "/saved", label: "Saved" },
  { href: "/tracking", label: "Tracking" },
  { href: "/settings", label: "Settings" },
];

// Plain <a>-equivalent (next/link renders a real <a> in the server-rendered
// HTML regardless of this file's "use client" directive) links to the
// category/region landing pages + about. Kept separate from CATEGORY_NAV
// above, which drives the homepage's client-side `?category=` filter.
const CATEGORY_LINKS = [
  { href: "/category/grant", label: "Grants" },
  { href: "/category/fellowship", label: "Fellowships" },
  { href: "/category/course", label: "Courses" },
  { href: "/category/internship", label: "Internships" },
  { href: "/category/fractional_job", label: "Fractional Jobs" },
];

export function NavBar({ user }: { user: { name?: string | null; email?: string | null } | null }) {
  const path = usePathname();

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-sky-500 flex items-center justify-center shrink-0 shadow-sm shadow-indigo-500/30">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </span>
          <span className="text-[15px] font-semibold text-slate-950 tracking-tight">
            AI Opportunity Radar
          </span>
        </Link>

        {/* Category/about links — real anchor tags, no JS needed to discover
            them. Region links live in the footer + sitemap, not repeated here. */}
        <div className="hidden md:flex items-center gap-x-4 overflow-x-auto text-xs text-slate-500 ml-auto">
          <span className="text-slate-400 shrink-0">Categories:</span>
          {CATEGORY_LINKS.map((c) => (
            <Link key={c.href} href={c.href} className="hover:text-indigo-600 whitespace-nowrap">
              {c.label}
            </Link>
          ))}
          <span className="text-slate-300 shrink-0">|</span>
          <Link href="/about" className="hover:text-indigo-600 whitespace-nowrap">
            About
          </Link>
        </div>

        {/* Authenticated nav — only shown if a session exists AND the feature flag is on.
            Kept in code for when accounts are re-enabled; public mode shows nothing here. */}
        {FEATURE_FLAGS.showSignIn && user && (
          <div className="flex items-center gap-1 shrink-0">
            {ACCOUNT_NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
                  path.startsWith(n.href)
                    ? "bg-indigo-50 text-indigo-700 font-medium"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                {n.label}
              </Link>
            ))}
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="ml-2 text-xs text-gray-400 hover:text-gray-600"
            >
              Sign out
            </button>
          </div>
        )}
      </div>

      {/* Mobile-only category row — the top row's link list is hidden below
          md, so it's repeated here in a scrollable strip for small screens. */}
      <div className="md:hidden max-w-6xl mx-auto px-4 pb-2 flex items-center gap-x-4 gap-y-1 overflow-x-auto text-xs text-slate-500 border-t border-slate-100/80 pt-2">
        <span className="text-slate-400 shrink-0">Categories:</span>
        {CATEGORY_LINKS.map((c) => (
          <Link key={c.href} href={c.href} className="hover:text-indigo-600 whitespace-nowrap">
            {c.label}
          </Link>
        ))}
        <span className="text-slate-300 shrink-0">|</span>
        <Link href="/about" className="hover:text-indigo-600 whitespace-nowrap">
          About
        </Link>
      </div>
    </nav>
  );
}

