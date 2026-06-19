// src/lib/auth/config.ts
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { db } from "@/lib/db/client";

// Custom Turso adapter — keeps secrets server-side, no Supabase/Prisma needed
const tursoAdapter = {
  async createUser(user: { email: string; emailVerified: Date | null }) {
    const id = crypto.randomUUID();
    await db.execute({
      sql: "INSERT INTO users (id, email) VALUES (?, ?)",
      args: [id, user.email],
    });
    return { id, email: user.email, emailVerified: user.emailVerified };
  },

  async getUser(id: string) {
    const row = await db.execute({
      sql: "SELECT * FROM users WHERE id = ?",
      args: [id],
    });
    if (!row.rows[0]) return null;
    return { id: row.rows[0].id as string, email: row.rows[0].email as string, emailVerified: null };
  },

  async getUserByEmail(email: string) {
    const row = await db.execute({
      sql: "SELECT * FROM users WHERE email = ?",
      args: [email],
    });
    if (!row.rows[0]) return null;
    return { id: row.rows[0].id as string, email: row.rows[0].email as string, emailVerified: null };
  },

  async getUserByAccount({ providerAccountId }: { providerAccountId: string }) {
    // Magic-link: providerAccountId is the email
    return tursoAdapter.getUserByEmail(providerAccountId);
  },

  async updateUser(user: { id: string; email?: string; emailVerified?: Date | null }) {
    return user; // Magic-link users don't need field updates
  },

  async linkAccount() {
    return; // Not needed for email-only auth
  },

  async createSession(session: { sessionToken: string; userId: string; expires: Date }) {
    await db.execute({
      sql: "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
      args: [session.sessionToken, session.userId, Math.floor(session.expires.getTime() / 1000)],
    });
    return session;
  },

  async getSessionAndUser(sessionToken: string) {
    const now = Math.floor(Date.now() / 1000);
    const row = await db.execute({
      sql: `SELECT s.id, s.user_id, s.expires_at, u.email
            FROM sessions s JOIN users u ON s.user_id = u.id
            WHERE s.id = ? AND s.expires_at > ?`,
      args: [sessionToken, now],
    });
    if (!row.rows[0]) return null;
    const r = row.rows[0];
    return {
      session: { sessionToken: r.id as string, userId: r.user_id as string, expires: new Date((r.expires_at as number) * 1000) },
      user: { id: r.user_id as string, email: r.email as string, emailVerified: null },
    };
  },

  async updateSession(session: { sessionToken: string; expires?: Date }) {
    if (session.expires) {
      await db.execute({
        sql: "UPDATE sessions SET expires_at = ? WHERE id = ?",
        args: [Math.floor(session.expires.getTime() / 1000), session.sessionToken],
      });
    }
    return session;
  },

  async deleteSession(sessionToken: string) {
    await db.execute({ sql: "DELETE FROM sessions WHERE id = ?", args: [sessionToken] });
  },

  async createVerificationToken(token: { identifier: string; token: string; expires: Date }) {
    await db.execute({
      sql: "INSERT OR REPLACE INTO verification_tokens (identifier, token, expires) VALUES (?, ?, ?)",
      args: [token.identifier, token.token, Math.floor(token.expires.getTime() / 1000)],
    });
    return token;
  },

  async useVerificationToken({ identifier, token }: { identifier: string; token: string }) {
    const row = await db.execute({
      sql: "SELECT * FROM verification_tokens WHERE identifier = ? AND token = ?",
      args: [identifier, token],
    });
    if (!row.rows[0]) return null;
    await db.execute({
      sql: "DELETE FROM verification_tokens WHERE identifier = ? AND token = ?",
      args: [identifier, token],
    });
    const r = row.rows[0];
    return { identifier: r.identifier as string, token: r.token as string, expires: new Date((r.expires as number) * 1000) };
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: tursoAdapter as any,
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM,
      async sendVerificationRequest({ identifier: email, url }) {
        const { Resend: ResendClient } = await import("resend");
        const resend = new ResendClient(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.EMAIL_FROM!,
          to: email,
          subject: "Sign in to AI Opportunity Radar",
          html: `
            <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:32px 24px;text-align:center;">
              <h2 style="margin:0 0 8px;color:#111;">AI Opportunity Radar</h2>
              <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">Click below to sign in.</p>
              <a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;
                 padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;">Sign in</a>
              <p style="color:#9ca3af;font-size:12px;margin-top:24px;">
                If you didn't request this, you can safely ignore it. Link expires in 24 hours.
              </p>
            </div>
          `,
        });
      },
    }),
  ],
  session: { strategy: "database" },
  pages: {
    signIn: "/auth/signin",
    verifyRequest: "/auth/verify",
    error: "/auth/error",
  },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
