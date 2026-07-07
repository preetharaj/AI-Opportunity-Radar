"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export function ReminderUnsubscribeForm() {
  const params = useSearchParams();
  const emailFromUrl = params.get("email") ?? "";
  const opportunityIdFromUrl = params.get("opportunityId") ?? "";
  const [email, setEmail] = useState(emailFromUrl);
  const [opportunityId, setOpportunityId] = useState(opportunityIdFromUrl);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setEmail(emailFromUrl);
    setOpportunityId(opportunityIdFromUrl);
  }, [emailFromUrl, opportunityIdFromUrl]);

  async function handleUnfollow(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/reminders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, opportunityId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Could not stop this reminder. Please try again.");
        return;
      }
      setStatus("done");
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  if (status === "done") {
    return (
      <p className="text-sm text-emerald-600 bg-emerald-50 rounded-lg p-4">
        Done. You will no longer receive reminders for this specific opportunity.
      </p>
    );
  }

  return (
    <form onSubmit={handleUnfollow} className="space-y-3">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        className="input text-center"
        required
        maxLength={200}
        autoComplete="email"
      />
      <input
        type="text"
        value={opportunityId}
        onChange={(e) => setOpportunityId(e.target.value)}
        placeholder="opportunity-id"
        className="input text-center"
        required
        maxLength={120}
        pattern="[a-z0-9-]+"
      />
      {status === "error" && <p className="text-xs text-red-600">{message || "Something went wrong. Try again."}</p>}
      <button type="submit" disabled={status === "loading"} className="btn-secondary w-full justify-center">
        {status === "loading" ? "Saving…" : "Stop this reminder"}
      </button>
    </form>
  );
}
