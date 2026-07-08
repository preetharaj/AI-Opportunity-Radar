// src/components/opportunity/FilterBar.tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const REGIONS = ["All", "Global", "India", "SEA", "Europe", "USA", "Australia"];
const CATEGORIES = ["All", "grant", "fellowship", "course", "internship", "fractional_job"];
const CATEGORY_LABELS: Record<string, string> = {
  All: "All categories",
  grant: "Grants",
  fellowship: "Fellowships",
  course: "Courses",
  internship: "Internships",
  fractional_job: "Fractional jobs",
};
const SORT = [
  { value: "deadline", label: "Deadline" },
  { value: "newest", label: "Newest" },
];

export function FilterBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [searchValue, setSearchValue] = useState(params.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value === "All" || value === "deadline" || value === "") next.delete(key);
      else next.set(key, value);
      router.replace(`/?${next.toString()}`, { scroll: false });
    },
    [params, router]
  );

  function handleSearchChange(value: string) {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => update("q", value), 350);
  }

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const get = (key: string, def = "All") => params.get(key) ?? def;

  return (
    <div className="flex flex-wrap gap-2 items-center rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm shadow-slate-200/60">
      {/* Search */}
      <input
        type="search"
        placeholder="Search opportunities…"
        value={searchValue}
        onChange={(e) => handleSearchChange(e.target.value)}
        className="input w-full sm:w-56 text-xs"
      />

      {/* Region */}
      <select
        value={get("region")}
        onChange={(e) => update("region", e.target.value)}
        className="input w-auto text-xs"
      >
        {REGIONS.map((r) => <option key={r}>{r}</option>)}
      </select>

      {/* Category */}
      <select
        value={get("category")}
        onChange={(e) => update("category", e.target.value)}
        className="input w-auto text-xs"
      >
        {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
      </select>

      {/* Sort */}
      <select
        value={get("sort", "deadline")}
        onChange={(e) => update("sort", e.target.value)}
        className="input w-auto text-xs sm:ml-auto"
      >
        {SORT.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </div>
  );
}
