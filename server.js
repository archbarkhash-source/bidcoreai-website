/**
 * BidcoreAI · server.js  (updated — real multi-page routing)
 *
 * URL structure served:
 *   /                    → Home
 *   /solutions           → Solutions
 *   /pricing             → Pricing
 *   /takeoff-services    → Professional Takeoff Services
 *   /feedback            → Feedback
 *   /contact             → Contact
 *
 * Static assets (style.css, script.js, images/) served from /public
 * Page HTML files live in /views/
 *
 * Environment variables (set in Render dashboard or .env):
 *   RESEND_API_KEY        — Resend API key (resend.com)
 *   RESEND_FROM_EMAIL     — e.g. noreply@bidcoreai.com (verified domain)
 *   SMTP_HOST             — e.g. smtp.gmail.com
 *   SMTP_PORT             — 465 (SSL) or 587 (STARTTLS)
 *   SMTP_USER             — e.g. barkha@bidcoreai.com
 *   SMTP_PASSWORD         — SMTP password / app password
 *   SMTP_FROM_NAME        — e.g. BidcoreAI
 *   TO_EMAIL              — where to receive submissions (default: barkha@bidcoreai.com)
 *   PORT                  — server port (Render sets automatically)
 */

require('dotenv').config();
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const app     = express();

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Serve static assets from /public
// Handles both:
//   /style.css        (when accessed via server at bidcoreai.com/style.css)
//   ../public/style.css  (when views/*.html are opened directly in browser)
/* Images and fonts may be held for a week; CSS and JS always revalidate.
   A stylesheet is the one asset whose staleness breaks a page silently: fresh
   HTML naming classes a week-old stylesheet has never heard of renders as
   unstyled bullets, and the visitor has no way to know a hard refresh would
   fix it. Cache-busting query strings only work if you remember to bump them
   on every edit, and one missed bump costs a week — so the revalidation is
   enforced here rather than left to discipline. no-cache still permits a 304,
   so an unchanged stylesheet costs a round trip, not a re-download. */
const staticOpts = {
  maxAge: '7d',
  setHeaders(res, filePath) {
    if (/\.(css|js)$/i.test(filePath)) {
      res.set('Cache-Control', 'no-cache, must-revalidate');
    }
  }
};
app.use(express.static(path.join(__dirname, 'public'), staticOpts));
app.use('/public', express.static(path.join(__dirname, 'public'), staticOpts));

/* HTML always revalidates; images may be held for a week.
   Renaming an image is a one-line change inside a page, but a browser holding
   a week-old copy of that page keeps requesting a file that no longer exists
   and renders a broken image with no way for the visitor to know why — which
   is exactly what happened when the png images became jpgs. no-cache still
   permits a 304, so this costs a round trip, not a re-download. */
app.use((req, res, next) => {
  if (!path.extname(req.path)) {
    res.set('Cache-Control', 'no-cache, must-revalidate');
  }
  next();
});

const TO_EMAIL   = process.env.TO_EMAIL || 'barkha@bidcoreai.com';
const VIEWS_DIR  = path.join(__dirname, 'views');

/* ─────────────────────────────────────
   PAGE ROUTES — each URL serves its own
   pre-built HTML file with full SEO head
───────────────────────────────────────*/

/* Automated scanners probe every site on the internet for WordPress installs,
   exposed .env files and admin panels. A 404 is already the right answer — this
   site is not WordPress and there is nothing at those paths — but the handler
   below served the full 60 KB homepage for every miss, so each probe cost real
   bandwidth. Known-junk paths get a bare text 404 instead.

   This is not security by itself: the paths do not exist either way. It just
   stops noise being expensive. */
const SCAN_PATHS = /^\/(wp-admin|wp-login|wp-content|wp-includes|wordpress|xmlrpc\.php|\.env|\.git|\.aws|phpmyadmin|pma|admin\.php|administrator|cgi-bin|vendor\/phpunit|\.well-known\/traffic-advice)/i;

app.use((req, res, next) => {
  if (SCAN_PATHS.test(req.path)) return res.status(404).type('txt').send('Not found');
  next();
});

