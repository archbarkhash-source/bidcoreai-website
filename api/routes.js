/**
 * api/routes.js — the free Go/No-Go API, mounted at /api/go-no-go.
 *
 * Everything a visitor can do without a BidcoreAI account:
 *   POST /google | /request-code | /verify-code   sign in
 *   GET  /me                                      workspace + setup state
 *   PUT  /profile                                 company intelligence
 *   PUT|DELETE /api-key                           their SAM.gov key
 *   GET  /search                                  live SAM.gov, on their key
 *   POST /score                                   the 12-criterion analysis
 *
 * Contracts kept deliberately boring: every response is JSON, every failure is
 * `{ error: "<sentence a human can act on>" }` with a real status code, so the
 * page never has to guess what went wrong.
 */
const express = require('express');
const db = require('./db');
const auth = require('./auth');
const secretbox = require('./secretbox');
const samgov = require('./samgov');
const geocodeLib = require('./geocode');
const {
  computeQuickScore, isConstructionNaics, BANDS, bandsSummary,
  SET_ASIDE_OPTIONS, CONTRACT_TYPE_OPTIONS, STATE_OPTIONS, NAICS_OPTIONS,
} = require('./scoring');

const router = express.Router();

// Daily per-workspace caps — generous for a genuine evaluation, low enough that
// the page can't be turned into a free SAM.gov proxy.
const MAX_SEARCHES_PER_DAY = 60;
const MAX_SCORES_PER_DAY = 40;

// Only the US has a live connector. The rest are listed so the choice is
// honest — a visitor from Canada learns where they stand instead of pasting a
// key into something that will never call it.
const COUNTRIES = [
  { code: 'US', name: 'United States', portal: 'SAM.gov', connected: true },
  { code: 'CA', name: 'Canada', portal: 'CanadaBuys', connected: false },
  { code: 'UK', name: 'United Kingdom', portal: 'Find a Tender', connected: false },
  { code: 'AU', name: 'Australia', portal: 'AusTender', connected: false },
  { code: 'IN', name: 'India', portal: 'GeM / CPPP', connected: false },
];

const isConnectedCountry = (code) =>
  COUNTRIES.some((c) => c.code === String(code || 'US').toUpperCase() && c.connected);

const asList = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
const splitList = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : asList(v));
const numberOrNull = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

/** Wrap an async handler so a rejection reaches the error middleware. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function loadProfile(workspaceId) {
  const ws = await db.one('SELECT * FROM gg_workspaces WHERE id = $1', [workspaceId]);
  const caps = await db.query('SELECT * FROM gg_capabilities WHERE workspace_id = $1 ORDER BY id DESC', [workspaceId]);
  const perf = await db.query('SELECT * FROM gg_past_performance WHERE workspace_id = $1 ORDER BY id DESC', [workspaceId]);
  return { ...ws, capabilities: caps.rows, past_performance: perf.rows };
}

/**
 * What's set up and what isn't. The API key is the only hard requirement —
 * without it nothing can be fetched at all. Everything else changes how
 * precise the score is, and says so.
 */
function readiness(profile) {
  const has = (v) => Array.isArray(v) && v.length > 0;
  // A key stored against a portal with no connector (Canada, UK…) must not
  // count as "ready": there is nothing to search with it, and letting it
  // unlock the workspace would send a CanadaBuys key to SAM.gov and produce a
  // baffling rejection.
  const usable = !!profile.api_key_encrypted && isConnectedCountry(profile.country_code);
  return {
    api_key: {
      complete: usable,
      blocking: true,
      label: 'SAM.gov API key',
      hint: 'Required — searches run on your own key.',
    },
    naics: {
      complete: has(profile.naics_codes) || profile.capabilities.length > 0,
      blocking: false,
      label: 'NAICS codes',
      hint: 'The single biggest input to the score.',
    },
    certifications: {
      complete: has(profile.certifications),
      blocking: false,
      label: 'Set-asides',
      hint: 'Decides whether you can bid set-aside work at all.',
    },
    office: {
      complete: profile.office_lat != null,
      blocking: false,
      label: 'Office address',
      hint: 'Scores mobilisation distance.',
    },
    past_performance: {
      complete: profile.past_performance.length > 0,
      blocking: false,
      label: 'Past performance',
      hint: 'Scores similarity to work you have delivered.',
    },
    can_search: usable,
  };
}

