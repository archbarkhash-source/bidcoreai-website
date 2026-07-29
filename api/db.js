/**
 * api/db.js — Neon connection for the free Go/No-Go workspace.
 *
 * This site is deliberately independent of the BidcoreAI product app: its own
 * repo, its own deploy, its own database (the "Bidcoreai-Webopp" Neon branch),
 * and its own language. Nothing here can reach the product database, and a
 * compromise of this public site yields free-tier lead data and nothing else.
 *
 * Env:
 *   DATABASE_URL — the Bidcoreai-Webopp Neon connection string (pooled).
 *                  On Vercel this is set for you by the Neon integration.
 */
const { Pool } = require('pg');

let pool = null;
let schemaReady = false;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) return null;

  // Neon (and every hosted Postgres) requires TLS; a local Postgres normally
  // has it switched off and errors on the attempt. Decide from the host rather
  // than forcing one or the other, so the same code runs against Neon in
  // production and a scratch database on a laptop.
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString);
  const sslDisabled = /[?&]sslmode=disable\b/.test(connectionString);

  // The `ssl` option below is what actually decides TLS, so an sslmode= in the
  // URL is dead weight — but pg-connection-string still parses it and prints a
  // multi-paragraph deprecation warning about 'require' changing meaning in pg
  // v9. Drop the parameter now that we have read what we needed from it: the
  // connection behaves identically and the startup noise goes away.
  const cleaned = (() => {
    const q = connectionString.indexOf('?');
    if (q === -1) return connectionString;
    const kept = connectionString.slice(q + 1).split('&')
      .filter((p) => p && !/^(sslmode|uselibpqcompat)=/i.test(p));
    return connectionString.slice(0, q) + (kept.length ? `?${kept.join('&')}` : '');
  })();

  pool = new Pool({
    connectionString: cleaned,
    // rejectUnauthorized:false matches how Neon's own quickstarts connect from
    // serverless runtimes, where the platform CA bundle isn't always present.
    ssl: isLocal || sslDisabled ? false : { rejectUnauthorized: false },
    // Small pool: serverless functions are short-lived and Neon charges by
    // compute time, so warm connections are cheap but many are wasteful.
    max: 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });
  return pool;
}

