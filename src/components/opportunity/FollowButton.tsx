"use client";

import { useState } from "react";

type Status = "idle" | "loading" | "success" | "already" | "error";

export function FollowButton({ opportunityId }: { opportunityId: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, opportunityId }),
      });
      const data = (await res.json().catch(() => ({}))) as { alreadyFollowing?: boolean; error?: string };

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Could not save reminder. Please try again.");
        return;
      }

      setStatus(data.alreadyFollowing ? "already" : "success");
      setMessage(
        data.alreadyFollowing
          ? "You're already set to receive reminders for this opportunity."
          : "Done — we'll remind you at 7, 3, 1, and deadline day for this opportunity only."
      );
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-indigo-950">Remind me about this opportunity</h2>
        <p className="text-xs text-indigo-800 mt-1">
          No account needed. Enter your email and we'll send reminders only for this opportunity.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="input flex-1"
          required
          maxLength={200}
          autoComplete="email"
        />
        <button type="submit" disabled={status === "loading"} className="btn-primary justify-center">
          {status === "loading" ? "Saving…" : "Remind me"}
        </button>
      </div>
      {message && (
        <p className={`text-xs ${status === "error" ? "text-red-600" : "text-emerald-700"}`} role="status">
          {message}
        </p>
      )}
    </form>
  );
}
