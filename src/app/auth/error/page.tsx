// src/app/auth/error/page.tsx
import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="max-w-sm mx-auto py-16 text-center">
      <div className="card p-8">
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Sign-in error</h1>
        <p className="text-sm text-gray-500 mb-4">
          The sign-in link may have expired. Please try again.
        </p>
        <Link href="/auth/signin" className="btn-primary">Try again</Link>
      </div>
    </div>
  );
}
