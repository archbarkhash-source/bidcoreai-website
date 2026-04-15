/**
 * BidcoreAI · server.js
 * Express server that:
 *  - Serves the static site (index.html, style.css, script.js, images)
 *  - Exposes POST /api/send for form submissions
 *  - Sends email via Resend (preferred) OR SMTP (nodemailer fallback)
 *
 * Environment variables (set in Render dashboard or .env):
 *   RESEND_API_KEY        — Resend API key (get free at resend.com)
 *   RESEND_FROM_EMAIL     — e.g. noreply@bidcoreai.com (must be verified domain)
 *   SMTP_HOST             — e.g. smtp.gmail.com or mail.bidcoreai.com
 *   SMTP_PORT             — e.g. 465 (SSL) or 587 (STARTTLS)
 *   SMTP_USER             — e.g. barkha@bidcoreai.com
 *   SMTP_PASSWORD         — your SMTP password / app password
 *   SMTP_FROM_NAME        — e.g. BidcoreAI
 *   TO_EMAIL              — where to receive form submissions (default: barkha@bidcoreai.com)
 *   PORT                  — server port (Render sets this automatically)
 */

require('dotenv').config();
const express = require('express');
const path    = require('path');
const app     = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const TO_EMAIL = process.env.TO_EMAIL || 'barkha@bidcoreai.com';

/* ── Email via Resend ── */
async function sendViaResend(subject, html, fromEmail){
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.RESEND_FROM_EMAIL || fromEmail || 'noreply@bidcoreai.com';
  if(!apiKey) throw new Error('RESEND_API_KEY not set');
  const res = await fetch('https://api.resend.com/emails', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
    body: JSON.stringify({ from, to:[TO_EMAIL], subject, html })
  });
  const json = await res.json();
  if(!res.ok) throw new Error(json.message || 'Resend error');
  return json;
}

/* ── Email via SMTP (nodemailer) ── */
async function sendViaSMTP(subject, html){
  const nodemailer = require('nodemailer');
  const transport  = nodemailer.createTransport({
    host   : process.env.SMTP_HOST,
    port   : parseInt(process.env.SMTP_PORT || '465'),
    secure : parseInt(process.env.SMTP_PORT || '465') === 465,
    auth   : {
      user : process.env.SMTP_USER,
      pass : process.env.SMTP_PASSWORD
    }
  });
  const fromName  = process.env.SMTP_FROM_NAME || 'BidcoreAI';
  const fromEmail = process.env.SMTP_USER;
  await transport.sendMail({
    from   : `"${fromName}" <${fromEmail}>`,
    to     : TO_EMAIL,
    subject,
    html
  });
}

/* ── Build HTML email from payload ── */
function buildHtml(payload){
  const rows = Object.entries(payload)
    .filter(([k])=>k!=='subject')
    .map(([k,v])=>`
      <tr>
        <td style="padding:7px 12px;background:#EDF2F8;font-weight:700;font-size:12px;color:#0B3C5D;white-space:nowrap;border-bottom:1px solid #D5E3EE;text-transform:uppercase;letter-spacing:.05em">${k.replace(/_/g,' ')}</td>
        <td style="padding:7px 12px;font-size:13px;color:#162E42;border-bottom:1px solid #D5E3EE">${String(v||'—').replace(/\n/g,'<br>')}</td>
      </tr>`).join('');
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family:'Plus Jakarta Sans',Arial,sans-serif;background:#F7FAFD;margin:0;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #D5E3EE">
    <div style="background:#061F32;padding:18px 24px;display:flex;align-items:center;gap:10px">
      <span style="font-family:Georgia,serif;font-size:18px;font-weight:800;color:#fff">BidcoreAI</span>
      <span style="font-size:11px;color:rgba(255,255,255,.4);margin-left:auto">New Form Submission</span>
    </div>
    <div style="padding:20px 24px">
      <div style="font-family:Georgia,serif;font-size:20px;font-weight:800;color:#0B3C5D;margin-bottom:16px">${payload.subject||'New Submission'}</div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #D5E3EE;border-radius:8px;overflow:hidden">${rows}</table>
    </div>
    <div style="background:#EDF2F8;padding:12px 24px;font-size:11px;color:#7A9BB5;text-align:center">
      BidcoreAI · barkha@bidcoreai.com · This email was sent from the BidcoreAI contact form.
    </div>
  </div>
</body></html>`;
}

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits:{ fileSize: 25*1024*1024 } });

app.post('/api/send-with-files', upload.array('files', 20), async (req, res) => {
  try {
    const meta = JSON.parse(req.body.meta || '{}');
    const subject = meta.subject || 'Takeoff Service Request';
    const html = buildHtml(meta);

    // Block if total file size exceeds 20MB
    const totalBytes = (req.files || []).reduce((sum, f) => sum + f.size, 0);
    if(totalBytes > 20 * 1024 * 1024){
      return res.status(413).json({ success:false, tooLarge:true });
    }

    // Build attachments array for nodemailer
    const attachments = (req.files || []).map(f => ({
      filename: f.originalname,
      content: f.buffer,
      contentType: f.mimetype
    }));

    if(process.env.SMTP_HOST && process.env.SMTP_USER){
      // SMTP SSL — first priority
      const nodemailer = require('nodemailer');
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT||'465'),
        secure: parseInt(process.env.SMTP_PORT||'465')===465,
        auth:{ user:process.env.SMTP_USER, pass:process.env.SMTP_PASSWORD }
      });
      await transport.sendMail({
        from:`"${process.env.SMTP_FROM_NAME||'BidcoreAI'}" <${process.env.SMTP_USER}>`,
        to: TO_EMAIL, subject, html, attachments
      });
    } else if(process.env.RESEND_API_KEY){
      // Resend — second priority fallback
      const apiKey = process.env.RESEND_API_KEY;
      const from = process.env.RESEND_FROM_EMAIL || 'noreply@bidcoreai.com';
      const resendAttachments = (req.files || []).map(f => ({
        filename: f.originalname,
        content: f.buffer.toString('base64')
      }));
      const r = await fetch('https://api.resend.com/emails', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},
        body: JSON.stringify({ from, to:[TO_EMAIL], subject, html, attachments: resendAttachments })
      });
      const j = await r.json();
      if(!r.ok) throw new Error(j.message);
    }
    res.json({ success:true });
  } catch(e){
    console.error('[BidcoreAI] File send error:', e.message);
    res.status(500).json({ success:false, error:e.message });
  }
});

/* ── POST /api/send ── */
app.post('/api/send', async (req, res)=>{
  const payload = req.body || {};
  const subject = payload.subject || 'BidcoreAI Form Submission';
  const html    = buildHtml(payload);

  // Try Resend first, fall back to SMTP
  try {
    if(process.env.RESEND_API_KEY){
      await sendViaResend(subject, html, process.env.RESEND_FROM_EMAIL);
    } else if(process.env.SMTP_HOST && process.env.SMTP_USER){
      await sendViaSMTP(subject, html);
    } else {
      // No credentials — log to console (useful in dev)
      console.log('[BidcoreAI] Form submission (no mailer configured):', JSON.stringify(payload, null, 2));
    }
    return res.json({ success: true });
  } catch(err){
    console.error('[BidcoreAI] Email send error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ── SPA fallback ── */
app.get('*', (req, res)=>{
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`BidcoreAI server running on port ${PORT}`));
