// src/app/settings/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { getProfile } from "@/lib/db/queries";
import { ProfileForm } from "@/components/profile/ProfileForm";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const profile = await getProfile(session.user.id);
  if (!profile) redirect("/onboarding");

  return (
    <div className="max-w-lg mx-auto py-4">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Settings</h1>
      <p className="text-sm text-gray-500 mb-2">{session.user.email}</p>
      <hr className="mb-6 border-gray-100" />
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Profile &amp; email preferences</h2>
      <ProfileForm initial={profile} />
    </div>
  );
}
