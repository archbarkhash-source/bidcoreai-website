/**
 * api/secretbox.js — encryption at rest for visitors' SAM.gov API keys.
 *
 * The key has to be recoverable (we send it to SAM.gov on every search), so
 * hashing isn't an option — it's encrypted with AES-256-GCM under a key derived
 * from this site's SECRET_KEY. GCM is authenticated, so a tampered ciphertext
 * fails to decrypt rather than silently returning garbage.
 *
 * The plaintext is never returned by the API: responses carry only the last 4
 * characters, so a stolen session token can search on the visitor's behalf but
 * cannot walk away with the credential itself.
 *
 * Rotating SECRET_KEY invalidates stored keys. That surfaces as "add your key
 * again", not a crash — decrypt() returns null and callers treat it as absent.
 */
const crypto = require('crypto');

function keyMaterial() {
  const secret = process.env.SECRET_KEY || process.env.SESSION_SECRET || '';
  if (!secret) {
    throw Object.assign(
      new Error('SECRET_KEY is not set — cannot store API keys securely.'),
      { statusCode: 503 },
    );
  }
  return crypto.createHash('sha256').update(secret).digest(); // 32 bytes
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyMaterial(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

function decrypt(payload) {
  if (!payload) return null;
  try {
    const [version, ivB64, tagB64, dataB64] = String(payload).split('.');
    if (version !== 'v1') return null;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm', keyMaterial(), Buffer.from(ivB64, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch (e) {
    console.warn('[go-no-go] stored API key could not be decrypted:', e.message);
    return null;
  }
}

/** All the API ever discloses about a stored key. */
const hint = (plaintext) => String(plaintext).slice(-4);

module.exports = { encrypt, decrypt, hint };
