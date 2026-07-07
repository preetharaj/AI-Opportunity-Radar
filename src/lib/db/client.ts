// src/lib/db/client.ts
// Single Turso client — server-only, never imported in client components.
// Lazily initialised so `next build` can compile routes without live secrets.
import { createClient, type Client } from "@libsql/client";

let cached: Client | null = null;

function getDbClient(): Client {
  if (cached) return cached;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set before using database queries.");
  }

  cached = createClient({ url, authToken });
  return cached;
}

export const db = new Proxy({} as Client, {
  get(_target, prop, receiver) {
    const client = getDbClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