function isConfigured() {
  return !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

/**
 * Every table this site needs, created on first use. Idempotent, so it is safe
 * to call per request; the module flag keeps it to one round-trip per process.
 *
 * The schema is intentionally small and self-contained — a workspace is one
 * row, and everything else hangs off it by id. No user accounts, no products,
 * no billing: the only identity here is "someone who verified an email".
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS gg_workspaces (
  id                 BIGSERIAL PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE,
  company            TEXT,
  name               TEXT,
  -- 'google' | 'email' — how they last proved the address.
  auth_provider      TEXT,

  -- Emailed one-time code. Only the SHA-256 is stored.
  code_hash          TEXT,
  code_expires_at    TIMESTAMPTZ,
  code_attempts      INTEGER NOT NULL DEFAULT 0,
  code_sent_at       TIMESTAMPTZ,

  -- Bearer session. Only the SHA-256 is stored.
  session_token_hash TEXT,
  session_expires_at TIMESTAMPTZ,

  -- Procurement portal credentials (one country per workspace for now).
  country_code       TEXT NOT NULL DEFAULT 'US',
  api_key_encrypted  TEXT,
  api_key_hint       TEXT,
  api_key_status     TEXT,
  api_key_checked_at TIMESTAMPTZ,

  -- Company Intelligence used by the scoring rubric.
  naics_codes        JSONB NOT NULL DEFAULT '[]'::jsonb,
  psc_codes          JSONB NOT NULL DEFAULT '[]'::jsonb,
  states_served      JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_agencies    JSONB NOT NULL DEFAULT '[]'::jsonb,
  certifications     JSONB NOT NULL DEFAULT '[]'::jsonb,
  contract_types     JSONB NOT NULL DEFAULT '[]'::jsonb,
  office_address     TEXT,
  office_lat         DOUBLE PRECISION,
  office_lng         DOUBLE PRECISION,
  bonding_capacity   DOUBLE PRECISION,
  project_value_min  DOUBLE PRECISION,
  project_value_max  DOUBLE PRECISION,
  min_bid_days       INTEGER,

  -- Daily abuse guards.
  searches_today     INTEGER NOT NULL DEFAULT 0,
  scores_today       INTEGER NOT NULL DEFAULT 0,
  usage_day          DATE,

  source             TEXT,
  verified_at        TIMESTAMPTZ,
  last_seen_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gg_workspaces_session_idx ON gg_workspaces (session_token_hash);
-- Added after the first release: CREATE TABLE IF NOT EXISTS skips an existing
-- table entirely, so new columns need saying separately.
ALTER TABLE gg_workspaces ADD COLUMN IF NOT EXISTS contract_types JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS gg_capabilities (
  id           BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES gg_workspaces(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  naics_codes  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gg_capabilities_workspace_idx ON gg_capabilities (workspace_id);

CREATE TABLE IF NOT EXISTS gg_past_performance (
  id             BIGSERIAL PRIMARY KEY,
  workspace_id   BIGINT NOT NULL REFERENCES gg_workspaces(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  agency         TEXT,
  naics_code     TEXT,
  contract_value DOUBLE PRECISION,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gg_past_performance_workspace_idx ON gg_past_performance (workspace_id);

-- Opportunities the visitor kept, and where each one has reached in their own
-- capture pipeline. The notice itself is stored rather than re-fetched: a
-- solicitation drops off SAM.gov's search window once it closes, and a pipeline
-- that loses cards when that happens is worse than no pipeline.
CREATE TABLE IF NOT EXISTS gg_opportunities (
  id                  BIGSERIAL PRIMARY KEY,
  workspace_id        BIGINT NOT NULL REFERENCES gg_workspaces(id) ON DELETE CASCADE,
  notice_id           TEXT,
  solicitation_number TEXT,
  title               TEXT,
  agency              TEXT,
  naics               TEXT,
  set_aside           TEXT,
  due_date            TEXT,
  city                TEXT,
  state               TEXT,
  ui_link             TEXT,
  -- under_review | go_approved | capture_planning | proposal_development |
  -- submitted | awarded | lost
  --
  -- under_review is where an analysed notice lands, and the only stage that
  -- expires (see expireStale in routes.js).
  status              TEXT NOT NULL DEFAULT 'under_review',
  score               INTEGER,
  recommendation      TEXT,
  raw                 JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS gg_opportunities_workspace_idx ON gg_opportunities (workspace_id);
-- Saving the same notice twice is an update, not a duplicate card. COALESCE
-- because a notice without an id still needs a stable key.
CREATE UNIQUE INDEX IF NOT EXISTS gg_opportunities_unique_notice
  ON gg_opportunities (workspace_id, COALESCE(notice_id, solicitation_number, title));

-- Lead funnel, for following up with people who tried the free tool.
CREATE TABLE IF NOT EXISTS gg_events (
  id           BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT REFERENCES gg_workspaces(id) ON DELETE CASCADE,
  event        TEXT NOT NULL,
  detail       JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

/** Apply the schema on any client/pool — used by the pool below and by
 *  api/check-db.js, so the diagnostic proves the same statements the app runs. */
async function ensureSchemaOn(clientOrPool) {
  await clientOrPool.query(SCHEMA);
}

async function ensureSchema() {
  if (schemaReady) return true;
  const p = getPool();
  if (!p) return false;
  await ensureSchemaOn(p);
  schemaReady = true;
  return true;
}

/** Run a query, creating the schema first if this process hasn't yet. */
async function query(text, params) {
  const p = getPool();
  if (!p) {
    const err = new Error('The free workspace is not available — DATABASE_URL is not set.');
    err.statusCode = 503;
    throw err;
  }
  await ensureSchema();
  return p.query(text, params);
}

/** First row, or null. The shape most reads here want. */
async function one(text, params) {
  const { rows } = await query(text, params);
  return rows[0] || null;
}

module.exports = { query, one, getPool, isConfigured, ensureSchema, ensureSchemaOn };
