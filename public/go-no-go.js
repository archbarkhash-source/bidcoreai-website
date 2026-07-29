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

    // Workspace
    query: localStorage.getItem(QUERY_KEY) || '',
    results: null,       // null = not searched yet
    openId: null,        // which result's analysis is expanded
    score: null,
    detailsOpen: false,

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
        S.step = null;
        S.notice = null;
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
    S.busy = true; S.error = null; S.openId = null; S.score = null; render();

    api('/search?q=' + encodeURIComponent(S.query))
      .then(function (body) {
        S.busy = false;
        S.results = body.results || [];
        render();
      })
      .catch(function (e) { S.results = []; fail(e); });
  }

  function analyse(index) {
    var r = S.results[index];
    var id = r.notice_id || r.solicitation_number || String(index);
    if (S.openId === id) { S.openId = null; S.score = null; render(); return; }

    S.openId = id; S.score = null; S.busy = true; S.error = null; render();

    api('/score', { method: 'POST', body: r })
      .then(function (body) {
        S.busy = false;
        S.score = body.result;
        if (body.readiness) S.readiness = body.readiness;
        render();
      })
      .catch(function (e) { S.openId = null; fail(e); });
  }

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

    return '<div class="gg-wrap">' + viewSteps(1) +
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

    return '<div class="gg-wrap">' + viewSteps(2) +
      '<div class="gg-card">' +
        '<h2 class="gg-h2">Connect your ' + esc(portal) + ' API key</h2>' +
        '<p class="gg-sub">Searches run on your own key, so the results and the quota are yours.</p>' +
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
          '<button class="gg-btn gg-btn--ghost" data-act="to-country">Back</button>' +
          '<button class="gg-btn" style="flex:1" data-act="link-key"' + (S.busy ? ' disabled' : '') + '>' +
            (S.busy ? '<span class="gg-spin"></span> Verifying…' : 'Connect and start ' + icon('gg-arrow', 15)) +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function viewChecklist() {
    var r = S.readiness;
    if (!r) return '';
    var items = ['api_key', 'naics', 'certifications', 'office', 'past_performance'];
    return '<div class="gg-check" style="margin-bottom:18px">' + items.map(function (k) {
      var it = r[k];
      if (!it) return '';
      var cls = it.complete ? 'is-done' : (it.blocking ? 'is-required' : '');
      return '<span class="gg-chip ' + cls + '" title="' + esc(it.hint) + '">' +
        '<span class="gg-chip-box"></span>' + esc(it.label) + '</span>';
    }).join('') + '</div>';
  }

  function viewResult(r, i) {
    var id = r.notice_id || r.solicitation_number || String(i);
    var open = S.openId === id;
    var meta = [
      r.agency,
      [r.place_of_performance_city, r.place_of_performance_state].filter(Boolean).join(', '),
      r.solicitation_naics ? 'NAICS ' + r.solicitation_naics : null,
      r.solicitation_due_date ? 'due ' + r.solicitation_due_date : null,
    ].filter(Boolean).join(' · ');

    return '<div class="gg-result">' +
      '<div class="gg-result-top">' +
        '<div style="min-width:240px;flex:1">' +
          '<div class="gg-result-title">' + esc(r.title || r.solicitation_number || 'Untitled notice') + '</div>' +
          '<div class="gg-result-meta">' + esc(meta) + '</div>' +
        '</div>' +
        '<div class="gg-result-actions">' +
          (r.ui_link ? '<a class="gg-btn gg-btn--ghost gg-btn--small" href="' + esc(r.ui_link) + '" target="_blank" rel="noopener">SAM.gov ' + icon('gg-ext', 13) + '</a>' : '') +
          '<button class="gg-btn gg-btn--small" data-act="analyse" data-i="' + i + '">' +
            (open ? 'Hide analysis' : 'Go/No-Go') + '</button>' +
        '</div>' +
      '</div>' +
      (open ? '<div style="border-top:1px solid var(--gg-line);margin-top:16px;padding-top:16px">' +
        (S.score ? viewScore(S.score) : '<div class="gg-skeleton">Scoring 12 criteria…</div>') +
      '</div>' : '') +
    '</div>';
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

  function viewCompanyDetails() {
    var p = S.profile || {};
    var perf = p.past_performance || [];
    return '<details class="gg-card" style="margin-top:16px"><summary style="cursor:pointer;font-weight:700;font-size:15px">' +
        'Improve my score' +
        '<span class="gg-muted" style="font-weight:400;font-size:13px"> — the more we know about your company, the more of the 12 criteria can score</span>' +
      '</summary>' +
      '<div style="margin-top:20px">' +
        '<div class="gg-grid2">' +
          field('gg-naics', 'NAICS codes you hold', (p.naics_codes || []).join(', '), '236220, 238160') +
          field('gg-certs', 'Certifications', (p.certifications || []).join(', '), '8(a), HUBZone, SDVOSB') +
          field('gg-states', 'States you work in', (p.states_served || []).join(', '), 'VA, MD, DC') +
          field('gg-office', 'Office address', p.office_address || '', '123 Main St, Richmond, VA') +
          field('gg-bond', 'Bonding capacity ($)', p.bonding_capacity || '', '5000000') +
          field('gg-min', 'Smallest job you take ($)', p.project_value_min || '', '100000') +
          field('gg-max', 'Largest job you take ($)', p.project_value_max || '', '5000000') +
        '</div>' +
        '<button class="gg-btn gg-btn--small" data-act="save-profile"' + (S.busy ? ' disabled' : '') + '>Save</button>' +

        '<div class="gg-list-title">Past performance</div>' +
        perf.map(function (r) {
          return '<div class="gg-row"><span>' + esc(r.title) +
            (r.agency ? ' <span class="gg-muted">· ' + esc(r.agency) + '</span>' : '') +
            '</span><button class="gg-row-x" data-act="rm-pp" data-id="' + r.id + '" aria-label="Remove">&times;</button></div>';
        }).join('') +
        '<div class="gg-grid2">' +
          field('gg-pp-title', 'Project', '', 'Barracks roof replacement, Fort Lee') +
          field('gg-pp-agency', 'Agency', '', 'USACE') +
          field('gg-pp-value', 'Contract value ($)', '', '1200000') +
        '</div>' +
        '<button class="gg-btn gg-btn--small gg-btn--ghost" data-act="add-pp">Add project</button>' +

        '<div class="gg-list-title">Connected account</div>' +
        '<div class="gg-row">' +
          '<span>' + (p.has_api_key ? 'SAM.gov key ****' + esc(p.api_key_hint || '') : 'No key connected') + '</span>' +
          '<button class="gg-btn gg-btn--link" style="margin-left:auto" data-act="to-country">Change</button>' +
          (p.has_api_key ? '<button class="gg-btn gg-btn--link" style="margin-left:14px" data-act="rm-key">Remove</button>' : '') +
        '</div>' +
      '</div>' +
    '</details>';
  }

  function field(id, label, value, placeholder) {
    return '<div class="gg-field">' +
      '<label class="gg-label" for="' + id + '">' + esc(label) + '</label>' +
      '<input class="gg-input" id="' + id + '" value="' + esc(value) + '" placeholder="' + esc(placeholder) + '"/>' +
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
      body = S.results.map(viewResult).join('');
    }

    return '<div class="gg-wrap gg-wrap--wide">' +
      viewChecklist() +
      messages() +
      '<div class="gg-card" style="margin-bottom:16px">' +
        '<div class="gg-search">' +
          '<input class="gg-input" id="gg-q" value="' + esc(S.query) + '" ' +
            'placeholder="What do you build? e.g. roofing, HVAC, paving — or a NAICS or solicitation number"/>' +
          '<button class="gg-btn" data-act="search"' + (S.busy ? ' disabled' : '') + '>' +
            (S.busy ? '<span class="gg-spin"></span> Searching…' : icon('gg-search', 15) + ' Search') +
          '</button>' +
        '</div>' +
      '</div>' +
      body +
      viewCompanyDetails() +
      '<div class="gg-cta">' +
        '<div><h3 class="gg-h3">This is the quick score. The full picture is in BidcoreAI.</h3>' +
        '<p class="gg-muted" style="margin:0;font-size:13.5px">A full account adds the capture pipeline, automatic ' +
        'solicitation-document import, amendment tracking, document-level deep Go/No-Go, compliance matrices and ' +
        'proposal drafting.</p></div>' +
        // New tab, deliberately: the visitor keeps their workspace, their
        // search and their analysis rather than losing all three to the
        // product's login screen.
        '<a class="gg-btn" href="' + esc(S.config.app_url) + '/signup" target="_blank" rel="noopener">' +
          'Create your account ' + icon('gg-arrow', 15) + '</a>' +
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

    // Signed out, the header carries no link at all: every exit from this page
    // before the visitor has seen a result is a lost lead.
    head.innerHTML = signedIn
      ? (S.usage ? '<span class="gg-usage">' + S.usage.scores_today + '/' + S.usage.scores_limit + ' analyses today</span>' : '') +
        '<button class="gg-btn gg-btn--link" data-act="sign-out">Sign out</button>'
      : '';

    if (stage === 'signup') app.innerHTML = viewSignUp();
    else if (stage === 'country') app.innerHTML = viewCountry();
    else if (stage === 'apikey') app.innerHTML = viewApiKey();
    else app.innerHTML = viewWorkspace();

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
    else if (act === 'to-country') { S.step = 'country'; S.error = null; render(); }
    else if (act === 'link-key') { e.preventDefault(); linkKey(); }
    else if (act === 'rm-key') removeKey();
    else if (act === 'search') { e.preventDefault(); search(); }
    else if (act === 'analyse') analyse(Number(el.getAttribute('data-i')));
    else if (act === 'details') toggleDetails();
    else if (act === 'save-profile') saveProfile();
    else if (act === 'add-pp') addPastPerformance();
    else if (act === 'rm-pp') removePastPerformance(el.getAttribute('data-id'));
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
