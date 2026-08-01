/**
 * api/comments.js — blog comments, mounted at /api/comments.
 *
 *   GET  /:slug   comments visible on a post
 *   POST /:slug   leave one
 *
 * Identity
 *   There is no name field. A commenter either signs in with Google — the same
 *   client id the free workspace already uses — or posts anonymously.
 *
 *   Worth being explicit, because it is a common assumption: a browser does not
 *   tell a server who someone is. User-agent, language and timezone describe the
 *   software, not the person. The only honest ways to get a name are to ask for
 *   it or to have an identity provider vouch for it, so this does the latter.
 *
 *   The name is read from the verified Google ID token, never from the request
 *   body. A client that sends {name: "Someone Else"} is ignored.
 *
 * Moderation
 *   Google-verified comments appear immediately: the account is real and
 *   accountable, and holding them would make the section look dead. Anonymous
 *   ones are held for approval, because an unauthenticated write endpoint that
 *   publishes on arrival is how a marketing site acquires a link farm.
 *
 *   To publish a held comment:
 *     UPDATE blog_comments SET approved_at = NOW() WHERE id = 123;
 *
 *   To hold verified comments too, drop `verified` from the INSERT's approved_at
 *   expression below.
 */
const express = require('express');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const db = require('./db');

const router = express.Router();

/* Checked against the same list the page router uses, so a comment can only
   attach to a post that exists. */
const POSTS = [
  'federal-go-no-go-decision',
  'free-federal-go-no-go-analyser-construction',
  'reading-a-sam-gov-solicitation',
  'quantity-takeoff-accuracy',
  'bid-leveling-subcontractor-quotes',
  'bonding-capacity-portfolio-decision',
  'set-aside-certifications-explained',
  'federal-proposal-writing',
  'ai-in-construction-preconstruction',
  'end-to-end-federal-estimating-software',
];

const MAX_BODY = 2000;
const MIN_BODY = 2;
const MAX_PER_HOUR = 5;

let googleClient = null;
function getGoogleClient() {
  const id = (process.env.GOOGLE_CLIENT_ID || '').trim();
  if (!id) return null;
  if (!googleClient) googleClient = new OAuth2Client(id);
  return googleClient;
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function fail(status, message) {
  const e = new Error(message);
  e.statusCode = status;
  return e;
}

/* Hashed and salted: used for rate limiting, so the raw address never needs
   storing and the hashes are useless outside this table. */
function hashIp(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = fwd || req.socket?.remoteAddress || 'unknown';
  return crypto.createHash('sha256')
    .update(`${process.env.SECRET_KEY || 'bidcoreai'}:${ip}`)
    .digest('hex');
}

/** Verify a Google ID token and return the identity it asserts, or null. */
async function identityFrom(credential) {
  if (!credential) return null;
  const client = getGoogleClient();
  if (!client) throw fail(503, 'Google sign-in is not configured on this site.');
  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: (process.env.GOOGLE_CLIENT_ID || '').trim(),
    });
    payload = ticket.getPayload();
  } catch (e) {
    console.warn('[comments] Google ID token rejected:', e.message);
    throw fail(401, 'That Google sign-in could not be verified. Try again.');
  }
  if (!payload || !payload.email_verified) {
    throw fail(401, "That Google account's email is not verified.");
  }
  const name = String(payload.name || payload.given_name || payload.email.split('@')[0])
    .replace(/\s+/g, ' ').trim().slice(0, 80);
  return {
    name: name || 'Anonymous',
    email: String(payload.email).toLowerCase().slice(0, 160),
    avatar: typeof payload.picture === 'string' && /^https:\/\//.test(payload.picture)
      ? payload.picture.slice(0, 400) : null,
  };
}

/* The pages are static files with no access to the environment, so the client id
   is served rather than baked in. Public by design — a Google client id appears
   in the page of every site that uses Google sign-in. */
router.get('/config', (req, res) => {
  res.json({ google_client_id: (process.env.GOOGLE_CLIENT_ID || '').trim() || null });
});

router.get('/:slug', wrap(async (req, res) => {
  if (!POSTS.includes(req.params.slug)) throw fail(404, 'Unknown article.');
  if (!db.isConfigured()) return res.json({ comments: [] });

  const { rows } = await db.query(
    `SELECT id, name, body, verified, avatar_url, created_at
       FROM blog_comments
      WHERE slug = $1 AND approved_at IS NOT NULL
      ORDER BY created_at ASC
      LIMIT 200`,
    [req.params.slug],
  );
  res.json({ comments: rows });
}));

router.post('/:slug', wrap(async (req, res) => {
  const slug = req.params.slug;
  if (!POSTS.includes(slug)) throw fail(404, 'Unknown article.');

  /* Hidden field no human sees. Anything filling it is automated, and gets a
     success response so it has no signal to adapt to. */
  if (String(req.body?.website || '').trim()) {
    return res.json({ ok: true, pending: true });
  }

  const body = String(req.body?.body == null ? '' : req.body.body).trim().slice(0, MAX_BODY);
  if (body.length < MIN_BODY) throw fail(400, 'Please write a comment.');
  if (/https?:\/\/|\bwww\./i.test(body)) throw fail(400, 'Links are not allowed in comments.');

  if (!db.isConfigured()) throw fail(503, 'Comments are unavailable right now.');

  const who = await identityFrom(req.body?.credential);

  const ipHash = hashIp(req);
  const recent = await db.one(
    `SELECT COUNT(*)::int AS n FROM blog_comments
      WHERE ip_hash = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [ipHash],
  );
  if (recent && recent.n >= MAX_PER_HOUR) {
    throw fail(429, 'That is a lot of comments in one hour. Try again later.');
  }

  /* approved_at is set inline for verified accounts, so a signed-in comment is
     on the page the moment it is written. */
  const row = await db.one(
    `INSERT INTO blog_comments
       (slug, name, email, body, ip_hash, user_agent, verified, avatar_url, approved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $7 THEN NOW() ELSE NULL END)
     RETURNING id, name, body, verified, avatar_url, created_at, approved_at`,
    [
      slug,
      who ? who.name : 'Anonymous',
      who ? who.email : null,
      body,
      ipHash,
      String(req.get('user-agent') || '').slice(0, 300) || null,
      !!who,
      who ? who.avatar : null,
    ],
  );

  res.json({
    ok: true,
    pending: !row.approved_at,
    comment: row.approved_at ? row : null,
  });
}));

router.use((err, req, res, _next) => {
  const status = err.statusCode || 500;
  if (status >= 500) console.error('[comments]', err);
  res.status(status).json({ error: err.message || 'Something went wrong. Please try again.' });
});

module.exports = router;
module.exports.POSTS = POSTS;
