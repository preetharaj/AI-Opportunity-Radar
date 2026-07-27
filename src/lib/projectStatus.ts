// src/lib/projectStatus.ts
//
// Single on/off switch for the "actively maintained" state of the whole
// site. Flip `active` back to `true` (and clear/update `frozenSince`) to
// resume — everything that reads this (the banner, the /about page copy)
// updates from this one place, so there's no risk of the banner saying
// one thing and /about saying another.

export const PROJECT_STATUS = {
  /** false = show the freeze banner + frozen copy on /about. */
  active: false,
  /** Date the project stopped being actively curated (ISO, YYYY-MM-DD). */
  frozenSince: "2026-07-28",
  /** Shown in the site-wide banner when active is false. Keep short —
   * this is a one-line disclosure, not the full explanation (that lives
   * on /about). */
  bannerMessage:
    "This project is no longer being actively updated. Listings below are accurate as of their last-verified date, but no new opportunities are being added.",
} as const;
