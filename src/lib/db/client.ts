// src/lib/db/client.ts
// Single Turso client — server-only, never imported in client components
import { createClient } from "@libsql/client";

if (!process.env.TURSO_DATABASE_URL) throw new Error("TURSO_DATABASE_URL missing");
if (!process.env.TURSO_AUTH_TOKEN) throw new Error("TURSO_AUTH_TOKEN missing");

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