/* ── Canonical URL enforcement ─────────────────────────────────────────────
   Two sources of duplicate URLs, both of which Search Console reports as
   "Alternate page with proper canonical tag":

   1. Express has strict routing off, so /pricing/ matches /pricing and returns
      200. That is a second URL serving identical content.
   2. The bare domain is a separate host from www.

   Canonical tags already point at the right URL, so nothing was broken — but a
   301 is a stronger signal than a canonical hint, and it stops the duplicate
   being crawled at all. Root is exempt: "/" has to keep its slash. */
app.use((req, res, next) => {
  const host = req.headers.host || '';
  if (host === 'bidcoreai.com') {
    return res.redirect(301, `https://www.bidcoreai.com${req.originalUrl}`);
  }
  if (req.path.length > 1 && req.path.endsWith('/')) {
    const q = req.originalUrl.slice(req.path.length);
    return res.redirect(301, req.path.replace(/\/+$/, '') + q);
  }
  next();
});

const noCache = (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
};

/* ── The page registry ────────────────────────────────────────────────────────
   Every public page is declared through page(), which does two things with one
   call: serves the file at that URL, and lists the URL in /sitemap.xml.

   This replaces a hand-written public/sitemap.xml. That file was correct on the
   day it was written and had no way of staying correct: adding a page meant
   remembering to add a second entry in a second file, and a page missing from
   the sitemap is invisible — nothing 404s, nothing looks broken, the page just
   waits longer to be found. Tying the two together means a page that is served
   is a page that is listed, and the drift cannot happen.

   priority and changefreq are hints Google mostly ignores; they are kept
   because they cost nothing and they record what this site wants found first. */
const SITEMAP = [];

function page(url, file, { priority = 0.6, changefreq = 'monthly', before = [] } = {}) {
  app.get(url, ...before, (req, res) => res.sendFile(path.join(VIEWS_DIR, file)));
  SITEMAP.push({ url, file, priority, changefreq });
}

page('/', 'index.html', { priority: 1.0, changefreq: 'weekly' });
page('/solutions', 'solutions.html', { priority: 0.8 });
page('/pricing', 'pricing.html', { priority: 0.7 });

/* ── Services ──
   /services is the hub the Services nav tab points at; the trade pages below
   are what its cards link to. Each is its own file with its own SEO title,
   description, canonical and keywords — no shared template at runtime. */
const SERVICE_PAGES = [
  'takeoff-services',
  // Combined takeoff + estimating landing page, linking down to both sides
  'quantity-takeoff-estimating-services',
  // Takeoff — an index plus one page per CSI division
  'construction-takeoff-services',
  'demolition-takeoff-services',
  'concrete-takeoff-services',
  'masonry-takeoff-services',
  'steel-takeoff-services',
  'lumber-takeoff-services',
  'roofing-insulation-takeoff-services',
  'doors-windows-takeoff-services',
  'finishes-takeoff-services',
  'specialties-takeoff-services',
  'mechanical-takeoff-services',
  'plumbing-takeoff-services',
  'electrical-takeoff-services',
  'exterior-improvements-takeoff-services',
  // Estimating, by trade
  'construction-estimating-services',
  'drywall-estimating-services',
  'lumber-estimating-services',
  'mep-estimating-services',
  'electrical-estimating-services',
  'hvac-estimating-services',
  'concrete-estimating-services',
  // Samples
  'work-samples',
];

for (const slug of SERVICE_PAGES) {
  page(`/${slug}`, `${slug}.html`, { priority: slug === 'takeoff-services' ? 0.8 : 0.7 });
}

/* Takeoff pages are organised by CSI division now. These are the old
   trade-named URLs, kept alive so links and search results still land
   somewhere useful instead of on a 404. */
const LEGACY_TAKEOFF_URLS = {
  'services': '/construction-takeoff-services',
  'drywall-takeoff-services': '/finishes-takeoff-services',
  'flooring-takeoff-services': '/finishes-takeoff-services',
  'hvac-takeoff-services': '/mechanical-takeoff-services',
  'mechanical-plumbing-takeoff-services': '/mechanical-takeoff-services',
  // CAD services were withdrawn. Both URLs were live and indexed, so they
  // redirect rather than 404 — anyone arriving from a bookmark or a stale
  // search result lands on the services hub instead of a dead end.
  'cad-services': '/takeoff-services',
  'architectural-cad-services': '/takeoff-services',
};

