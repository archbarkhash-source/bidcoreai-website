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
   404 — clean page not found
───────────────────────────────────────*/
app.use((req, res) => {
  res.status(404).sendFile(path.join(VIEWS_DIR, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BidcoreAI running on http://localhost:${PORT}`));
