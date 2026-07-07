// scripts/db-init.js
// Run once: node scripts/db-init.js
// Creates all tables in Turso SQLite
require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@libsql/client");

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires INTEGER NOT NULL,
  PRIMARY KEY (identifier, token)
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('undergrad','postgrad','early_career','other')),
  region TEXT NOT NULL,
  interests TEXT NOT NULL DEFAULT '[]',
  focus_areas TEXT NOT NULL DEFAULT '',
  email_mode TEXT NOT NULL DEFAULT 'digest' CHECK(email_mode IN ('digest','per_event')),
  email_reminders TEXT NOT NULL DEFAULT '[7,3,1]',
  email_new_matches INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS saved_opportunities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'saved'
    CHECK(status IN ('saved','researching','applied','interview','rejected','accepted')),
  notes TEXT NOT NULL DEFAULT '',
  saved_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, opportunity_id)
);

CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','unsubscribed')),
  email_deadline_reminders_enabled INTEGER NOT NULL DEFAULT 1,
  email_deadline_reminders TEXT NOT NULL DEFAULT '[14,7,3,1]',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  unsubscribed_at INTEGER
);

CREATE TABLE IF NOT EXISTS notification_log (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  opportunity_id TEXT NOT NULL,
  days_left INTEGER NOT NULL,
  sent_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(email, notification_type, opportunity_id, days_left)
);

CREATE TABLE IF NOT EXISTS email_follows (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  opportunity_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','unsubscribed')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  unsubscribed_at INTEGER,
  UNIQUE(email, opportunity_id)
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  send_key TEXT NOT NULL UNIQUE,
  opportunity_id TEXT,
  deadline_date TEXT,
  days_left INTEGER,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','sent','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  sent_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_opportunities(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);
CREATE INDEX IF NOT EXISTS idx_subscribers_status_email ON subscribers(status, email);
CREATE INDEX IF NOT EXISTS idx_notification_log_email ON notification_log(email);
CREATE INDEX IF NOT EXISTS idx_email_follows_opportunity ON email_follows(opportunity_id, status);
CREATE INDEX IF NOT EXISTS idx_email_follows_due_page ON email_follows(status, opportunity_id, email);
CREATE INDEX IF NOT EXISTS idx_email_follows_email ON email_follows(email, status);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_email_type ON notification_deliveries(email, notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status_attempt ON notification_deliveries(status, attempt_count, created_at);

`;

async function init() {
  console.log("Initialising database…");
  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const sql of statements) {
    await db.execute(sql + ";");
    console.log("✓", sql.split("\n")[0].slice(0, 60));
  }

  // Lightweight migrations for databases created before subscriber deadline alerts existed.
  const migrations = [
    "ALTER TABLE subscribers ADD COLUMN email_deadline_reminders_enabled INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE subscribers ADD COLUMN email_deadline_reminders TEXT NOT NULL DEFAULT '[14,7,3,1]'",
    `CREATE TABLE IF NOT EXISTS email_follows (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      opportunity_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','unsubscribed')),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      unsubscribed_at INTEGER,
      UNIQUE(email, opportunity_id)
    )`,
    `CREATE TABLE IF NOT EXISTS notification_deliveries (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      notification_type TEXT NOT NULL,
      send_key TEXT NOT NULL UNIQUE,
      opportunity_id TEXT,
      deadline_date TEXT,
      days_left INTEGER,
      status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','sent','failed')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      sent_at INTEGER
    )`,
    "CREATE INDEX IF NOT EXISTS idx_email_follows_opportunity ON email_follows(opportunity_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_email_follows_email ON email_follows(email, status)",
    "CREATE INDEX IF NOT EXISTS idx_notification_deliveries_email_type ON notification_deliveries(email, notification_type)",
    "CREATE INDEX IF NOT EXISTS idx_subscribers_status_email ON subscribers(status, email)",
    "CREATE INDEX IF NOT EXISTS idx_email_follows_due_page ON email_follows(status, opportunity_id, email)",
    "CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status_attempt ON notification_deliveries(status, attempt_count, created_at)",
  ];

  for (const sql of migrations) {
    try {
      await db.execute(sql);
      console.log("✓ migration", sql);
    } catch (err) {
      if (!String(err?.message ?? err).includes("duplicate column")) {
        throw err;
      }
    }
  }

  console.log("Database ready.");
}

init().catch((err) => {
  console.error(err);
  process.exit(1);
});
