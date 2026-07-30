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
const app     = express();

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Serve static assets from /public
// Handles both:
//   /style.css        (when accessed via server at bidcoreai.com/style.css)
//   ../public/style.css  (when views/*.html are opened directly in browser)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/public', express.static(path.join(__dirname, 'public')));

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

app.get('/', (req, res) =>
  res.sendFile(path.join(VIEWS_DIR, 'index.html')));

app.get('/solutions', (req, res) =>
  res.sendFile(path.join(VIEWS_DIR, 'solutions.html')));

app.get('/pricing', (req, res) =>
  res.sendFile(path.join(VIEWS_DIR, 'pricing.html')));

// Primary URL for Takeoff Services (Google-friendly slug)
app.get('/takeoff-services', (req, res) =>
  res.sendFile(path.join(VIEWS_DIR, 'services.html')));

// Legacy alias — redirects to canonical URL (301 = permanent, good for SEO)
app.get('/services', (req, res) =>
  res.redirect(301, '/takeoff-services'));

// ── Trade-specific takeoff & estimating service pages ──
// Each has its own unique HTML with full SEO title, description, canonical, and keywords
app.get('/construction-takeoff-services', (req, res) =>
  res.sendFile(path.join(VIEWS_DIR, 'construction-takeoff-services.html')));

app.get('/drywall-takeoff-services', (req, res) =>
  res.sendFile(path.join(VIEWS_DIR, 'drywall-takeoff-services.html')));

app.get('/flooring-takeoff-services', (req, res) =>
  res.sendFile(path.join(VIEWS_DIR, 'flooring-takeoff-services.html')));

app.get('/doors-windows-takeoff-services', (req, res) =>
  res.sendFile(path.join(VIEWS_DIR, 'doors-windows-takeoff-services.html')));

app.get('/construction-estimating-services', (req, res) =>
  res.sendFile(path.join(VIEWS_DIR, 'construction-estimating-services.html')));

app.get('/feedback', (req, res) =>
  res.sendFile(path.join(VIEWS_DIR, 'feedback.html')));

app.get('/contact', (req, res) =>
  res.sendFile(path.join(VIEWS_DIR, 'contact.html')));

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
   Slugs are matched against whitelists rather than trusted into a file path,
   so an unknown one falls through to the 404 handler. */
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

app.get('/blog', (req, res) =>
  res.sendFile(path.join(VIEWS_DIR, 'blog.html')));

app.get('/guide', (req, res) =>
  res.sendFile(path.join(VIEWS_DIR, 'guide.html')));

app.get('/blog/category/:cat', (req, res, next) => {
  if (!BLOG_CATEGORIES.includes(req.params.cat)) return next();
  res.sendFile(path.join(VIEWS_DIR, `blog-category-${req.params.cat}.html`));
});

app.get('/blog/:slug', (req, res, next) => {
  if (!BLOG_POSTS.includes(req.params.slug)) return next();
  res.sendFile(path.join(VIEWS_DIR, `blog-${req.params.slug}.html`));
});

// Features overview — the page the Features nav tab links to.
app.get('/features', (req, res) =>
  res.sendFile(path.join(VIEWS_DIR, 'features.html')));

/* Feature pages — one per platform capability. */
for (const slug of [
  'ai-quantity-takeoff',
  'ai-document-analysis',
  'ai-risk-compliance-analyser',
  'csi-cost-estimation',
  'bid-packages-leveling',
  'ai-bid-proposal',
]) {
  app.get(`/${slug}`, (req, res) => res.sendFile(path.join(VIEWS_DIR, `${slug}.html`)));
}

app.get('/go-no-go', noCache, (req, res) =>
  res.sendFile(path.join(VIEWS_DIR, 'go-no-go.html')));

// Descriptive alias for campaign links and SEO.
app.get('/free-go-no-go-analysis', (req, res) => res.redirect(301, '/go-no-go'));

app.use('/api/go-no-go', require('./api/routes'));

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
app.listen(PORT, () => console.log(`BidcoreAI running on http://localhost:${PORT}`));
