// src/app/auth/signin/page.tsx
"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) { setError("Enter a valid email."); return; }
    setLoading(true); setError("");
    const res = await signIn("resend", { email, redirect: false, callbackUrl: "/discover" });
    setLoading(false);
    if (res?.error) { setError("Failed to send. Try again."); return; }
    setSent(true);
  }

  return (
    <div className="max-w-sm mx-auto py-16">
      <div className="card p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">AI Opportunity Radar</h1>
        <p className="text-sm text-gray-500 mb-6">
          Find grants, fellowships, and programs matched to your profile.
        </p>

        {sent ? (
          <div className="text-sm text-emerald-600 bg-emerald-50 rounded-lg p-4">
            ✓ Magic link sent to <strong>{email}</strong>.<br />
            Check your inbox to sign in.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="input text-center"
              required
              autoFocus
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
              {loading ? "Sending…" : "Send magic link"}
            </button>
            <p className="text-xs text-gray-400">No password. No spam. Free.</p>
          </form>
        )}
      </div>
    </div>
  );
}
