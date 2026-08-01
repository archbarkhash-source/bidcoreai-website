/**
 * api/comments.js — blog comments, mounted at /api/comments.
 *
 *   GET  /:slug   approved comments for a post, oldest first
 *   POST /:slug   submit one; stored unapproved and shown to nobody until
 *                 approved_at is set
 *
 * Comments are held for approval rather than published on arrival. This is an
 * unauthenticated write endpoint on a public marketing site: published-on-arrival
 * comment forms become link farms within days, and the cost of that lands on the
 * domain's search reputation — the exact thing the rest of this work has been
 * building up.
 *
 * Approving is a one-line UPDATE for now; there is no admin UI and inventing one
 * without an auth system would be worse than not having it:
 *
 *   UPDATE blog_comments SET approved_at = NOW() WHERE id = 123;
 */
const express = require('express');
const crypto = require('crypto');
const db = require('./db');

const router = express.Router();

/* Slugs are checked against the same list the page router uses, so a comment can
   only ever attach to a post that exists. Kept here rather than imported from
   server.js to avoid a circular require; the test below asserts they match. */
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

const MAX_NAME = 80;
const MAX_EMAIL = 160;
const MAX_BODY = 2000;
const MIN_BODY = 2;
/* Per IP, per hour. High enough for a real conversation, low enough that a
   script filling the table costs more than it is worth. */
const MAX_PER_HOUR = 5;

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function fail(status, message) {
  const e = new Error(message);
  e.statusCode = status;
  return e;
}

/* Hashed, never stored raw: it is only ever compared against a hash of the
   current request, so the plain address is not something this table can leak.
   Salted with SECRET_KEY so the hashes are useless on their own. */
function hashIp(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = fwd || req.socket?.remoteAddress || 'unknown';
  return crypto.createHash('sha256')
    .update(`${process.env.SECRET_KEY || 'bidcoreai'}:${ip}`)
    .digest('hex');
}

const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

router.get('/:slug', wrap(async (req, res) => {
  if (!POSTS.includes(req.params.slug)) throw fail(404, 'Unknown article.');
  if (!db.isConfigured()) return res.json({ comments: [] });

  const { rows } = await db.query(
    `SELECT id, name, body, created_at
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

  /* A hidden field no human sees. Anything that fills it is automated, and is
     told the comment was received so it has no signal to adapt to. */
  if (clean(req.body?.website, 200)) {
    return res.json({ ok: true, pending: true });
  }

  const name = clean(req.body?.name, MAX_NAME);
  const email = clean(req.body?.email, MAX_EMAIL).toLowerCase();
  const body = String(req.body?.body == null ? '' : req.body.body).trim().slice(0, MAX_BODY);

  if (name.length < 2) throw fail(400, 'Please add your name.');
  if (body.length < MIN_BODY) throw fail(400, 'Please write a comment.');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw fail(400, 'That email address does not look right.');
  }
  /* A URL in the body is the signature of the spam this endpoint will mostly
     receive. Rejecting outright keeps the moderation queue readable. */
  if (/https?:\/\/|\bwww\./i.test(body)) {
    throw fail(400, 'Links are not allowed in comments.');
  }

  if (!db.isConfigured()) throw fail(503, 'Comments are unavailable right now.');

  const ipHash = hashIp(req);
  const recent = await db.one(
    `SELECT COUNT(*)::int AS n FROM blog_comments
      WHERE ip_hash = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [ipHash],
  );
  if (recent && recent.n >= MAX_PER_HOUR) {
    throw fail(429, 'That is a lot of comments in one hour. Try again later.');
  }

  await db.query(
    `INSERT INTO blog_comments (slug, name, email, body, ip_hash, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [slug, name, email || null, body, ipHash, clean(req.get('user-agent'), 300) || null],
  );

  /* pending:true is the honest answer — the comment exists but nobody can see it
     yet. Saying "posted" would have the page show something that is not there. */
  res.json({ ok: true, pending: true });
}));

router.use((err, req, res, _next) => {
  const status = err.statusCode || 500;
  if (status >= 500) console.error('[comments]', err);
  res.status(status).json({ error: err.message || 'Something went wrong. Please try again.' });
});

module.exports = router;
module.exports.POSTS = POSTS;