for (const [slug, target] of Object.entries(LEGACY_TAKEOFF_URLS)) {
  app.get(`/${slug}`, (req, res) => res.redirect(301, target));
}

/* ── Software ──
   /software is the hub; /software/<slug> is one page per trade or per head
   term. The pages are generated by tools/build-software.js into
   views/software/, so the list is read from that directory at boot rather than
   typed out here — a list copied from the generator would drift the first time
   a trade is added, and a 404 on a page that exists is the kind of bug nobody
   notices for a month. Reading the directory also means a new trade page is
   routed and in the sitemap the moment the generator writes it. An unknown slug
   still falls through to the 404 handler, because only names that are actually
   files get a route. */
const SOFTWARE_DIR   = path.join(VIEWS_DIR, 'software');
const SOFTWARE_PAGES = fs.readdirSync(SOFTWARE_DIR)
  .filter(f => f.endsWith('.html') && f !== 'index.html')
  .map(f => f.replace(/\.html$/, ''))
  .sort();

page('/software', 'software/index.html', { priority: 0.8 });

for (const slug of SOFTWARE_PAGES) {
  page(`/software/${slug}`, `software/${slug}.html`, { priority: 0.7 });
}

page('/feedback', 'feedback.html', { priority: 0.5 });
page('/contact', 'contact.html', { priority: 0.6 });

/* ─────────────────────────────────────
   FREE GO/NO-GO — the interactive lead
   magnet. A visitor connects their own
   SAM.gov API key and gets an instant
   12-criterion bid/no-bid analysis.

   Self-contained under /api/go-no-go and
   backed by its own Neon database
   (DATABASE_URL) — it shares nothing with
   the BidcoreAI product app, which is the
   point: this is the one surface a
   stranger can write to.
───────────────────────────────────────*/
/* Community: the blog, its category pages and the start-here guide.
   Each slug gets its own route below, so an unknown one never reaches a file
   path — it falls through to the 404 handler. */
