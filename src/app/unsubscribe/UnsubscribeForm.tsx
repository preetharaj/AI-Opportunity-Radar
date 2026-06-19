// src/app/unsubscribe/UnsubscribeForm.tsx
"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function UnsubscribeForm() {
  const params = useSearchParams();
  const emailFromUrl = params.get("email") ?? "";
  const [email, setEmail] = useState(emailFromUrl);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  useEffect(() => {
    setEmail(emailFromUrl);
  }, [emailFromUrl]);

  async function handleUnsubscribe(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <p className="text-sm text-emerald-600 bg-emerald-50 rounded-lg p-4">
        You've been unsubscribed. You won't receive any more digest or deadline reminder emails.
      </p>
    );
  }

  return (
    <form onSubmit={handleUnsubscribe} className="space-y-3">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        className="input text-center"
        required
      />
      {status === "error" && (
        <p className="text-xs text-red-600">Something went wrong. Try again.</p>
      )}
      <button type="submit" disabled={status === "loading"} className="btn-secondary w-full justify-center">
        {status === "loading" ? "Unsubscribing…" : "Unsubscribe"}
      </button>
    </form>
  );
}