function publicProfile(profile) {
  return {
    email: profile.email,
    company: profile.company,
    name: profile.name,
    country_code: profile.country_code || 'US',
    naics_codes: profile.naics_codes || [],
    psc_codes: profile.psc_codes || [],
    states_served: profile.states_served || [],
    target_agencies: profile.target_agencies || [],
    certifications: profile.certifications || [],
    contract_types: profile.contract_types || [],
    office_address: profile.office_address,
    bonding_capacity: profile.bonding_capacity,
    project_value_min: profile.project_value_min,
    project_value_max: profile.project_value_max,
    min_bid_days: profile.min_bid_days,
    has_api_key: !!profile.api_key_encrypted,
    api_key_hint: profile.api_key_hint,
    api_key_status: profile.api_key_status,
    capabilities: (profile.capabilities || []).map((c) => ({
      id: c.id, title: c.title, naics_codes: c.naics_codes || [],
    })),
    past_performance: (profile.past_performance || []).map((p) => ({
      id: p.id, title: p.title, agency: p.agency, contract_value: p.contract_value,
    })),
  };
}

/**
 * Today's counters, as Postgres sees them.
 *
 * This was previously computed in JavaScript by comparing usage_day against
 * `new Date().toISOString()`. node-pg hands back a DATE as a Date at LOCAL
 * midnight, so converting it to an ISO string shifts it a day in any timezone
 * ahead of UTC — the comparison never matched, and /me reported 0 while the
 * counter was genuinely climbing. The database already knows what day it is;
 * asking it removes the class of bug rather than the instance.
 */
async function currentUsage(workspaceId) {
  const row = await db.one(
    `SELECT CASE WHEN usage_day = CURRENT_DATE THEN searches_today ELSE 0 END AS searches,
            CASE WHEN usage_day = CURRENT_DATE THEN scores_today   ELSE 0 END AS scores
       FROM gg_workspaces WHERE id = $1`,
    [workspaceId],
  );
  return {
    searches_today: row ? Number(row.searches) : 0,
    searches_limit: MAX_SEARCHES_PER_DAY,
    scores_today: row ? Number(row.scores) : 0,
    scores_limit: MAX_SCORES_PER_DAY,
  };
}

/** Bump a daily counter, resetting it lazily on the first call of a new day. */
async function bumpUsage(workspace, column, limit, label) {
  const live = await currentUsage(workspace.id);
  const used = column === 'searches_today' ? live.searches_today : live.scores_today;

  if (used >= limit) {
    throw auth.httpError(
      429,
      `You've used all ${limit} free ${label} for today. They reset tomorrow — or create a BidcoreAI account for unlimited access.`,
    );
  }
  // RETURNING the new totals so the caller can hand them straight back to the
  // page. Without this the counters only refreshed on a reload, so a visitor
  // watched them sit at 0 while spending their allowance.
  const { rows } = await db.query(
    `UPDATE gg_workspaces
        SET usage_day = CURRENT_DATE,
            searches_today = CASE WHEN usage_day = CURRENT_DATE THEN searches_today ELSE 0 END + $2,
            scores_today   = CASE WHEN usage_day = CURRENT_DATE THEN scores_today   ELSE 0 END + $3
      WHERE id = $1
      RETURNING searches_today, scores_today`,
    [workspace.id, column === 'searches_today' ? 1 : 0, column === 'scores_today' ? 1 : 0],
  );
  return {
    searches_today: rows[0] ? rows[0].searches_today : 0,
    searches_limit: MAX_SEARCHES_PER_DAY,
    scores_today: rows[0] ? rows[0].scores_today : 0,
    scores_limit: MAX_SCORES_PER_DAY,
  };
}

