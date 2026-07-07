// src/app/onboarding/page.tsx
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { getProfile } from "@/lib/db/queries";
import { ProfileForm } from "@/components/profile/ProfileForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";


export default async function OnboardingPage() {
  if (!FEATURE_FLAGS.showSignIn) notFound();

  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const profile = await getProfile(session.user.id);
  if (profile) redirect("/discover"); // already set up

  return (
    <div className="max-w-lg mx-auto py-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Set up your profile</h1>
      <p className="text-sm text-gray-500 mb-6">
        We use this to rank opportunities by how well they fit you.
      </p>
      <ProfileForm isOnboarding />
    </div>
  );
}
