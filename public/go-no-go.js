/* ═══════════════════════════════════════════════════════════════════════════
   Free Federal Opportunity Go/No-Go — page script.

   Vanilla JS on purpose: this site is plain HTML served by Express, and adding
   a build step for one page would mean a second toolchain to keep alive. No
   framework, no bundler, no dependencies — the file you read is the file that
   runs.

   The flow a first-time visitor sees, in order, with nothing else on screen:

       1  Sign up      Google, or an emailed 6-digit code
       2  Country      which procurement portal
       3  API key      pasted, verified on the spot
       →  Workspace    one search box; one button per result: Go/No-Go

   State lives in `S` and the page re-renders wholesale from it. At this size
   that is simpler to follow (and to change) than tracking which node needs
   patching, and the DOM is small enough that the cost is invisible.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var API = '/api/go-no-go';
  var TOKEN_KEY = 'bca_go_no_go_session';
  // This page is built to be bookmarked and used weekly, so the last search
  // comes back with the visitor. Prefilled, never auto-run: re-searching on
  // every page load would spend their SAM.gov quota without being asked.
  var QUERY_KEY = 'bca_go_no_go_last_query';
  // The last feed, kept with it. Coming back to a bookmarked page and finding
  // your results gone — having spent a SAM.gov call to get them — is the kind
  // of small loss that stops people returning. Restored, never re-fetched.
  var RESULTS_KEY = 'bca_go_no_go_last_results';
  // Ten to a page: enough to scan without scrolling past the sidebar's own
  // content, and short enough that the Go/No-Go button is always near.
  var PAGE_SIZE = 10;
  // Checklist chip -> the sidebar field that satisfies it.
  var FIELD_FOR = {
    naics: 'gg-naics',
    certifications: 'gg-certs',
    office: 'gg-office',
    past_performance: 'gg-pp-title',
  };

  function loadCachedResults() {
    try {
      var raw = localStorage.getItem(RESULTS_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) && parsed.length ? parsed : null;
    } catch (e) {
      return null;   // corrupt or oversized entry: treat as no cache
    }
  }

  function cacheResults(results) {
    try {
      localStorage.setItem(RESULTS_KEY, JSON.stringify(results || []));
    } catch (e) {
      // Quota exceeded (private browsing, or a very large page of notices).
      // The feed still works for this session; it just won't survive a reload.
    }
  }

  var S = {
    booting: true,
    token: localStorage.getItem(TOKEN_KEY),
    config: { countries: [], google_client_id: null, app_url: 'https://app.bidcoreai.com' },
    profile: null,
    readiness: null,
    usage: null,

    // Sign-up
    email: '',
    company: '',
    codeSent: false,
    code: '',

    // Setup
    country: 'US',
    step: null,          // 'country' | 'apikey' — set only while setting up
    // True when the same screens are reached from the profile menu. They then
    // drop the step rail and the first-run wording: changing a setting is not
    // signing up again, and being shown "Step 2 of 3" while doing it suggests
    // the workspace has been lost.
    settingsMode: false,

    // Workspace
    view: 'feed',        // 'feed' = live SAM.gov search | 'pipeline' = what they kept
    opportunities: [],   // saved, with a stage each
    stages: [],          // stage list from the API, so the two never disagree
    profileOpen: false,  // the header's profile/settings panel
    query: localStorage.getItem(QUERY_KEY) || '',
    results: loadCachedResults(),   // last feed, restored across reloads
    openId: null,        // which result the score panel is describing
    scoreFor: null,      // its title, shown at the top of that panel
    page: 0,             // which page of the feed is showing
    scoring: false,      // the panel's own loading state, separate from busy
    score: null,
    detailsOpen: false,

    // What is typed into the sidebar right now. The page re-renders wholesale
    // on every state change, which recreates those inputs — without this, a
    // background refresh landing mid-sentence would wipe what you were typing,
    // and the fields would snap back to the last saved values. Cleared on a
    // successful save, when the server's copy becomes the truth again.
    draft: {},
    // Sidebar sections that are collapsed by default — past performance is
    // add-once-and-forget, so it should not push the fields you edit often
    // below the fold.
    ppOpen: false,

    busy: false,
    error: null,
    notice: null,
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function icon(id, size) {
    var s = size || 16;
    return '<svg width="' + s + '" height="' + s + '" aria-hidden="true"><use href="#' + id + '"/></svg>';
  }

  /** Every request goes through here so a dead session always lands the visitor
   *  back on sign-up instead of failing silently on every later call. */
  function api(path, options) {
    options = options || {};
    var headers = { 'Content-Type': 'application/json' };
    if (S.token) headers['X-Public-Session'] = S.token;

    return fetch(API + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (res.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          S.token = null;
          S.profile = null;
          throw new Error(body.error || 'Your session expired — sign in again.');
        }
        if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
        return body;
      });
    });
  }

  function fail(err) {
    S.busy = false;
    S.error = err && err.message ? err.message : String(err);
    render();
  }

  function adopt(body) {
    if (body.profile) S.profile = body.profile;
    if (body.readiness) S.readiness = body.readiness;
    if (body.usage) S.usage = body.usage;
  }

  var val = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };

  // ── Boot ───────────────────────────────────────────────────────────────────

  function boot() {
    // Opened straight off the filesystem (file:///…/views/go-no-go.html), every
    // root-relative path resolves against the drive root, so the stylesheet, this
    // script and the API are all missing and the page hangs on "Loading…".
    // Say what happened instead of leaving someone staring at unstyled HTML.
    if (location.protocol === 'file:') {
      document.getElementById('gg-app').innerHTML =
        '<div class="gg-wrap"><div class="gg-card">' +
          '<h2 class="gg-h2">Open this page through the server</h2>' +
          '<p class="gg-sub">This file can\'t run on its own — its styles, script and API all load ' +
          'from the site root, which only exists when Express is serving it.</p>' +
          '<p style="margin:0 0 6px"><strong>Local:</strong> run <code>npm run dev</code>, then open ' +
          '<a href="http://localhost:3000/go-no-go" style="color:var(--gg-orange)">http://localhost:3000/go-no-go</a></p>' +
          '<p style="margin:0"><strong>Live:</strong> ' +
          '<a href="https://bidcoreai.com/go-no-go" style="color:var(--gg-orange)">bidcoreai.com/go-no-go</a></p>' +
        '</div></div>';
      return;
    }

    fetch(API + '/config')
      .then(function (r) { return r.json(); })
      .then(function (cfg) {
        S.config = cfg;
        if (!S.token) { S.booting = false; render(); return null; }
        return api('/me').then(function (body) {
          adopt(body);
          if (body.profile && body.profile.country_code) S.country = body.profile.country_code;
          S.booting = false;
          render();
          // The pipeline count sits in the view switch, so it has to be known
          // before the first paint settles — fetched after render, not before,
          // so the page appears immediately either way.
          loadOpportunities();
        }).catch(function () {
          // Expired or revoked token: fall back to sign-up, no error banner —
          // being asked to sign in again is not an error worth alarming anyone.
          S.token = null;
          S.booting = false;
          render();
        });
      })
      .catch(function () {
        S.booting = false;
        S.error = 'The free workspace is temporarily unavailable. Please try again shortly.';
        render();
      });
  }

  // ── Sign-up ────────────────────────────────────────────────────────────────

  function sendCode() {
    S.email = val('gg-email');
    S.company = val('gg-company');
    // Both are required. Checked here so the visitor is told which field is
    // missing before a request is made — the server enforces it too, since a
    // client-side check is a courtesy, not a rule.
    if (!S.email) { S.error = 'Enter your work email.'; render(); focus('gg-email'); return; }
    if (!S.company) { S.error = 'Enter your company name.'; render(); focus('gg-company'); return; }
    S.busy = true; S.error = null; render();

    api('/request-code', { method: 'POST', body: { email: S.email, company: S.company } })
      .then(function (body) {
        S.busy = false;
        S.codeSent = true;
        S.notice = 'We sent a 6-digit code to ' + S.email + '. It expires in ' +
          (body.expires_in_minutes || 15) + ' minutes.';
        render();
        focus('gg-code');
      })
      .catch(fail);
  }

  function verifyCode() {
    var code = val('gg-code');
    if (code.length !== 6) return;
    S.busy = true; S.error = null; render();

    api('/verify-code', { method: 'POST', body: { email: S.email, code: code } })
      .then(afterSignIn)
      .catch(fail);
  }

  function afterSignIn(body) {
    S.token = body.session_token;
    localStorage.setItem(TOKEN_KEY, S.token);
    adopt(body);
    S.busy = false;
    S.codeSent = false;
    S.notice = null;
    S.error = null;
    // Straight to the step that is actually missing.
    S.step = S.readiness && S.readiness.can_search ? null : 'country';
    render();
    loadOpportunities();
  }

  /** Called by Google Identity Services with a signed ID token. */
  window.ggGoogleCallback = function (response) {
    S.busy = true; S.error = null; render();
    api('/google', { method: 'POST', body: { credential: response.credential } })
      .then(afterSignIn)
      .catch(fail);
  };

  function mountGoogle() {
    var host = document.getElementById('gg-google');
    if (!host || !S.config.google_client_id || !window.google || !window.google.accounts) return;
    window.google.accounts.id.initialize({
      client_id: S.config.google_client_id,
      callback: window.ggGoogleCallback,
    });
    window.google.accounts.id.renderButton(host, {
      theme: 'outline', size: 'large', width: 320, text: 'continue_with', shape: 'rectangular',
    });
  }

  function signOut() {
    api('/sign-out', { method: 'POST' }).catch(function () { /* token dies locally regardless */ });
    localStorage.removeItem(TOKEN_KEY);
    S.token = null; S.profile = null; S.readiness = null;
    S.results = null; S.score = null; S.step = null; S.codeSent = false;
    render();
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  function chooseCountry(code) { S.country = code; render(); }

  function linkKey() {
    var key = val('gg-key');
    if (!key) return;
    S.busy = true; S.error = null; render();

    api('/api-key', { method: 'PUT', body: { api_key: key, country_code: S.country } })
      .then(function (body) {
        adopt(body);
        S.busy = false;
        S.step = S.settingsMode ? 'settings' : null;
        S.settingsMode = false;
        S.notice = S.step === 'settings' ? 'API key updated.' : null;
        render();
      })
      .catch(fail);
  }

  function removeKey() {
    if (!window.confirm('Remove your API key? Search stops working until you add one again.')) return;
    api('/api-key', { method: 'DELETE' }).then(function (body) { adopt(body); render(); }).catch(fail);
  }

  // ── Workspace ──────────────────────────────────────────────────────────────

  function search() {
    S.query = val('gg-q');
    if (S.query) localStorage.setItem(QUERY_KEY, S.query);
    S.busy = true; S.error = null; S.openId = null; S.score = null; S.scoreFor = null; S.page = 0; render();

    api('/search?q=' + encodeURIComponent(S.query))
      .then(function (body) {
        S.busy = false;
        S.results = body.results || [];
        cacheResults(S.results);
        adopt(body);          // fresh usage counters
        render();
      })
      .catch(function (e) { S.results = []; fail(e); });
  }

  function analyse(index) {
    var r = S.results[index];
    var id = r.notice_id || r.solicitation_number || String(index);
    // Pressing the same one again clears the panel; pressing a different one
    // replaces it, so the panel always describes exactly one opportunity.
    if (S.openId === id) { S.openId = null; S.score = null; S.scoreFor = null; render(); return; }

    S.openId = id;
    S.score = null;
    S.scoreFor = r.title || r.solicitation_number || null;
    // `scoring` is separate from `busy`: busy disables the search button, and
    // the two can't be conflated now that the panel has its own loading state.
    S.scoring = true;
    S.error = null;
    render();

    api('/score', { method: 'POST', body: r })
      .then(function (body) {
        S.scoring = false;
        S.score = body.result;
        adopt(body);          // readiness + fresh usage counters
        render();
      })
      .catch(function (e) { S.scoring = false; S.openId = null; S.scoreFor = null; fail(e); });
  }

  // ── Pipeline ───────────────────────────────────────────────────────────────

  function loadOpportunities() {
    return api('/opportunities')
      .then(function (body) {
        S.opportunities = body.opportunities || [];
        S.stages = body.stages || [];
        render();
      })
      .catch(function () { /* an empty pipeline is the normal first state */ });
  }

  /** Keep a notice. Carries the score across when one has just been run, so a
   *  card arrives in the pipeline already carrying its verdict. */
  function saveOpportunity(index) {
    var r = S.results[index];
    var id = r.notice_id || r.solicitation_number || String(index);
    var body = JSON.parse(JSON.stringify(r));
    if (S.openId === id && S.score) {
      body.score = S.score.overall_score;
      body.recommendation = S.score.recommendation;
    }
    api('/opportunities', { method: 'POST', body: body })
      .then(function () {
        S.notice = 'Saved to your pipeline.';
        render();
        setTimeout(function () { S.notice = null; render(); }, 2500);
        return loadOpportunities();
      })
      .catch(fail);
  }

  function isSaved(r, i) {
    var key = r.notice_id || r.solicitation_number || r.title || String(i);
    return S.opportunities.some(function (o) {
      return (o.notice_id && o.notice_id === r.notice_id) ||
             (o.solicitation_number && o.solicitation_number === r.solicitation_number) ||
             (o.title && o.title === r.title) || String(o.id) === key;
    });
  }

  function moveOpportunity(id, direction) {
    var opp = S.opportunities.filter(function (o) { return String(o.id) === String(id); })[0];
    if (!opp) return;
    var at = S.stages.map(function (s) { return s.key; }).indexOf(opp.status);
    var next = S.stages[at + direction];
    if (!next) return;

    // Move the card immediately and reconcile after: waiting on a round trip
    // makes a board feel broken.
    opp.status = next.key;
    render();
    api('/opportunities/' + id, { method: 'PATCH', body: { status: next.key } })
      .then(loadOpportunities)
      .catch(fail);
  }

  function removeOpportunity(id) {
    S.opportunities = S.opportunities.filter(function (o) { return String(o.id) !== String(id); });
    render();
    api('/opportunities/' + id, { method: 'DELETE' }).then(loadOpportunities).catch(fail);
  }

  function setView(v) { S.view = v; S.error = null; render(); }
  function toggleProfile() { S.profileOpen = !S.profileOpen; render(); }

  function saveProfile() {
    S.busy = true; S.error = null; render();
    api('/profile', {
      method: 'PUT',
      body: {
        naics_codes: val('gg-naics'),
        certifications: val('gg-certs'),
        states_served: val('gg-states'),
        office_address: val('gg-office'),
        bonding_capacity: val('gg-bond'),
        project_value_min: val('gg-min'),
        project_value_max: val('gg-max'),
      },
    }).then(function (body) {
      adopt(body);
      // The saved profile is now authoritative, so drop the drafts and let the
      // sidebar redraw from it — which is also the confirmation that it stuck.
      S.draft = {};
      S.busy = false;
      S.notice = 'Saved.';
      render();
      setTimeout(function () { S.notice = null; render(); }, 2500);
    }).catch(fail);
  }

  function addPastPerformance() {
    var title = val('gg-pp-title');
    if (!title) return;
    api('/past-performance', {
      method: 'POST',
      body: { title: title, agency: val('gg-pp-agency'), contract_value: val('gg-pp-value') },
    }).then(function (body) { adopt(body); render(); }).catch(fail);
  }

  function removePastPerformance(id) {
    api('/past-performance/' + id, { method: 'DELETE' })
      .then(function (body) { adopt(body); render(); }).catch(fail);
  }

  function toggleDetails() { S.detailsOpen = !S.detailsOpen; render(); }

  // ── Views ──────────────────────────────────────────────────────────────────

  function messages() {
    var out = '';
    if (S.error) out += '<div class="gg-msg gg-msg--error">' + esc(S.error) + '</div>';
    if (S.notice) out += '<div class="gg-msg gg-msg--ok">' + esc(S.notice) + '</div>';
    return out;
  }

  function viewSignUp() {
    var hasGoogle = !!S.config.google_client_id;
    var form = S.codeSent
      ? '<div class="gg-field">' +
          '<label class="gg-label" for="gg-code">6-digit code</label>' +
          '<input class="gg-input gg-input--code" id="gg-code" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code"/>' +
        '</div>' +
        '<button class="gg-btn gg-btn--block" data-act="verify"' + (S.busy ? ' disabled' : '') + '>' +
          (S.busy ? '<span class="gg-spin"></span> Checking…' : 'Open my workspace') +
        '</button>' +
        '<button class="gg-btn gg-btn--ghost gg-btn--block" style="margin-top:10px" data-act="restart">Use a different email</button>'
      : (hasGoogle
          ? '<div id="gg-google"></div><div class="gg-or">or</div>'
          : '') +
        '<div class="gg-field">' +
          '<label class="gg-label" for="gg-email">Work email</label>' +
          '<input class="gg-input" id="gg-email" type="email" placeholder="you@company.com" autocomplete="email" value="' + esc(S.email) + '"/>' +
        '</div>' +
        '<div class="gg-field">' +
          '<label class="gg-label" for="gg-company">Company</label>' +
          '<input class="gg-input" id="gg-company" placeholder="Acme Construction LLC" value="' + esc(S.company) + '"/>' +
        '</div>' +
        '<button class="gg-btn gg-btn--block" data-act="send"' + (S.busy ? ' disabled' : '') + '>' +
          (S.busy ? '<span class="gg-spin"></span> Sending…' : 'Continue ' + icon('gg-arrow', 15)) +
        '</button>' +
        '<p class="gg-hint">We email you a code — no password to create or remember.</p>';

    return '<div class="gg-wrap gg-wrap--wide"><div class="gg-hero">' +
      '<div>' +
        '<h1 class="gg-h1">Should you bid it?<br/>Find out in 30 seconds.</h1>' +
        '<p class="gg-lead">Search live federal solicitations with your own SAM.gov key and get an instant ' +
          'GO / REVIEW / NO-GO — scored across 12 criteria against your company. Free, no card.</p>' +
        '<ul>' +
          '<li>' + icon('gg-check', 18) + '<span>Your SAM.gov key, your quota, your data</span></li>' +
          '<li>' + icon('gg-check', 18) + '<span>12 scored criteria, with the reason behind every score</span></li>' +
          '<li>' + icon('gg-check', 18) + '<span>Set up in three steps — sign in, country, key</span></li>' +
        '</ul>' +
      '</div>' +
      '<div class="gg-card">' +
        '<h2 class="gg-h2">' + (S.codeSent ? 'Check your email' : 'Start free') + '</h2>' +
        '<p class="gg-sub">' + (S.codeSent ? 'We sent a code to ' + esc(S.email) + '.' : 'Create your free workspace.') + '</p>' +
        messages() + form +
        // No "sign in to the app" link here. Sitting under a sign-up form it
        // reads as the way to sign in to THIS page, and sends people to the
        // product's login screen instead — off the page entirely. The one
        // outbound link lives at the bottom of the workspace, after they have
        // something to be persuaded by.
      '</div>' +
    '</div></div>';
  }

  function viewSteps(current) {
    var labels = ['Sign up', 'Country', 'SAM.gov key'];
    return '<div class="gg-steps">' + labels.map(function (l, i) {
      var cls = i < current ? 'is-done' : i === current ? 'is-active' : '';
      return '<div class="gg-step ' + cls + '"><span class="gg-step-n">' +
        (i < current ? icon('gg-check', 12) : i + 1) + '</span><b>' + l + '</b></div>' +
        (i < labels.length - 1 ? '<span class="gg-step-line"></span>' : '');
    }).join('') + '</div>';
  }

  function viewCountry() {
    var countries = S.config.countries || [];
    var selected = countries.filter(function (c) { return c.code === S.country; })[0];

    return '<div class="gg-wrap">' + (S.settingsMode ? '' : viewSteps(1)) +
      '<div class="gg-card">' +
        '<h2 class="gg-h2">Where do you bid?</h2>' +
        '<p class="gg-sub">This decides which procurement portal your API key belongs to.</p>' +
        messages() +
        countries.map(function (c) {
          return '<button class="gg-choice ' + (c.code === S.country ? 'is-on' : '') + '"' +
            (c.connected ? '' : ' disabled') + ' data-act="country" data-code="' + esc(c.code) + '">' +
            '<span class="gg-choice-dot"></span>' +
            '<span><span class="gg-choice-name">' + esc(c.name) + '</span><br/>' +
              '<span class="gg-choice-portal">' + esc(c.portal) + '</span></span>' +
            (c.connected ? '' : '<span class="gg-choice-soon">Coming soon</span>') +
          '</button>';
        }).join('') +
        '<button class="gg-btn gg-btn--block" style="margin-top:14px" data-act="to-key"' +
          (selected && selected.connected ? '' : ' disabled') + '>Continue ' + icon('gg-arrow', 15) + '</button>' +
      '</div>' +
    '</div>';
  }

  function viewApiKey() {
    var countries = S.config.countries || [];
    var portal = (countries.filter(function (c) { return c.code === S.country; })[0] || {}).portal || 'SAM.gov';

    return '<div class="gg-wrap">' + (S.settingsMode ? '' : viewSteps(2)) +
      '<div class="gg-card">' +
        '<h2 class="gg-h2">' + (S.settingsMode ? esc(portal) + ' API key' : 'Connect your ' + esc(portal) + ' API key') + '</h2>' +
        '<p class="gg-sub">Searches run on your own key, so the results and the quota are yours.</p>' +
        // In settings the country belongs here rather than on a screen of its
        // own — changing either is one visit, not two.
        (S.settingsMode
          ? '<div class="gg-field"><label class="gg-label" for="gg-country">Country</label>' +
            '<select class="gg-input" id="gg-country" data-act="pick-country">' +
              (S.config.countries || []).map(function (c) {
                return '<option value="' + esc(c.code) + '"' + (c.code === S.country ? ' selected' : '') + '' +
                  (c.connected ? '' : ' disabled') + '>' + esc(c.name) + ' — ' + esc(c.portal) +
                  (c.connected ? '' : ' (coming soon)') + '</option>';
              }).join('') +
            '</select></div>'
          : '') +
        messages() +
        '<div class="gg-msg">' + icon('gg-lock', 14) + ' <strong>Where to find it:</strong> sign in at ' +
          '<a href="https://sam.gov" target="_blank" rel="noopener" style="color:var(--gg-orange)">sam.gov</a>' +
          ' → your name → <em>Account Details</em> → <em>API Key</em>. It is free.<br/>' +
          'Stored encrypted. We only ever show the last 4 characters.</div>' +
        '<div class="gg-field">' +
          '<label class="gg-label" for="gg-key">API key</label>' +
          '<input class="gg-input" id="gg-key" type="password" autocomplete="off" placeholder="Paste your ' + esc(portal) + ' API key"/>' +
        '</div>' +
        '<div style="display:flex;gap:10px">' +
          (S.settingsMode
            ? '<button class="gg-btn gg-btn--ghost" data-act="cancel-settings">Cancel</button>'
            : '<button class="gg-btn gg-btn--ghost" data-act="to-country">Back</button>') +
          '<button class="gg-btn" style="flex:1" data-act="link-key"' + (S.busy ? ' disabled' : '') + '>' +
            (S.busy ? '<span class="gg-spin"></span> Verifying…'
              : (S.settingsMode ? 'Save key' : 'Connect and start ' + icon('gg-arrow', 15)))
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function viewChecklist() {
    var r = S.readiness;
    if (!r) return '';
    // api_key is deliberately absent: it is mandatory and gates the workspace,
    // so by the time this checklist is on screen it is always ticked — a chip
    // that can only ever say "done" is noise. It lives in the profile panel,
    // where it can be changed or removed.
    var items = ['naics', 'certifications', 'office', 'past_performance'];
    var missing = items.filter(function (k) { return r[k] && !r[k].complete; }).length;
    return '<div class="gg-side-block">' +
      '<div class="gg-side-title">Setup' +
        (missing ? '<span class="gg-muted" style="font-weight:400;text-transform:none;letter-spacing:0"> — ' +
          missing + ' left</span>' : '') +
      '</div>' +
      '<div class="gg-check">' + items.map(function (k) {
      var it = r[k];
      if (!it) return '';
      var cls = it.complete ? 'is-done' : (it.blocking ? 'is-required' : '');
      // These tick themselves — the server recomputes readiness after every
      // save. They look like checkboxes though, which invites a click, so the
      // click does the one useful thing available: jumps to the field that
      // would fill it.
      return '<button class="gg-chip ' + cls + '" data-act="goto" data-field="' + esc(FIELD_FOR[k] || '') + '" ' +
        'title="' + esc(it.hint) + (it.complete ? '' : ' (click to fill it in)') + '">' +
        '<span class="gg-chip-box"></span>' + esc(it.label) + '</button>';
    }).join('') + '</div></div>';
  }

  function viewResult(r, i) {
    var id = r.notice_id || r.solicitation_number || String(i);
    var open = S.openId === id;
    var saved = isSaved(r, i);
    var meta = [
      r.agency,
      [r.place_of_performance_city, r.place_of_performance_state].filter(Boolean).join(', '),
      r.solicitation_naics ? 'NAICS ' + r.solicitation_naics : null,
      r.solicitation_due_date ? 'due ' + r.solicitation_due_date : null,
    ].filter(Boolean).join(' · ');

    // The analysis itself renders in the right-hand panel, not here: expanding
    // it inline pushed every other result off screen, and comparing two
    // opportunities meant scrolling back and forth. The selected row is marked
    // so it's obvious which one the panel is describing.
    return '<div class="gg-result' + (open ? ' is-selected' : '') + '">' +
      '<div class="gg-result-top">' +
        '<div style="min-width:240px;flex:1">' +
          '<div class="gg-result-title">' + esc(r.title || r.solicitation_number || 'Untitled notice') + '</div>' +
          '<div class="gg-result-meta">' + esc(meta) + '</div>' +
        '</div>' +
        '<div class="gg-result-actions">' +
          (r.ui_link ? '<a class="gg-btn gg-btn--ghost gg-btn--small" href="' + esc(r.ui_link) + '" target="_blank" rel="noopener">SAM.gov ' + icon('gg-ext', 13) + '</a>' : '') +
          '<button class="gg-btn gg-btn--ghost gg-btn--small" data-act="save" data-i="' + i + '"' +
            (saved ? ' disabled' : '') + '>' + (saved ? 'In pipeline' : 'Save') + '</button>' +
          '<button class="gg-btn gg-btn--small' + (open ? ' gg-btn--ghost' : '') + '" data-act="analyse" data-i="' + i + '">' +
            (open ? 'Analysed →' : 'Go/No-Go') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /** Who's signed in, top left — click for settings. */
  function viewWho() {
    var p = S.profile || {};
    var name = p.company || p.name || p.email || '';
    var initial = (name || '?').trim().charAt(0).toUpperCase();
    return '<button class="gg-who' + (S.profileOpen ? ' is-open' : '') + '" data-act="profile" ' +
      'aria-expanded="' + (S.profileOpen ? 'true' : 'false') + '" title="Your profile and settings">' +
      '<span class="gg-who-avatar">' + esc(initial) + '</span>' +
      '<span style="text-align:left">' +
        '<span class="gg-who-name">' + esc(p.company || p.name || 'Your workspace') + '</span><br/>' +
        '<span class="gg-who-sub">' + esc(p.email || '') + '</span>' +
      '</span>' +
      // The chevron is what makes this read as a menu rather than a label.
      '<span class="gg-who-caret">' + icon('gg-caret', 14) + '</span>' +
    '</button>';
  }

  /** The account menu: identity, one way into Settings, sign out. Everything
   *  adjustable lives on the Settings screen rather than as rows here — a
   *  dropdown you have to read carefully is a dropdown doing too much. */
  function viewProfilePanel() {
    var p = S.profile || {};
    var used = S.usage || {};
    var initial = (p.company || p.name || p.email || '?').trim().charAt(0).toUpperCase();

    function item(iconId, label, value, act) {
      var tag = act ? 'button' : 'div';
      return '<' + tag + ' class="gg-menu-item"' + (act ? ' data-act="' + act + '"' : '') + '>' +
        '<span class="gg-menu-icon">' + icon(iconId, 16) + '</span>' +
        '<span class="gg-menu-label">' + esc(label) + '</span>' +
        (value ? '<span class="gg-menu-value">' + esc(value) + '</span>' : '') +
      '</' + tag + '>';
    }

    return '<div class="gg-menu-backdrop" data-act="profile-close">' +
      '<div class="gg-menu" role="menu">' +
        '<div class="gg-menu-card">' +
          '<div class="gg-menu-avatar">' + esc(initial) + '</div>' +
          '<div class="gg-menu-name">' + esc(p.company || p.name || 'Your workspace') + '</div>' +
          '<div class="gg-menu-email">' + esc(p.email || '') + '</div>' +
        '</div>' +
        '<div class="gg-menu-list">' +
          item('gg-settings', 'Settings', '', 'open-settings') +
          item('gg-chart', 'Analyses today', (used.scores_today || 0) + ' / ' + (used.scores_limit || 40)) +
          '<div class="gg-menu-sep"></div>' +
          item('gg-out', 'Sign out', '', 'sign-out') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /** Settings — everything about the account and its connected portal, on one
   *  screen instead of scattered across a dropdown. */
  function viewSettings() {
    var p = S.profile || {};
    var country = (S.config.countries || []).filter(function (c) { return c.code === (p.country_code || 'US'); })[0];
    var portal = country ? country.portal : 'SAM.gov';
    var used = S.usage || {};

    function row(label, value) {
      return '<div class="gg-prof-row"><span class="gg-muted">' + esc(label) + '</span>' +
        '<span>' + esc(value == null || value === '' ? '—' : value) + '</span></div>';
    }

    return '<div class="gg-wrap">' +
      '<div class="gg-card">' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">' +
          '<h2 class="gg-h2" style="margin:0">Settings</h2>' +
          '<button class="gg-btn gg-btn--ghost gg-btn--small" style="margin-left:auto" ' +
            'data-act="cancel-settings">Back to workspace</button>' +
        '</div>' +

        messages() +

        '<div class="gg-side-title">Account</div>' +
        row('Email', p.email) +
        row('Company', p.company) +
        (p.name ? row('Name', p.name) : '') +

        '<div class="gg-side-title" style="margin-top:26px">Procurement portal</div>' +
        row('Country', country ? country.name : (p.country_code || 'US')) +
        row(portal + ' API key', p.has_api_key ? '****' + (p.api_key_hint || '') : 'not connected') +
        row('Verified', p.api_key_status === 'ok' ? 'yes' : 'not verified') +
        '<div style="display:flex;gap:10px;margin-top:14px">' +
          '<button class="gg-btn gg-btn--small" data-act="edit-key">' +
            (p.has_api_key ? 'Change key or country' : 'Connect a key') + '</button>' +
          (p.has_api_key ? '<button class="gg-btn gg-btn--ghost gg-btn--small" data-act="rm-key">Remove key</button>' : '') +
        '</div>' +

        '<div class="gg-side-title" style="margin-top:26px">Company profile</div>' +
        row('NAICS codes', (p.naics_codes || []).join(', ')) +
        row('Certifications', (p.certifications || []).join(', ')) +
        row('States served', (p.states_served || []).join(', ')) +
        row('Office address', p.office_address) +
        row('Bonding capacity', p.bonding_capacity ? '$' + Number(p.bonding_capacity).toLocaleString() : '') +
        row('Job size', (p.project_value_min || p.project_value_max)
          ? '$' + Number(p.project_value_min || 0).toLocaleString() + ' – $' + Number(p.project_value_max || 0).toLocaleString()
          : '') +
        row('Past performance', (p.past_performance || []).length + ' project(s)') +
        '<p class="gg-hint">These feed the score directly. Edit them in the left column of the ' +
          'workspace, where they sit beside the results they explain.</p>' +

        '<div class="gg-side-title" style="margin-top:26px">Usage today</div>' +
        row('Searches', (used.searches_today || 0) + ' / ' + (used.searches_limit || 60)) +
        row('Analyses', (used.scores_today || 0) + ' / ' + (used.scores_limit || 40)) +

        '<div style="display:flex;gap:10px;margin-top:26px">' +
          '<button class="gg-btn" data-act="cancel-settings">Back to workspace</button>' +
          '<button class="gg-btn gg-btn--ghost" data-act="sign-out">Sign out</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /** The capture pipeline — the app's stages, one column each. */
  function viewBoard() {
    var stages = S.stages.length ? S.stages : [{ key: 'under_review', label: 'Under Review' }];
    return '<div class="gg-board">' + stages.map(function (stage, si) {
      var cards = S.opportunities.filter(function (o) { return o.status === stage.key; });
      return '<div class="gg-col">' +
        '<div class="gg-col-head">' + esc(stage.label) +
          '<span class="gg-col-count">' + cards.length + '</span></div>' +
        '<div class="gg-col-body">' +
          (cards.length ? cards.map(function (o) {
            return '<div class="gg-card-mini">' +
              '<div class="gg-card-mini-title">' + esc(o.title || o.solicitation_number || 'Untitled') + '</div>' +
              '<div class="gg-card-mini-meta">' +
                esc([o.agency, o.due_date ? 'due ' + o.due_date : null].filter(Boolean).join(' · ')) +
              '</div>' +
              '<div class="gg-card-mini-foot">' +
                (o.score != null ? '<span class="gg-score-pill">' + o.score + '</span>' : '') +
                '<button class="gg-move" data-act="move" data-id="' + o.id + '" data-dir="-1"' +
                  (si === 0 ? ' disabled' : '') + ' title="Back a stage">←</button>' +
                '<button class="gg-move" data-act="move" data-id="' + o.id + '" data-dir="1"' +
                  (si === stages.length - 1 ? ' disabled' : '') + ' title="On a stage">→</button>' +
                (o.ui_link ? '<a class="gg-move" href="' + esc(o.ui_link) + '" target="_blank" rel="noopener" ' +
                  'style="text-decoration:none" title="View on SAM.gov">↗</a>' : '') +
                '<button class="gg-row-x" style="margin-left:auto" data-act="rm-opp" data-id="' + o.id + '" ' +
                  'aria-label="Remove">&times;</button>' +
              '</div>' +
            '</div>';
          }).join('') : '<div class="gg-col-empty">Nothing here yet.</div>') +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function viewPager(pages, from) {
    if (pages <= 1) return '';
    var shown = Math.min(from + PAGE_SIZE, S.results.length);
    return '<div class="gg-pager">' +
      '<button class="gg-btn gg-btn--ghost gg-btn--small" data-act="page" data-p="' + (S.page - 1) + '"' +
        (S.page === 0 ? ' disabled' : '') + '>← Previous</button>' +
      '<span class="gg-pager-info">' + (from + 1) + '–' + shown + ' of ' + S.results.length +
        '<span class="gg-muted"> · page ' + (S.page + 1) + ' of ' + pages + '</span></span>' +
      '<button class="gg-btn gg-btn--ghost gg-btn--small" data-act="page" data-p="' + (S.page + 1) + '"' +
        (S.page >= pages - 1 ? ' disabled' : '') + '>Next →</button>' +
    '</div>';
  }

  /** The right-hand panel: the verdict for whichever result is selected. */
  function viewScorePanel() {
    var body;
    if (S.scoring) {
      body = '<div class="gg-skeleton">Scoring 12 criteria…</div>';
    } else if (S.score) {
      body = (S.scoreFor ? '<div class="gg-score-for">' + esc(S.scoreFor) + '</div>' : '') + viewScore(S.score);
    } else {
      body = '<div class="gg-score-empty">Press <strong>Go/No-Go</strong> on any result and the verdict appears here — ' +
        'a score out of 100, what to watch, and the reason behind all 12 criteria.</div>';
    }
    return '<aside class="gg-side gg-card">' +
      // The checklist belongs beside the verdict, not above the results: every
      // unticked item is a reason the score below is less certain than it could
      // be, so the two are read together.
      viewChecklist() +
      '<div class="gg-side-title">Go/No-Go analysis</div>' + body +
    '</aside>';
  }

  function viewScore(s) {
    // Three states, three shapes — filled orange, outlined, filled black — so
    // GO, REVIEW and NO-GO are told apart at a glance without a second colour.
    // Anything else (NEEDS MORE INFO) renders outlined: deliberately not a
    // verdict, because it isn't one.
    var verdict = String(s.recommendation || '').toUpperCase();
    var badgeClass = verdict === 'GO' ? 'is-go' : verdict === 'NO-GO' ? 'is-nogo' : '';

    var out = '<div class="gg-verdict">' +
      '<div class="gg-verdict-badge ' + badgeClass + '">' +
        '<span class="gg-verdict-score">' + s.overall_score + '</span>' +
        '<span><span class="gg-verdict-label">Go score</span><br/>' +
        '<span class="gg-verdict-word">' + esc(s.recommendation) + '</span></span>' +
      '</div>';
    if (s.summary && s.summary.days_remaining != null) {
      out += '<div class="gg-muted" style="font-size:13.5px">' + s.summary.days_remaining +
        ' days to respond · due ' + esc(s.summary.bid_due) + '</div>';
    }
    out += '</div>';

    if (s.override_reason) {
      out += '<div class="gg-msg gg-msg--error">' + esc(s.override_reason) + '</div>';
    }

    if (s.risks && s.risks.length) {
      out += '<div class="gg-list-title">What to watch</div>';
      s.risks.forEach(function (r) {
        out += '<div class="gg-crit is-weak">' +
          '<span class="gg-crit-score">' + esc(r.severity) + '</span>' +
          '<span><span class="gg-crit-name">' + esc(r.title) + '</span> — ' +
          '<span class="gg-crit-why">' + esc(r.reason) + '</span></span></div>';
      });
    }

    if (s.suggestions && s.suggestions.length) {
      out += '<div class="gg-list-title">Make this sharper</div>';
      s.suggestions.forEach(function (t) {
        out += '<div class="gg-crit"><span class="gg-crit-score">+</span>' +
          '<span class="gg-crit-why">' + esc(t) + '</span></div>';
      });
    }

    out += '<button class="gg-btn gg-btn--link" style="margin-top:16px" data-act="details">' +
      (S.detailsOpen ? 'Hide' : 'Show') + ' all 12 criteria</button>';

    if (S.detailsOpen && s.matches) {
      out += '<div style="margin-top:10px">';
      s.matches.forEach(function (m) {
        out += '<div class="gg-crit ' + (m.score < 50 ? 'is-weak' : '') + '">' +
          '<span class="gg-crit-score">' + m.score + '</span>' +
          '<span><span class="gg-crit-name">' + esc(m.title) + '</span><br/>' +
          '<span class="gg-crit-why">' + esc(m.reason) + '</span></span></div>';
      });
      out += '</div>';
    }
    return out;
  }

  /** The left sidebar: everything about the visitor's company, permanently in
   *  view beside the results. It answers "why did it score that?" without a
   *  click, and editing a field is one field away from re-running the score. */
  function viewSidebar() {
    var p = S.profile || {};
    var perf = p.past_performance || [];

    return '<aside class="gg-side gg-card">' +
      '<div class="gg-side-block">' +
        '<div class="gg-side-title">Your company</div>' +
        '<p class="gg-hint" style="margin:-6px 0 12px">The more of this we know, the more of the 12 criteria can score.</p>' +
        field('gg-naics', 'NAICS codes you hold', (p.naics_codes || []).join(', '), '236220, 238160') +
        field('gg-certs', 'Certifications', (p.certifications || []).join(', '), '8(a), HUBZone, SDVOSB') +
        field('gg-states', 'States you work in', (p.states_served || []).join(', '), 'VA, MD, DC') +
        field('gg-office', 'Office address', p.office_address || '', '123 Main St, Richmond, VA') +
        field('gg-bond', 'Bonding capacity ($)', p.bonding_capacity || '', '5000000') +
        field('gg-min', 'Smallest job you take ($)', p.project_value_min || '', '100000') +
        field('gg-max', 'Largest job you take ($)', p.project_value_max || '', '5000000') +
        '<button class="gg-btn gg-btn--small gg-btn--block" data-act="save-profile"' +
          (S.busy ? ' disabled' : '') + '>Save</button>' +
      '</div>' +

      '<div class="gg-side-block">' +
        '<button class="gg-toggle gg-side-title" style="margin-bottom:' + (S.ppOpen ? '12px' : '0') + '" ' +
          'data-act="toggle-pp" aria-expanded="' + (S.ppOpen ? 'true' : 'false') + '">' +
          'Past performance' +
          '<span class="gg-col-count">' + perf.length + '</span>' +
          '<span class="gg-toggle-caret">' + icon('gg-caret', 14) + '</span>' +
        '</button>' +
        (S.ppOpen
          ? perf.map(function (r) {
              return '<div class="gg-row" style="font-size:13px;padding:8px 10px"><span>' + esc(r.title) +
                (r.agency ? '<br/><span class="gg-muted" style="font-size:12px">' + esc(r.agency) + '</span>' : '') +
                '</span><button class="gg-row-x" data-act="rm-pp" data-id="' + r.id + '" aria-label="Remove">&times;</button></div>';
            }).join('') +
            field('gg-pp-title', 'Project', '', 'Barracks roof replacement') +
            field('gg-pp-agency', 'Agency', '', 'USACE') +
            field('gg-pp-value', 'Contract value ($)', '', '1200000') +
            '<button class="gg-btn gg-btn--small gg-btn--ghost gg-btn--block" data-act="add-pp">Add project</button>'
          : '') +
      '</div>' +

    '</aside>';
    // (The connected SAM.gov account moved to the profile panel in the header:
    //  it is account settings, not an input to the score, and this sidebar is
    //  only the latter.)
  }

  function field(id, label, value, placeholder) {
    var shown = Object.prototype.hasOwnProperty.call(S.draft, id) ? S.draft[id] : value;
    return '<div class="gg-field">' +
      '<label class="gg-label" for="' + id + '">' + esc(label) + '</label>' +
      '<input class="gg-input" id="' + id + '" value="' + esc(shown == null ? '' : shown) + '" ' +
        'placeholder="' + esc(placeholder) + '"/>' +
    '</div>';
  }

  function viewWorkspace() {
    var body = '';

    if (S.results === null && !S.busy) {
      body = '<div class="gg-card" style="text-align:center">' +
        '<p class="gg-muted" style="margin:0">Search live federal solicitations above, then press ' +
        '<strong>Go/No-Go</strong> on any result for an instant verdict.</p></div>';
    } else if (S.results && S.results.length === 0 && !S.busy) {
      body = '<div class="gg-card"><p class="gg-muted" style="margin:0">Nothing matched. SAM.gov searches the ' +
        'last 12 months of notices by title — try a broader word, or a 6-digit NAICS code.</p></div>';
    } else if (S.results) {
      var pages = Math.ceil(S.results.length / PAGE_SIZE);
      if (S.page >= pages) S.page = 0;   // a shorter result set than last time
      var from = S.page * PAGE_SIZE;
      body = S.results.slice(from, from + PAGE_SIZE)
        // The absolute index is what save/analyse look up, so pass it through
        // rather than the index within the page.
        .map(function (r, n) { return viewResult(r, from + n); }).join('') +
        viewPager(pages, from);
    }

    var isFeed = S.view === 'feed';
    var centre = isFeed
      // The input carries its own border, so a card around it would be a box
      // inside a box for no gain.
      ? '<div class="gg-search" style="margin-bottom:16px">' +
          '<input class="gg-input" id="gg-q" value="' + esc(S.query) + '" ' +
            'placeholder="What do you build? e.g. roofing, HVAC, paving — or a NAICS or solicitation number"/>' +
          '<button class="gg-btn" data-act="search"' + (S.busy ? ' disabled' : '') + '>' +
            (S.busy ? '<span class="gg-spin"></span> Searching…' : icon('gg-search', 15) + ' Search') +
          '</button>' +
        '</div>' + body
      : (S.opportunities.length
          ? viewBoard()
          : '<div class="gg-card"><p class="gg-muted" style="margin:0">Your pipeline is empty. ' +
            'Search the feed and press <strong>Save</strong> on anything worth tracking — ' +
            'it stays here even after the notice closes on SAM.gov.</p></div>');

    // No link to the product app anywhere on this page — it stands on its own
    // as a free tool rather than as a funnel into a signup.
    return '<div class="gg-wrap gg-wrap--full">' +
      '<div class="gg-layout">' +
        viewSidebar() +
        '<main class="gg-main">' +
          '<div class="gg-topbar">' +
            '<div class="gg-views">' +
            '<button class="gg-view-btn' + (isFeed ? ' is-on' : '') + '" data-act="view" data-v="feed">' +
              'Opportunity Feed' + (S.results ? '<span class="gg-view-count">' + S.results.length + '</span>' : '') +
            '</button>' +
            '<button class="gg-view-btn' + (isFeed ? '' : ' is-on') + '" data-act="view" data-v="pipeline">' +
              'Pipeline<span class="gg-view-count">' + S.opportunities.length + '</span>' +
            '</button>' +
            '</div>' +
          '</div>' +
          messages() +
          centre +
        '</main>' +
        viewScorePanel() +
      '</div>' +
      '<div class="gg-foot">Opportunity data comes from SAM.gov via your own API key. ' +
        'BidcoreAI is not affiliated with SAM.gov or any government agency.<br/>' +
        '© ' + new Date().getFullYear() + ' BidcoreAI · <a href="/">bidcoreai.com</a></div>' +
    '</div>';
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function render() {
    var app = document.getElementById('gg-app');
    var head = document.getElementById('gg-head-right');

    if (S.booting) {
      app.innerHTML = '<div class="gg-wrap"><div class="gg-skeleton">Loading…</div></div>';
      return;
    }

    var signedIn = !!S.token && !!S.profile;
    var stage = !signedIn ? 'signup'
      : S.step ? S.step
      : (S.readiness && S.readiness.can_search) ? 'workspace' : 'country';

    // Usage then the account menu, top right — where every app puts it.
    // Signed out the header carries nothing at all: every exit from this page
    // before the visitor has seen a result is a lost lead.
    head.innerHTML = signedIn
      ? (S.usage ? '<span class="gg-usage">' + S.usage.scores_today + '/' + S.usage.scores_limit + ' analyses today</span>' : '') +
        viewWho()
      : '';

    if (stage === 'signup') app.innerHTML = viewSignUp();
    else if (stage === 'settings') app.innerHTML = viewSettings();
    else if (stage === 'country') app.innerHTML = viewCountry();
    else if (stage === 'apikey') app.innerHTML = viewApiKey();
    else app.innerHTML = viewWorkspace() + (S.profileOpen ? viewProfilePanel() : '');

    if (stage === 'signup' && !S.codeSent) mountGoogle();
  }

  function focus(id) {
    var el = document.getElementById(id);
    if (el) el.focus();
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  // One delegated listener for the whole page: the markup is re-rendered
  // wholesale, so per-node handlers would have to be re-attached every time.

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');

    if (act === 'send') { e.preventDefault(); sendCode(); }
    else if (act === 'verify') { e.preventDefault(); verifyCode(); }
    else if (act === 'restart') { S.codeSent = false; S.notice = null; S.error = null; render(); }
    else if (act === 'sign-out') signOut();
    else if (act === 'country') chooseCountry(el.getAttribute('data-code'));
    else if (act === 'to-key') { S.step = 'apikey'; S.error = null; render(); focus('gg-key'); }
    else if (act === 'open-settings') { S.profileOpen = false; S.step = 'settings'; S.error = null; render(); }
    else if (act === 'edit-key') { S.settingsMode = true; S.step = 'apikey'; S.error = null; render(); focus('gg-key'); }
    else if (act === 'to-country') {
      // From the profile menu this is "change my key", so it opens the key
      // screen directly — with the country selector on it — rather than
      // walking the whole wizard again. During first-run setup it is still the
      // country step.
      var fromMenu = S.profileOpen;
      S.profileOpen = false;
      S.settingsMode = fromMenu;
      S.step = fromMenu ? 'apikey' : 'country';
      S.error = null;
      render();
      if (fromMenu) focus('gg-key');
    }
    else if (act === 'cancel-settings') { S.step = null; S.settingsMode = false; S.error = null; render(); }
    else if (act === 'link-key') { e.preventDefault(); linkKey(); }
    else if (act === 'rm-key') removeKey();
    else if (act === 'search') { e.preventDefault(); search(); }
    else if (act === 'analyse') analyse(Number(el.getAttribute('data-i')));
    else if (act === 'save') saveOpportunity(Number(el.getAttribute('data-i')));
    else if (act === 'view') setView(el.getAttribute('data-v'));
    else if (act === 'page') {
      S.page = Number(el.getAttribute('data-p'));
      render();
      // Back to the top of the list — otherwise page 2 opens halfway down.
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    else if (act === 'move') moveOpportunity(el.getAttribute('data-id'), Number(el.getAttribute('data-dir')));
    else if (act === 'rm-opp') removeOpportunity(el.getAttribute('data-id'));
    else if (act === 'goto') {
      var fieldId = el.getAttribute('data-field');
      // The past-performance fields live in a collapsed section — open it
      // first, or the jump lands on nothing.
      if (fieldId === 'gg-pp-title' && !S.ppOpen) { S.ppOpen = true; render(); }
      var target = document.getElementById(fieldId);
      if (target) {
        if (target.scrollIntoView) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        target.focus();
      }
    }
    else if (act === 'toggle-pp') { S.ppOpen = !S.ppOpen; render(); }
    else if (act === 'profile') toggleProfile();
    // Only the backdrop itself closes, never a click that bubbled from inside
    // the panel — otherwise pressing "Change" would shut the thing first.
    else if (act === 'profile-close' && (el === e.target || el.tagName === 'BUTTON')) {
      S.profileOpen = false; render();
    }
    else if (act === 'details') toggleDetails();
    else if (act === 'save-profile') saveProfile();
    else if (act === 'add-pp') addPastPerformance();
    else if (act === 'rm-pp') removePastPerformance(el.getAttribute('data-id'));
  });

  // The settings country picker is a <select>, which fires change rather than
  // click, so the delegated click handler above never sees it.
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'gg-country') {
      S.country = e.target.value;
      render();
      focus('gg-key');
    }
  });

  // Every keystroke in a sidebar field goes into the draft. No render here —
  // re-rendering on input would move the caret; this only has to survive a
  // render triggered by something else.
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el && el.id && el.id.indexOf('gg-') === 0 && el.tagName === 'INPUT') {
      S.draft[el.id] = el.value;
    }
  });

  // Enter submits whichever field the visitor is in — on a page this small,
  // reaching for the mouse to continue would be the clumsiest part of it.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var id = e.target && e.target.id;
    if (id === 'gg-email' || id === 'gg-company') { e.preventDefault(); sendCode(); }
    else if (id === 'gg-code') { e.preventDefault(); verifyCode(); }
    else if (id === 'gg-key') { e.preventDefault(); linkKey(); }
    else if (id === 'gg-q') { e.preventDefault(); search(); }
  });

  // Google Identity Services calls this once its script has loaded.
  window.ggOnGoogleLoad = function () { if (!S.token) mountGoogle(); };

  boot();
})();