async function decryptedKey(workspace) {
  if (workspace.api_key_encrypted && !isConnectedCountry(workspace.country_code)) {
    const meta = COUNTRIES.find((c) => c.code === String(workspace.country_code).toUpperCase());
    throw auth.httpError(
      428,
      `${meta ? meta.portal : 'That portal'} has no live integration yet. Switch to United States (SAM.gov) to run an analysis.`,
    );
  }
  const key = secretbox.decrypt(workspace.api_key_encrypted);
  if (!key) {
    // 428 Precondition Required: they ARE signed in, they just haven't added
    // the one thing this page cannot work without — which the UI turns into
    // "add your key", not "sign in again".
    throw auth.httpError(428, 'Add your SAM.gov API key first — searches run on your own key.');
  }
  return key;
}

function logEvent(workspaceId, event, detail) {
  // Lead telemetry. Deliberately fire-and-forget: an analytics insert must
  // never fail the request the visitor actually asked for.
  db.query('INSERT INTO gg_events (workspace_id, event, detail) VALUES ($1, $2, $3)',
    [workspaceId || null, event, detail ? JSON.stringify(detail) : null])
    .catch((e) => console.warn('[go-no-go] event log failed:', e.message));
}

// ── Public config (no session needed) ────────────────────────────────────────

router.get('/config', (req, res) => {
  res.json({
    countries: COUNTRIES,
    // The UI must offer exactly these strings — see SET_ASIDE_OPTIONS.
    set_asides: SET_ASIDE_OPTIONS,
    contract_types: CONTRACT_TYPE_OPTIONS,
    states: STATE_OPTIONS,
    naics: NAICS_OPTIONS,
    // The page renders whatever these are rather than hardcoding a copy.
    bands: { ...BANDS, summary: bandsSummary() },
    google_client_id: (process.env.GOOGLE_CLIENT_ID || '').trim() || null,
    app_url: process.env.APP_URL || 'https://app.bidcoreai.com',
    configured: db.isConfigured(),
  });
});

// ── Sign in ──────────────────────────────────────────────────────────────────

router.post('/google', wrap(async (req, res) => {
  const { token, workspace } = await auth.googleSignIn({
    credential: req.body.credential,
    source: req.body.source || req.get('referer') || null,
  });
  const profile = await loadProfile(workspace.id);
  logEvent(workspace.id, 'sign_in', { provider: 'google' });
  res.json({ session_token: token, profile: publicProfile(profile), readiness: readiness(profile) });
}));

router.post('/request-code', wrap(async (req, res) => {
  const result = await auth.requestCode({
    email: req.body.email,
    company: req.body.company,
    source: req.body.source || req.get('referer') || null,
  });
  res.json(result);
}));

router.post('/verify-code', wrap(async (req, res) => {
  const { token, workspace } = await auth.verifyCode({ email: req.body.email, code: req.body.code });
  const profile = await loadProfile(workspace.id);
  logEvent(workspace.id, 'sign_in', { provider: 'email' });
  res.json({ session_token: token, profile: publicProfile(profile), readiness: readiness(profile) });
}));

router.post('/sign-out', auth.requireSession, wrap(async (req, res) => {
  await auth.signOut(req.workspace.id);
  res.json({ ok: true });
}));

// ── Workspace ────────────────────────────────────────────────────────────────

router.get('/me', auth.requireSession, wrap(async (req, res) => {
  const profile = await loadProfile(req.workspace.id);
  res.json({
    profile: publicProfile(profile),
    readiness: readiness(profile),
    usage: await currentUsage(req.workspace.id),
  });
}));

