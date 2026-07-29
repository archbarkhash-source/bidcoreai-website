/**
 * api/geocode.js — address → lat/lng, for the "Distance from Office" criterion.
 *
 * OpenStreetMap Nominatim: free, no key, and generous enough for this page's
 * volume. Its usage policy requires an identifying User-Agent and asks for at
 * most one request per second, so results are cached in-process and the office
 * address is geocoded once at save time rather than on every score.
 *
 * Failure is never fatal: a null result means the Distance criterion scores as
 * "no office on file — neutral", which is exactly what it should say.
 */
const CACHE = new Map();
const MAX_CACHE = 500;

const UA = 'BidcoreAI-FreeGoNoGo/1.0 (+https://bidcoreai.com)';

async function geocode(address) {
  const key = String(address || '').trim().toLowerCase();
  if (!key) return null;
  if (CACHE.has(key)) return CACHE.get(key);

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', key);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = await res.json();
    const hit = Array.isArray(body) && body[0];
    const coords = hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;

    // Naive bounded cache: clear wholesale rather than track recency — entries
    // are cheap to re-fetch and this only exists to respect the rate limit.
    if (CACHE.size >= MAX_CACHE) CACHE.clear();
    CACHE.set(key, coords);
    return coords;
  } catch (e) {
    console.warn('[go-no-go] geocode failed:', e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** City/state of a SAM.gov notice — enough precision for a mobilisation call. */
async function geocodePlace(city, state) {
  const parts = [city, state, 'USA'].filter(Boolean);
  if (parts.length < 2) return null;
  return geocode(parts.join(', '));
}

module.exports = { geocode, geocodePlace };
