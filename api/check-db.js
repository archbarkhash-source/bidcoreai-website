#!/usr/bin/env node
/**
 * api/check-db.js — is this connection string actually usable?
 *
 * Run it before pasting a string into Vercel, so a bad value is caught in two
 * seconds instead of after a deploy:
 *
 *     npm run db:check                       # uses DATABASE_URL from .env
 *     npm run db:check "postgres://user:pw@host/db?sslmode=require"
 *
 * It connects, reports which host/database/role it reached, creates the gg_*
 * tables if they're missing, and counts the workspaces. Every failure is
 * translated from Postgres's error code into the thing you'd actually change.
 */
require('dotenv').config();

const { Client } = require('pg');

const url = (process.argv[2] || process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();

if (!url) {
  console.error('\n✗ No connection string.\n  Pass one as an argument, or set DATABASE_URL in .env\n');
  process.exit(1);
}

// Show what we're connecting to without printing the password.
let shown = url;
try {
  const u = new URL(url);
  shown = `${u.protocol}//${u.username}:***@${u.host}${u.pathname}`;
  if (!/-pooler\./.test(u.host)) {
    console.log('\n⚠ This is the DIRECT endpoint. On Vercel prefer the pooled one');
    console.log('  (host contains "-pooler") — serverless opens far more connections');
    console.log('  than the direct endpoint allows.');
  }
} catch {
  console.error('\n✗ That is not a valid URL. It must start with postgresql:// or postgres://\n');
  process.exit(1);
}

console.log(`\nConnecting to ${shown}`);

const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

(async () => {
  const client = new Client({
    connectionString: url,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
  } catch (e) {
    console.error(`\n✗ ${e.message}`);
    // The three failures that actually happen, each with the one thing to fix.
    if (e.code === '28P01') {
      console.error('\n  Postgres 28P01 = wrong password for that role.');
      console.error('  The password in this string does not match the role on THIS project.');
      console.error('  Fix: Neon → your project → Connection string → Reset password,');
      console.error('       then copy the whole line it shows (password included) and use that.');
      console.error('  Watch for: a string copied from a DIFFERENT Neon project or branch,');
      console.error('       or copied while the password was still masked as dots.');
    } else if (e.code === '3D000') {
      console.error('\n  The database name at the end of the URL does not exist on that host.');
    } else if (/ENOTFOUND|EAI_AGAIN/.test(e.message)) {
      console.error('\n  The host could not be resolved — check for a typo in the hostname.');
    } else if (/timeout/i.test(e.message)) {
      console.error('\n  Timed out. The Neon compute may be suspended (it wakes on first');
      console.error('  connection — try once more), or the host is wrong.');
    }
    console.error('');
    process.exit(1);
  }

  try {
    const who = await client.query(
      'SELECT current_database() AS db, current_user AS role, version() AS version',
    );
    const { db, role, version } = who.rows[0];
    console.log(`✓ Connected — database "${db}" as "${role}"`);
    console.log(`  ${String(version).split(',')[0]}`);

    const { ensureSchemaOn } = require('./db');
    await ensureSchemaOn(client);
    console.log('✓ gg_* tables present');

    const counts = await client.query(`
      SELECT (SELECT count(*) FROM gg_workspaces)       AS workspaces,
             (SELECT count(*) FROM gg_events)           AS events
    `);
    console.log(`  workspaces: ${counts.rows[0].workspaces}, events: ${counts.rows[0].events}`);
    console.log('\nThis string is good. Paste it into Vercel → DATABASE_URL (Production + Preview), then redeploy.\n');
  } catch (e) {
    console.error(`\n✗ Connected, but the schema step failed: ${e.message}\n`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