router.put('/profile', auth.requireSession, wrap(async (req, res) => {
  const b = req.body || {};
  const address = typeof b.office_address === 'string' ? b.office_address.trim() : undefined;

  // Geocode once, here, rather than on every score — Nominatim asks callers to
  // keep their rate down, and an address changes far less often than it's used.
  let lat = null;
  let lng = null;
  if (address) {
    const coords = await geocodeLib.geocode(address);
    if (coords) { lat = coords.lat; lng = coords.lng; }
  }

  await db.query(
    `UPDATE gg_workspaces SET
        naics_codes       = COALESCE($2::jsonb, naics_codes),
        psc_codes         = COALESCE($3::jsonb, psc_codes),
        states_served     = COALESCE($4::jsonb, states_served),
        target_agencies   = COALESCE($5::jsonb, target_agencies),
        certifications    = COALESCE($6::jsonb, certifications),
        contract_types    = COALESCE($16::jsonb, contract_types),
        office_address    = COALESCE($7, office_address),
        office_lat        = CASE WHEN $7 IS NULL THEN office_lat ELSE $8 END,
        office_lng        = CASE WHEN $7 IS NULL THEN office_lng ELSE $9 END,
        bonding_capacity  = COALESCE($10, bonding_capacity),
        project_value_min = COALESCE($11, project_value_min),
        project_value_max = COALESCE($12, project_value_max),
        min_bid_days      = COALESCE($13, min_bid_days),
        company           = COALESCE($14, company),
        name              = COALESCE($15, name)
      WHERE id = $1`,
    [
      req.workspace.id,
      b.naics_codes === undefined ? null : JSON.stringify(splitList(b.naics_codes)),
      b.psc_codes === undefined ? null : JSON.stringify(splitList(b.psc_codes)),
      b.states_served === undefined ? null : JSON.stringify(splitList(b.states_served).map((s) => s.toUpperCase())),
      b.target_agencies === undefined ? null : JSON.stringify(splitList(b.target_agencies)),
      b.certifications === undefined ? null : JSON.stringify(splitList(b.certifications)),
      address === undefined || address === '' ? null : address,
      lat, lng,
      numberOrNull(b.bonding_capacity),
      numberOrNull(b.project_value_min),
      numberOrNull(b.project_value_max),
      numberOrNull(b.min_bid_days),
      b.company ? String(b.company).slice(0, 255) : null,
      b.name ? String(b.name).slice(0, 255) : null,
      b.contract_types === undefined ? null : JSON.stringify(splitList(b.contract_types)),
    ],
  );

  const profile = await loadProfile(req.workspace.id);
  res.json({ profile: publicProfile(profile), readiness: readiness(profile) });
}));

router.post('/capabilities', auth.requireSession, wrap(async (req, res) => {
  const title = String(req.body.title || '').trim();
  if (!title) throw auth.httpError(400, 'Give the capability a name.');
  await db.query(
    'INSERT INTO gg_capabilities (workspace_id, title, naics_codes) VALUES ($1, $2, $3::jsonb)',
    [req.workspace.id, title.slice(0, 200), JSON.stringify(splitList(req.body.naics_codes))],
  );
  const profile = await loadProfile(req.workspace.id);
  res.json({ profile: publicProfile(profile), readiness: readiness(profile) });
}));

router.delete('/capabilities/:id', auth.requireSession, wrap(async (req, res) => {
  await db.query('DELETE FROM gg_capabilities WHERE id = $1 AND workspace_id = $2', [req.params.id, req.workspace.id]);
  const profile = await loadProfile(req.workspace.id);
  res.json({ profile: publicProfile(profile), readiness: readiness(profile) });
}));

