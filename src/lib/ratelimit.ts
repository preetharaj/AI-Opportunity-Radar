// src/lib/ratelimit.ts
// Simple in-memory rate limiter for serverless (per-invocation)
// For production scale, swap for Upstash Redis (optional paid upgrade)

const store = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.reset) {
    store.set(key, { count: 1, reset: now + windowMs });
    return true; // allowed
  }

  if (entry.count >= limit) return false; // blocked

  entry.count++;
  return true; // allowed
}

// Clean up old entries periodically (prevents memory leak in long-running dev)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store) {
    if (now > val.reset) store.delete(key);
  }
}, 60_000);
