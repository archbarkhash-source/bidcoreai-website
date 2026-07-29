/**
 * api/samgov.js — SAM.gov Opportunities API client.
 *
 * Read-only public solicitation data, always on the VISITOR's own API key
 * (sam.gov → Account Details → API Key). This site never carries a shared key,
 * so free traffic can't exhaust anyone else's quota and every request is
 * attributable to the person who made it.
 *
 * A 429 trips a per-key cooldown: retrying a rate-limit response a few seconds
 * later is itself a small retry-storm, so "respect the limit" is the only
 * behaviour. Keyed per API key because quotas are per key — one visitor burning
 * theirs must not freeze the site for everyone.
 */
const crypto = require('crypto');

const SEARCH_URL = 'https://api.sam.gov/opportunities/v2/search';
const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000;

const cooldowns = new Map(); // keyId -> epoch ms until which calls are refused

const keyId = (k) => crypto.createHash('sha256').update(String(k)).digest('hex').slice(0, 12);

function cooldownRemaining(apiKey) {
  const until = cooldowns.get(keyId(apiKey));
  if (until && Date.now() < until) return Math.ceil((until - Date.now()) / 1000);
  return null;
}

/** SAM.gov wants mm/dd/yyyy and rejects windows wider than a year. */
function samDate(d) {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getUTCFullYear()}`;
}

/** SAM.gov dates come back mm/dd/yyyy or ISO; normalise to YYYY-MM-DD. */
function isoDate(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  const slash = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (slash) return `${slash[3]}-${slash[1]}-${slash[2]}`;
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}

/** One SAM.gov record, flattened to the fields the scoring rubric reads. */
function shape(opp) {
  const pop = opp.placeOfPerformance || {};
  const poc = Array.isArray(opp.pointOfContact) ? opp.pointOfContact[0] : null;
  return {
    notice_id: opp.noticeId || null,
    solicitation_number: opp.solicitationNumber || null,
    title: opp.title || null,
    agency: opp.fullParentPathName ? String(opp.fullParentPathName).split('.').pop().trim() : (opp.organizationName || null),
    agency_full: opp.fullParentPathName || null,
    solicitation_type: opp.type || opp.baseType || null,
    solicitation_set_aside: opp.typeOfSetAside || null,
    solicitation_set_aside_description: opp.typeOfSetAsideDescription || null,
    solicitation_naics: opp.naicsCode || null,
    psc_code: opp.classificationCode || null,
    solicitation_posted_date: isoDate(opp.postedDate),
    solicitation_due_date: isoDate(opp.responseDeadLine),
    place_of_performance_city: (pop.city && pop.city.name) || null,
    place_of_performance_state: (pop.state && pop.state.code) || null,
    place_of_performance_zip: pop.zip || null,
    point_of_contact: poc ? { name: poc.fullName || null, email: poc.email || null } : null,
    ui_link: opp.uiLink || null,
  };
}

async function request(params, apiKey) {
  const wait = cooldownRemaining(apiKey);
  if (wait) {
    throw Object.assign(
      new Error(`SAM.gov rate limit reached for your key — try again in about ${Math.ceil(wait / 60)} minute(s).`),
      { statusCode: 429 },
    );
  }

  const url = new URL(SEARCH_URL);
  Object.entries({ ...params, api_key: apiKey }).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (e) {
    throw Object.assign(new Error(`Could not reach SAM.gov: ${e.message}`), { statusCode: 502 });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After'));
    cooldowns.set(keyId(apiKey), Date.now() + (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : DEFAULT_COOLDOWN_MS));
    throw Object.assign(
      new Error('SAM.gov rate limit reached for your API key. It resets on their schedule — usually within the hour.'),
      { statusCode: 429 },
    );
  }
  // api.data.gov (SAM.gov's gateway) answers a bad or unrecognised key with
  // 403 — and, observed in practice, 404 as well. Neither is worth showing as a
  // status code: to the visitor both mean the same thing, and "SAM.gov returned
  // 404" tells them nothing they can act on.
  if ([400, 401, 403, 404].includes(res.status)) {
    throw Object.assign(
      new Error("SAM.gov didn't accept that API key. Copy it again from sam.gov → Account Details → API Key — it's a long string, easy to truncate."),
      { statusCode: 400 },
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw Object.assign(
      new Error(`SAM.gov returned ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`),
      { statusCode: 502 },
    );
  }
  return res.json();
}

/**
 * Live search. `keyword` matches the notice title (SAM.gov's `title` filter);
 * naics/set-aside/agency narrow it further. Only active notices are returned —
 * a closed solicitation isn't a bid decision anyone needs help with.
 */
async function search({ keyword, naics, agency, setAside, solicitationNumber, limit = 20 }, apiKey) {
  const to = new Date();
  const from = new Date(to.getTime() - 364 * 86400000); // SAM.gov's widest legal window

  const body = await request({
    postedFrom: samDate(from),
    postedTo: samDate(to),
    limit: Math.max(1, Math.min(Number(limit) || 20, 50)),
    offset: 0,
    title: keyword || undefined,
    ncode: naics || undefined,
    organizationName: agency || undefined,
    typeOfSetAside: setAside || undefined,
    solnum: solicitationNumber || undefined,
    ptype: 'o,k,r,p', // Solicitation, Combined Synopsis, Sources Sought, Presolicitation
  }, apiKey);

  const records = Array.isArray(body.opportunitiesData) ? body.opportunitiesData : [];
  return { results: records.map(shape), total: body.totalRecords || records.length };
}

/** Cheapest possible call — used to verify a key the moment it's pasted. */
async function verifyKey(apiKey) {
  try {
    await search({ limit: 1 }, apiKey);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { search, verifyKey, shape, isoDate };
