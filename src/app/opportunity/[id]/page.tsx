// src/app/opportunity/[id]/page.tsx
// Legacy URL — redirects to the canonical /opportunities/[id] path.
// Keeps old links, bookmarks, and any existing indexed URLs working.
import { redirect } from "next/navigation";

export default function LegacyOpportunityRedirect({ params }: { params: { id: string } }) {
  redirect(`/opportunities/${params.id}`);
}