const BLOG_POSTS = [
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
const BLOG_CATEGORIES = [
  'federal-bidding',
  'cost-estimating',
  'bidding',
  'proposal-writing',
  'ai-in-construction',
];

page('/blog', 'blog.html', { priority: 0.8, changefreq: 'weekly' });
page('/guide', 'guide.html', { priority: 0.7 });

for (const cat of BLOG_CATEGORIES) {
  page(`/blog/category/${cat}`, `blog-category-${cat}.html`, { priority: 0.6, changefreq: 'weekly' });
}

for (const slug of BLOG_POSTS) {
  page(`/blog/${slug}`, `blog-${slug}.html`, { priority: 0.7 });
}

// Features overview — the page the Features nav tab links to.
page('/features', 'features.html', { priority: 0.8 });

/* Feature pages — one per platform capability. */
const FEATURE_PAGES = [
  'ai-quantity-takeoff',
  'ai-document-analysis',
  'ai-risk-compliance-analyser',
  'csi-cost-estimation',
  'bid-packages-leveling',
  'ai-bid-proposal',
];

for (const slug of FEATURE_PAGES) {
  page(`/${slug}`, `${slug}.html`, { priority: 0.7 });
}

page('/go-no-go', 'go-no-go.html', { priority: 1.0, changefreq: 'weekly', before: [noCache] });

// Descriptive alias for campaign links and SEO.
app.get('/free-go-no-go-analysis', (req, res) => res.redirect(301, '/go-no-go'));

app.use('/api/go-no-go', require('./api/routes'));

/* Blog comments. Stored in the same Neon database as the free workspace, and
   held for approval — see api/comments.js. */
app.use('/api/comments', require('./api/comments'));

/* ─────────────────────────────────────
   SITEMAP

   Built from the page registry above, so it lists exactly the pages this
   server serves. Submitted to Search Console once, as "sitemap.xml"; every
   page added afterwards appears in it without anyone touching Search Console
   or this file again.

   Built on first request and kept for the life of the process. A deploy starts
   a new process, so a new page is live and listed at the same moment. */
const { buildSitemap } = require('./sitemap');

let sitemapXml = null;

app.get('/sitemap.xml', (req, res) => {
  if (!sitemapXml) sitemapXml = buildSitemap(SITEMAP, __dirname);
  res.type('application/xml').send(sitemapXml);
});

/* A page file that was never registered above is served by nothing and listed
   nowhere — it exists only on disk. That is a silent failure: no 404 in the
   log, no broken link, just a page that was written and never went live. The
   check runs once at boot and only prints when something is adrift. */
function auditPageCoverage() {
  const registered = new Set(SITEMAP.map(e => e.file));
  const onDisk = [
    ...fs.readdirSync(VIEWS_DIR).filter(f => f.endsWith('.html')),
    ...fs.readdirSync(SOFTWARE_DIR).filter(f => f.endsWith('.html')).map(f => `software/${f}`),
  ];

  // 404.html is served by the not-found handler and must never be listed.
  const orphans = onDisk.filter(f => f !== '404.html' && !registered.has(f));
  if (orphans.length) {
    console.warn(`[BidcoreAI] ${orphans.length} page file(s) have no route and are in no sitemap:`);
    for (const f of orphans) console.warn(`    views/${f}`);
  }
}

/* ─────────────────────────────────────
   EMAIL HELPERS
───────────────────────────────────────*/

async function sendViaResend(subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.RESEND_FROM_EMAIL || 'noreply@bidcoreai.com';
  if (!apiKey) throw new Error('RESEND_API_KEY not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: [TO_EMAIL], subject, html })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Resend error');
  return json;
}

async function sendViaSMTP(subject, html) {
  const nodemailer = require('nodemailer');
  const transport  = nodemailer.createTransport({
    host   : process.env.SMTP_HOST,
    port   : parseInt(process.env.SMTP_PORT || '465'),
    secure : parseInt(process.env.SMTP_PORT || '465') === 465,
    auth   : { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
  });
  await transport.sendMail({
    from    : `"${process.env.SMTP_FROM_NAME || 'BidcoreAI'}" <${process.env.SMTP_USER}>`,
    to      : TO_EMAIL,
    subject,
    html
  });
}

function buildHtml(payload) {
  const rows = Object.entries(payload)
    .filter(([k]) => k !== 'subject')
    .map(([k, v]) => `
      <tr>
        <td style="padding:7px 12px;background:#EDF2F8;font-weight:700;font-size:12px;color:#0B3C5D;white-space:nowrap;border-bottom:1px solid #D5E3EE;text-transform:uppercase;letter-spacing:.05em">${k.replace(/_/g, ' ')}</td>
        <td style="padding:7px 12px;font-size:13px;color:#162E42;border-bottom:1px solid #D5E3EE">${String(v || '—').replace(/\n/g, '<br>')}</td>
      </tr>`).join('');
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#F7FAFD;margin:0;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #D5E3EE">
    <div style="background:#061F32;padding:18px 24px">
      <span style="font-size:18px;font-weight:800;color:#fff">BidcoreAI</span>
      <span style="font-size:11px;color:rgba(255,255,255,.4);margin-left:16px">New Form Submission</span>
    </div>
    <div style="padding:20px 24px">
      <div style="font-size:20px;font-weight:800;color:#0B3C5D;margin-bottom:16px">${payload.subject || 'New Submission'}</div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #D5E3EE;border-radius:8px;overflow:hidden">${rows}</table>
    </div>
    <div style="background:#EDF2F8;padding:12px 24px;font-size:11px;color:#7A9BB5;text-align:center">
      BidcoreAI · barkha@bidcoreai.com
    </div>
  </div>
</body></html>`;
}

/* ─────────────────────────────────────
   API: POST /api/send  (forms without files)
───────────────────────────────────────*/
app.post('/api/send', async (req, res) => {
  const payload = req.body || {};
  const subject = payload.subject || 'BidcoreAI Form Submission';
  const html    = buildHtml(payload);
  try {
    if (process.env.RESEND_API_KEY) {
      await sendViaResend(subject, html);
    } else if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      await sendViaSMTP(subject, html);
    } else {
      console.log('[BidcoreAI] Submission (no mailer configured):', JSON.stringify(payload, null, 2));
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[BidcoreAI] Email error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ─────────────────────────────────────
   API: POST /api/send-with-files  (takeoff form with attachments)
───────────────────────────────────────*/
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

app.post('/api/send-with-files', upload.array('files', 20), async (req, res) => {
  try {
    const meta    = JSON.parse(req.body.meta || '{}');
    const subject = meta.subject || 'Takeoff Service Request';
    const html    = buildHtml(meta);

    const totalBytes = (req.files || []).reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > 100 * 1024 * 1024) {
      return res.status(413).json({ success: false, tooLarge: true });
    }

    const attachments = (req.files || []).map(f => ({
      filename: f.originalname, content: f.buffer, contentType: f.mimetype
    }));

    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      const nodemailer = require('nodemailer');
      const transport  = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '465'),
        secure: parseInt(process.env.SMTP_PORT || '465') === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      });
      await transport.sendMail({
        from: `"${process.env.SMTP_FROM_NAME || 'BidcoreAI'}" <${process.env.SMTP_USER}>`,
        to: TO_EMAIL, subject, html, attachments
      });
    } else if (process.env.RESEND_API_KEY) {
      const resendAttachments = (req.files || []).map(f => ({
        filename: f.originalname, content: f.buffer.toString('base64')
      }));
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || 'noreply@bidcoreai.com',
          to: [TO_EMAIL], subject, html, attachments: resendAttachments
        })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message);
    }

    res.json({ success: true });
  } catch (e) {
    console.error('[BidcoreAI] File send error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ─────────────────────────────────────
   404
───────────────────────────────────────*/

/* A real not-found page. It used to return the homepage with a 404 status, which
   left anyone who mistyped a URL looking at a page that seemed fine while the
   address bar said otherwise. */
app.use((req, res) => {
  res.status(404).sendFile(path.join(VIEWS_DIR, '404.html'));
});

/* ─────────────────────────────────────
   Startup config report

   Everything the Go/No-Go workspace needs comes from the environment, and a
   host that is missing one of these does not fail loudly — it just quietly
   drops a feature. "Continue with Google" simply isn't rendered when
   GOOGLE_CLIENT_ID is unset, which looks like a broken deploy rather than an
   unset variable, and there was nothing in the log to tell the two apart.
   So: one line per variable, on every boot, on every host.
───────────────────────────────────────*/
function reportConfig() {
  const on = (name) => !!(process.env[name] || '').trim();
  const checks = [
    ['DATABASE_URL', on('DATABASE_URL') || on('POSTGRES_URL'), 'the workspace cannot store anything — sign-in fails'],
    ['SECRET_KEY', on('SECRET_KEY'), 'saved SAM.gov keys cannot be encrypted or read back'],
    ['GOOGLE_CLIENT_ID', on('GOOGLE_CLIENT_ID'), '"Continue with Google" is hidden; emailed codes still work'],
    ['RESEND_API_KEY / SMTP_HOST', on('RESEND_API_KEY') || on('SMTP_HOST'), 'no access-code email can be sent'],
  ];
  console.log(`[BidcoreAI] config (${process.env.VERCEL ? 'vercel' : process.env.RENDER ? 'render' : 'local'}):`);
  for (const [name, ok, effect] of checks) {
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — not set: ${effect}`}`);
  }
}

const PORT = process.env.PORT || 3000;
reportConfig();
auditPageCoverage();
console.log(`[BidcoreAI] sitemap: ${SITEMAP.length} pages at /sitemap.xml`);
const server = app.listen(PORT, () =>
  console.log(`BidcoreAI running on http://localhost:${PORT}`));

/* Without a handler, a failed listen emits an unhandled 'error' event and Node
   prints a stack trace ending in "throw er" — which says EADDRINUSE somewhere in
   the middle of twenty lines of internals. The common cause is mundane: another
   copy of this server is already running, usually a previous nodemon child that
   outlived its parent. Say that, and say what to do about it. */
server.on('error', (err) => {
  console.error('');
  if (err.code === 'EADDRINUSE') {
    console.error(`  Port ${PORT} is already in use — another copy of this server is running.`);
    console.error('  Stop it, then start again:');
    console.error(`    Windows        npx kill-port ${PORT}`);
    console.error(`    macOS / Linux  lsof -ti:${PORT} | xargs kill`);
    console.error(`  Or run this one elsewhere:  PORT=3001 npm run dev`);
  } else if (err.code === 'EACCES') {
    console.error(`  Port ${PORT} needs elevated permissions. Try a port above 1024.`);
  } else {
    console.error(`  The server could not start: ${err.message}`);
  }
  console.error('');
  process.exit(1);
});
