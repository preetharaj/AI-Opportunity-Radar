// src/components/ui/FreezeBanner.tsx
// Server component — pure conditional render off PROJECT_STATUS, no client
// JS needed. Shown on every page (mounted once in layout.tsx) whenever
// PROJECT_STATUS.active is false.
import Link from "next/link";
import { PROJECT_STATUS } from "@/lib/projectStatus";

export function FreezeBanner() {
  if (PROJECT_STATUS.active) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200/70 text-amber-900">
      <div className="max-w-6xl mx-auto px-4 py-2 text-xs sm:text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
        <span aria-hidden="true">⏸️</span>
        <span>{PROJECT_STATUS.bannerMessage}</span>
        <Link href="/about" className="underline hover:text-amber-950 font-medium whitespace-nowrap">
          Read more →
        </Link>
      </div>
    </div>
  );
}