router.post('/past-performance', auth.requireSession, wrap(async (req, res) => {
  const title = String(req.body.title || '').trim();
  if (!title) throw auth.httpError(400, 'Give the project a name.');
  await db.query(
    `INSERT INTO gg_past_performance (workspace_id, title, agency, naics_code, contract_value)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      req.workspace.id, title.slice(0, 200),
      req.body.agency ? String(req.body.agency).slice(0, 200) : null,
      req.body.naics_code ? String(req.body.naics_code).slice(0, 10) : null,
      numberOrNull(req.body.contract_value),
    ],
  );
  const profile = await loadProfile(req.workspace.id);
  res.json({ profile: publicProfile(profile), readiness: readiness(profile) });
}));

router.delete('/past-performance/:id', auth.requireSession, wrap(async (req, res) => {
  await db.query('DELETE FROM gg_past_performance WHERE id = $1 AND workspace_id = $2', [req.params.id, req.workspace.id]);
  const profile = await loadProfile(req.workspace.id);
  res.json({ profile: publicProfile(profile), readiness: readiness(profile) });
}));

// ── SAM.gov key ──────────────────────────────────────────────────────────────

router.put('/api-key', auth.requireSession, wrap(async (req, res) => {
  const country = String(req.body.country_code || 'US').toUpperCase();
  const meta = COUNTRIES.find((c) => c.code === country);
  if (!meta) throw auth.httpError(400, 'Choose a supported country.');

  const apiKey = String(req.body.api_key || '').trim();
  if (!apiKey) throw auth.httpError(400, 'Paste your API key.');

  if (!meta.connected) {
    // Stored but honestly labelled: no connector exists to verify it against.
    await db.query(
      `UPDATE gg_workspaces SET country_code = $2, api_key_encrypted = $3, api_key_hint = $4,
              api_key_status = 'no_connector', api_key_checked_at = NOW() WHERE id = $1`,
      [req.workspace.id, country, secretbox.encrypt(apiKey), secretbox.hint(apiKey)],
    );
    const stored = await loadProfile(req.workspace.id);
    return res.json({
      verified: false,
      error: `${meta.portal} has no live integration yet — your key is saved but not used.`,
      profile: publicProfile(stored), readiness: readiness(stored),
    });
  }

  // Verified at save time: on this page an unusable key is the difference
  // between a working demo and a dead end, so it's checked immediately rather
  // than behind a separate button the visitor might never press.
  const check = await samgov.verifyKey(apiKey);
  if (!check.ok) {
    throw auth.httpError(400, check.error || 'SAM.gov rejected this key.');
  }

  await db.query(
    `UPDATE gg_workspaces SET country_code = $2, api_key_encrypted = $3, api_key_hint = $4,
            api_key_status = 'ok', api_key_checked_at = NOW() WHERE id = $1`,
    [req.workspace.id, country, secretbox.encrypt(apiKey), secretbox.hint(apiKey)],
  );
  logEvent(req.workspace.id, 'api_key_linked', { country });

  const profile = await loadProfile(req.workspace.id);
  res.json({ verified: true, profile: publicProfile(profile), readiness: readiness(profile) });
}));

router.delete('/api-key', auth.requireSession, wrap(async (req, res) => {
  await db.query(
    `UPDATE gg_workspaces SET api_key_encrypted = NULL, api_key_hint = NULL,
            api_key_status = NULL, api_key_checked_at = NULL WHERE id = $1`,
    [req.workspace.id],
  );
  const profile = await loadProfile(req.workspace.id);
  res.json({ profile: publicProfile(profile), readiness: readiness(profile) });
}));

// ── Search + score ───────────────────────────────────────────────────────────

router.get('/search', auth.requireSession, wrap(async (req, res) => {
  const key = await decryptedKey(req.workspace);
  const usage = await bumpUsage(req.workspace, 'searches_today', MAX_SEARCHES_PER_DAY, 'searches');

  const q = String(req.query.q || '').trim();
  // One search box. A 6-digit number is a NAICS code, a longer alphanumeric
  // token is a solicitation number, anything else is a keyword — so the visitor
  // never has to know which field their text belongs in.
  // 50 is SAM.gov's per-request maximum. One search costs the visitor the same
  // single API call whether it returns 20 rows or 50, so take the 50 and let
  // the page paginate them — five pages of results for one unit of quota.
  const params = { limit: 50 };
  if (/^\d{6}$/.test(q)) params.naics = q;
  else if (/^[A-Za-z0-9][A-Za-z0-9-]{7,}$/.test(q) && /\d/.test(q)) params.solicitationNumber = q;
  else if (q) params.keyword = q;
  if (req.query.naics) params.naics = String(req.query.naics).trim();
  if (req.query.set_aside) params.setAside = String(req.query.set_aside).trim();

  const { results, total } = await samgov.search(params, key);

  // This page is for construction bidding, so a notice outside that is noise —
  // "HVAC training" and "facilities support services" match the same keywords
  // and are not work a contractor bids. Sector 23 plus whatever codes this
  // company actually holds; SAM.gov cannot express that filter itself, so it
  // happens here.
  const profile = await loadProfile(req.workspace.id);
  const own = (profile.naics_codes || []).concat(
    (profile.capabilities || []).flatMap((c) => c.naics_codes || []),
  );
  const construction = results.filter((r) => isConstructionNaics(r.solicitation_naics, own));

  logEvent(req.workspace.id, 'search', {
    q, results: construction.length, filtered_out: results.length - construction.length,
  });
  res.json({
    results: construction,
    total: construction.length,
    filtered_out: results.length - construction.length,
    usage,
  });
}));

router.post('/score', auth.requireSession, wrap(async (req, res) => {
  await decryptedKey(req.workspace); // same gate as search: no key, no analysis
  const usage = await bumpUsage(req.workspace, 'scores_today', MAX_SCORES_PER_DAY, 'Go/No-Go analyses');

  const o = req.body || {};
  if (!o.title && !o.solicitation_number) {
    throw auth.httpError(400, 'Pick an opportunity to analyse.');
  }

  const profile = await loadProfile(req.workspace.id);

  // Distance needs the notice's coordinates; only worth fetching when there is
  // an office to measure from.
  let opportunity = { ...o, solicitation_value_estimate: numberOrNull(o.solicitation_value_estimate) };
  if (profile.office_lat != null && (o.place_of_performance_city || o.place_of_performance_state)) {
    const coords = await geocodeLib.geocodePlace(o.place_of_performance_city, o.place_of_performance_state);
    if (coords) {
      opportunity.place_of_performance_lat = coords.lat;
      opportunity.place_of_performance_lng = coords.lng;
    }
  }

  const result = computeQuickScore(opportunity, profile);
  logEvent(req.workspace.id, 'score', {
    solicitation: o.solicitation_number || null,
    score: result.overall_score,
    recommendation: result.recommendation,
  });

  res.json({ result, readiness: readiness(profile), usage });
}));

// ── Capture pipeline ─────────────────────────────────────────────────────────
// The same stages the BidcoreAI app uses, so someone who later moves up isn't
// learning a second vocabulary for the same thing.

// How long a card may sit in triage before it clears itself. Only the first
// stage expires: anything the visitor deliberately advanced is a commitment,
// and deleting a commitment because a month passed would be indefensible.
const ANALYSED_TTL_DAYS = Number(process.env.ANALYSED_TTL_DAYS) || 30;

const STAGES = [
  { key: 'analysed', label: 'Analysed', expires: ANALYSED_TTL_DAYS },
  { key: 'under_review', label: 'Under Review' },
  { key: 'go_approved', label: 'GO Approved' },
  { key: 'capture_planning', label: 'Capture Planning' },
  { key: 'proposal_development', label: 'Proposal Development' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'awarded', label: 'Awarded' },
  { key: 'lost', label: 'Lost' },
];
const STAGE_KEYS = STAGES.map((s) => s.key);

router.get('/stages', (req, res) => res.json({ stages: STAGES }));

/**
 * Clear out triage that was never acted on. Saving an opportunity to look at
 * later is cheap, so the Analysed column fills up with notices whose deadlines
 * have long gone; a board nobody trusts is a board nobody reads. Runs on read
 * rather than on a schedule — there is no scheduler here, and the only moment
 * anyone cares is when they are looking at it.
 */
async function expireAnalysed(workspaceId) {
  const { rowCount } = await db.query(
    `DELETE FROM gg_opportunities
      WHERE workspace_id = $1
        AND status = 'analysed'
        AND COALESCE(updated_at, created_at) < NOW() - ($2 || ' days')::interval`,
    [workspaceId, String(ANALYSED_TTL_DAYS)],
  );
  return rowCount;
}

router.get('/opportunities', auth.requireSession, wrap(async (req, res) => {
  const expired = await expireAnalysed(req.workspace.id);
  const { rows } = await db.query(
    `SELECT * FROM gg_opportunities WHERE workspace_id = $1
      ORDER BY COALESCE(updated_at, created_at) DESC`,
    [req.workspace.id],
  );
  res.json({ stages: STAGES, opportunities: rows, expired });
}));

router.post('/opportunities', auth.requireSession, wrap(async (req, res) => {
  const o = req.body || {};
  if (!o.title && !o.solicitation_number) throw auth.httpError(400, 'Nothing to save.');

  // Upsert: saving a notice already in the pipeline refreshes its details and
  // its score without moving the card or creating a second one.
  const { rows } = await db.query(
    `INSERT INTO gg_opportunities
       (workspace_id, notice_id, solicitation_number, title, agency, naics, set_aside,
        due_date, city, state, ui_link, score, recommendation, raw)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (workspace_id, COALESCE(notice_id, solicitation_number, title))
     DO UPDATE SET
       title = EXCLUDED.title, agency = EXCLUDED.agency, naics = EXCLUDED.naics,
       set_aside = EXCLUDED.set_aside, due_date = EXCLUDED.due_date,
       city = EXCLUDED.city, state = EXCLUDED.state, ui_link = EXCLUDED.ui_link,
       score = COALESCE(EXCLUDED.score, gg_opportunities.score),
       recommendation = COALESCE(EXCLUDED.recommendation, gg_opportunities.recommendation),
       raw = EXCLUDED.raw, updated_at = NOW()
     RETURNING *`,
    [
      req.workspace.id, o.notice_id || null, o.solicitation_number || null,
      o.title || null, o.agency || null, o.solicitation_naics || o.naics || null,
      o.solicitation_set_aside || o.set_aside || null,
      o.solicitation_due_date || o.due_date || null,
      o.place_of_performance_city || o.city || null,
      o.place_of_performance_state || o.state || null,
      o.ui_link || null,
      numberOrNull(o.score), o.recommendation || null,
      JSON.stringify(o),
    ],
  );
  logEvent(req.workspace.id, 'saved_opportunity', { title: o.title || null });
  res.json({ opportunity: rows[0] });
}));

router.patch('/opportunities/:id', auth.requireSession, wrap(async (req, res) => {
  const status = String(req.body.status || '');
  if (!STAGE_KEYS.includes(status)) {
    throw auth.httpError(400, `Unknown stage — must be one of: ${STAGE_KEYS.join(', ')}`);
  }
  const { rows } = await db.query(
    `UPDATE gg_opportunities SET status = $3, updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2 RETURNING *`,
    [req.params.id, req.workspace.id, status],
  );
  if (!rows[0]) throw auth.httpError(404, 'Not found.');
  res.json({ opportunity: rows[0] });
}));

/** Empty one stage. A per-card delete loop would be several round trips and
 *  could half-finish; this is one statement that either clears the column or
 *  does not. */
router.delete('/opportunities/stage/:status', auth.requireSession, wrap(async (req, res) => {
  const status = String(req.params.status || '');
  if (!STAGE_KEYS.includes(status)) throw auth.httpError(400, 'Unknown stage.');
  const { rowCount } = await db.query(
    'DELETE FROM gg_opportunities WHERE workspace_id = $1 AND status = $2',
    [req.workspace.id, status],
  );
  res.json({ ok: true, removed: rowCount });
}));

router.delete('/opportunities/:id', auth.requireSession, wrap(async (req, res) => {
  await db.query('DELETE FROM gg_opportunities WHERE id = $1 AND workspace_id = $2',
    [req.params.id, req.workspace.id]);
  res.json({ ok: true });
}));

// ── Errors ───────────────────────────────────────────────────────────────────
// One shape for every failure, so the page can always render `error` verbatim.
router.use((err, req, res, _next) => {
  const status = err.statusCode || 500;
  if (status >= 500) console.error('[go-no-go]', err);
  res.status(status).json({ error: err.message || 'Something went wrong. Please try again.' });
});

module.exports = router;
