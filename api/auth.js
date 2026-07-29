/**
 * api/auth.js — identity for the free Go/No-Go workspace.
 *
 * Two ways in, both landing on the same workspace row keyed by email:
 *
 *   • Google  — "Continue with Google". The browser gets an ID token from
 *               Google Identity Services; we verify its signature, issuer,
 *               audience and expiry against Google's public keys, and require
 *               email_verified. No password, no typing, and the address is
 *               proved by Google.
 *   • Email   — a 6-digit code, for anyone without a Google account or who
 *               would rather not use one.
 *
 * Neither secret is stored in the clear: the emailed code and the session token
 * are kept as SHA-256 digests and compared with timingSafeEqual.
 */
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const db = require('./db');

const CODE_TTL_MINUTES = 15;
const CODE_MAX_ATTEMPTS = 6;
const CODE_RESEND_SECONDS = 60;
const SESSION_TTL_DAYS = 30;

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const normalizeEmail = (e) => String(e || '').trim().toLowerCase();

function httpError(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

// ── Email delivery ───────────────────────────────────────────────────────────

function transport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

async function sendCodeEmail(to, code) {
  const tx = transport();
  if (!tx) {
    // Local dev without SMTP: log it rather than failing, so the flow is still
    // testable end to end.
    console.log(`\n[go-no-go] access code for ${to}: ${code}\n`);
    return;
  }
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
      <h2 style="margin-bottom:4px">Your BidcoreAI access code</h2>
      <p style="color:#475569;margin-top:0">Free Federal Opportunity Go/No-Go</p>
      <p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:20px 0">${code}</p>
      <p style="color:#475569">This code expires in ${CODE_TTL_MINUTES} minutes.</p>
      <p style="color:#94a3b8;font-size:12px">If you didn't request it, you can ignore this email.</p>
    </div>`;
  try {
    await tx.sendMail({
      from: `${process.env.SMTP_FROM_NAME || 'BidcoreAI'} <${process.env.SMTP_USER}>`,
      to,
      subject: `${code} — your BidcoreAI access code`,
      html,
    });
  } catch (e) {
    // A mail failure must not strand the visitor with an unusable session.
    console.error('[go-no-go] could not email access code:', e.message);
    console.log(`\n[go-no-go] access code for ${to}: ${code}\n`);
  }
}

// ── Workspace + session ──────────────────────────────────────────────────────

async function findOrCreateWorkspace(email, { company, source } = {}) {
  const existing = await db.one('SELECT * FROM workspaces WHERE email = $1', [email]);
  if (existing) {
    if (company || source) {
      await db.query(
        `UPDATE workspaces
            SET company = COALESCE($2, company),
                source  = COALESCE(source, $3)
          WHERE id = $1`,
        [existing.id, company || null, source || null],
      );
    }
    return existing;
  }
  return db.one(
    `INSERT INTO workspaces (email, company, source) VALUES ($1, $2, $3) RETURNING *`,
    [email, company || null, source || null],
  );
}

async function issueSession(workspaceId, provider) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(
    `UPDATE workspaces
        SET session_token_hash = $2,
            session_expires_at = NOW() + ($3 || ' days')::interval,
            auth_provider      = $4,
            verified_at        = COALESCE(verified_at, NOW()),
            last_seen_at       = NOW(),
            code_hash          = NULL,
            code_expires_at    = NULL,
            code_attempts      = 0
      WHERE id = $1`,
    [workspaceId, sha256(token), String(SESSION_TTL_DAYS), provider],
  );
  return token;
}

/** Express middleware: resolve X-Public-Session into req.workspace, or 401. */
async function requireSession(req, res, next) {
  try {
    const token = req.get('X-Public-Session') || '';
    if (!token) throw httpError(401, 'Sign in to use the free workspace.');

    const hash = sha256(token);
    const ws = await db.one('SELECT * FROM workspaces WHERE session_token_hash = $1', [hash]);
    // The indexed lookup is the fast path; this is the constant-time comparison
    // that actually authorises.
    if (!ws || !safeEqual(ws.session_token_hash, hash)) {
      throw httpError(401, 'Your session expired — sign in again.');
    }
    if (ws.session_expires_at && new Date(ws.session_expires_at) < new Date()) {
      throw httpError(401, 'Your session expired — sign in again.');
    }

    // Sliding expiry: this page is meant to be bookmarked and used weekly, so
    // every visit pushes the window out again. Someone who keeps using it is
    // never signed out; someone who stops is, 30 days later.
    await db.query(
      `UPDATE workspaces
          SET last_seen_at = NOW(),
              session_expires_at = NOW() + ($2 || ' days')::interval
        WHERE id = $1`,
      [ws.id, String(SESSION_TTL_DAYS)],
    );
    req.workspace = ws;
    next();
  } catch (e) {
    next(e);
  }
}

// ── Entry points ─────────────────────────────────────────────────────────────

/**
 * Start (or resume) a workspace by email. Always reports success, whether or
 * not the address was already known — this endpoint is open to the internet,
 * and a different answer for a known email would make it an enumeration oracle.
 */
async function requestCode({ email, company, source }) {
  const addr = normalizeEmail(email);
  if (!addr || !addr.includes('@')) throw httpError(400, 'Enter a valid email address.');
  // Company is required on this path. The client checks it too, but the client
  // is not the authority — a lead with no company name is barely a lead.
  if (!String(company || '').trim()) throw httpError(400, 'Enter your company name.');

  const ws = await findOrCreateWorkspace(addr, { company, source });

  if (ws.code_sent_at) {
    const elapsed = (Date.now() - new Date(ws.code_sent_at).getTime()) / 1000;
    if (elapsed < CODE_RESEND_SECONDS) {
      throw httpError(429, `A code was just sent — try again in ${Math.ceil(CODE_RESEND_SECONDS - elapsed)}s.`);
    }
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await db.query(
    `UPDATE workspaces
        SET code_hash = $2,
            code_expires_at = NOW() + ($3 || ' minutes')::interval,
            code_attempts = 0,
            code_sent_at = NOW()
      WHERE id = $1`,
    [ws.id, sha256(code), String(CODE_TTL_MINUTES)],
  );

  await sendCodeEmail(addr, code);
  return { email: addr, expires_in_minutes: CODE_TTL_MINUTES };
}

async function verifyCode({ email, code }) {
  const addr = normalizeEmail(email);
  const ws = await db.one('SELECT * FROM workspaces WHERE email = $1', [addr]);
  if (!ws || !ws.code_hash) throw httpError(400, 'Request a code first.');
  if (ws.code_expires_at && new Date(ws.code_expires_at) < new Date()) {
    throw httpError(400, 'That code has expired — request a new one.');
  }
  if (ws.code_attempts >= CODE_MAX_ATTEMPTS) {
    throw httpError(429, 'Too many attempts — request a new code.');
  }

  await db.query('UPDATE workspaces SET code_attempts = code_attempts + 1 WHERE id = $1', [ws.id]);
  if (!safeEqual(ws.code_hash, sha256(String(code).trim()))) {
    throw httpError(400, "That code isn't right.");
  }

  const token = await issueSession(ws.id, 'email');
  return { token, workspace: await db.one('SELECT * FROM workspaces WHERE id = $1', [ws.id]) };
}

let googleClient = null;
function getGoogleClient() {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  if (!clientId) return null;
  if (!googleClient) googleClient = new OAuth2Client(clientId);
  return googleClient;
}

/**
 * "Continue with Google". google-auth-library checks the token's signature
 * against Google's published keys plus issuer, expiry and audience (our own
 * client ID) — so a token minted for some other site is rejected.
 */
async function googleSignIn({ credential, source }) {
  const client = getGoogleClient();
  if (!client) throw httpError(503, "Google sign-in isn't configured — use the email code instead.");

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID.trim(),
    });
    payload = ticket.getPayload();
  } catch (e) {
    console.warn('[go-no-go] Google ID token rejected:', e.message);
    throw httpError(401, 'Google sign-in failed — try the email code instead.');
  }

  if (!payload || !payload.email_verified) {
    throw httpError(401, "That Google account's email isn't verified.");
  }
  const addr = normalizeEmail(payload.email);

  // hd is the Google Workspace hosted domain — a usable company name for
  // business accounts, absent on personal gmail.
  const ws = await findOrCreateWorkspace(addr, { company: payload.hd || null, source });
  if (payload.name) {
    await db.query('UPDATE workspaces SET name = COALESCE(name, $2) WHERE id = $1', [ws.id, payload.name]);
  }

  const token = await issueSession(ws.id, 'google');
  return { token, workspace: await db.one('SELECT * FROM workspaces WHERE id = $1', [ws.id]) };
}

async function signOut(workspaceId) {
  await db.query(
    'UPDATE workspaces SET session_token_hash = NULL, session_expires_at = NULL WHERE id = $1',
    [workspaceId],
  );
}

module.exports = {
  requireSession, requestCode, verifyCode, googleSignIn, signOut,
  httpError, sha256, SESSION_TTL_DAYS,
};
