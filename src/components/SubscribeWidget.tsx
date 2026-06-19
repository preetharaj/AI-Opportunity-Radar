// src/components/SubscribeWidget.tsx
"use client";
import { useState } from "react";

interface Props {
  variant?: "card" | "inline";
}

export function SubscribeWidget({ variant = "card" }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "already" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        setStatus("error");
        return;
      }
      const nextStatus = data.alreadySubscribed ? "already" : "done";
      setStatus(nextStatus);

      window.umami?.track(data.alreadySubscribed ? "newsletter_already_subscribed" : "newsletter_subscribed", {
        source: variant,
      });
    } catch {
      setError("Network error. Try again.");
      setStatus("error");
    }
  }

  const wrapperClass = variant === "card" ? "card p-6 max-w-md bg-white/90 backdrop-blur" : "max-w-md";

  if (status === "done" || status === "already") {
    return (
      <div className={wrapperClass}>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center gap-2">
          <span className="text-emerald-600 text-lg">✓</span>
          <p className="text-sm text-emerald-700 font-medium">
            {status === "already" ? "You're already subscribed." : "You're subscribed."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-base ring-1 ring-indigo-100">📬</span>
        <p className="text-sm font-semibold text-slate-950">Biweekly opportunity digest</p>
      </div>
      <p className="text-xs text-slate-500 mb-4 leading-5">
        Get new grants, fellowships, programs, and deadline reminders in your inbox. No account needed.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          className="input flex-1"
        />
        <button type="submit" disabled={status === "loading"} className="btn-primary whitespace-nowrap">
          {status === "loading" ? "…" : "Subscribe"}
        </button>
      </form>
      {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
      <p className="text-xs text-slate-400 mt-2">Free. Biweekly digest + deadline reminders. Unsubscribe anytime.</p>
    </div>
  );
}
