// src/components/ui/NavBar.tsx
"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { FEATURE_FLAGS } from "@/lib/featureFlags";

const ACCOUNT_NAV = [
  { href: "/discover", label: "Discover" },
  { href: "/saved", label: "Saved" },
  { href: "/tracking", label: "Tracking" },
  { href: "/settings", label: "Settings" },
];

const CATEGORY_NAV = [
  { value: "All", label: "Opportunities" },
  { value: "grant", label: "Grants" },
  { value: "fellowship", label: "Fellowships" },
  { value: "startup", label: "Startups" },
  { value: "course", label: "Courses" },
  { value: "internship", label: "Internships" },
];

export function NavBar({ user }: { user: { name?: string | null; email?: string | null } | null }) {
  const path = usePathname();
  const params = useSearchParams();
  const activeCategory = params.get("category") ?? "All";

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

        {path === "/" && (
          <div className="hidden md:flex items-center gap-0.5 overflow-x-auto">
            {CATEGORY_NAV.map((c) => (
              <Link
                key={c.value}
                href={c.value === "All" ? "/" : `/?category=${c.value}`}
                className={`text-[13px] px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                  activeCategory === c.value
                    ? "bg-indigo-50 text-indigo-700 font-medium shadow-sm"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                {c.label}
              </Link>
            ))}
          </div>
        )}

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
    </nav>
  );
}

