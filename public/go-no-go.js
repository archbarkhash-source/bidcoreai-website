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
  // Sidebar edits that have not been saved yet. Ticking 28 NAICS codes, closing
  // the picker and seeing "28 selected" looks exactly like a saved profile — so a
  // reload used to throw all of it away without ever having said it was unsaved.
  // Kept here so a refresh restores the work, and marked in the panel so it is
  // clear it still needs saving.
  var DRAFT_KEY = 'bca_go_no_go_profile_draft';
  // The keys in S.draft that make up the company profile — and only those. The
  // same object also holds the search box, the sign-in code and the SAM.gov API
  // key: none of those may be written to disk, and typing in the search box must
  // not mark the profile unsaved.
  var PROFILE_KEYS = ['naics', 'certs', 'states', 'types', 'lead',
    'gg-office', 'gg-bond', 'gg-min', 'gg-max'];
  // Ten to a page: enough to scan without scrolling past the sidebar's own
  // content, and short enough that the Go/No-Go button is always near.
  var PAGE_SIZE = 10;
  // Checklist chip -> the sidebar field that satisfies it.
  var FIELD_FOR = {
    naics: 'gg-naics-head',
    certifications: 'gg-set-asides',
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

  function loadDraft() {
    try {
      var parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      return {};   // corrupt entry: start clean rather than throw on boot
    }
  }

  /** True when the sidebar holds edits the server has not been told about. */
  function hasProfileDraft() {
    return PROFILE_KEYS.some(function (k) {
      return Object.prototype.hasOwnProperty.call(S.draft, k);
    });
  }

  /** Writes the unsaved sidebar edits to disk and marks the panel's footer.
   *  Called from the field handlers, which deliberately do not re-render — the
   *  page redraws wholesale, and doing that on every keystroke or tick would
   *  fight the person typing. So the one thing that has to change on screen is
   *  set directly instead. */
  function keepDraft() {
    var out = {};
    PROFILE_KEYS.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(S.draft, k)) out[k] = S.draft[k];
    });
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(out)); }
    catch (e) { /* private mode or quota: the session still holds it */ }
    var foot = document.querySelector('.gg-side-foot');
    if (foot) foot.classList.add('is-dirty');
  }

  /** After a successful save, and whenever the workspace changes hands. */
  function dropDraft() {
    S.draft = {};
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* private mode */ }
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
    month: '',           // 'YYYY-MM' due-date filter, '' = every month
    // Place-of-performance filter: '' every state, 'mine' the states on the
    // profile, or a single code. Separate from the profile's states, which are
    // a SCORING input — a distant opportunity should still be visible, just
    // scored down for distance, unless the visitor asks to hide it.
    place: '',
    pipeMonth: '',       // 'YYYY-MM' filter over the board
    period: 'month',     // dashboard grain: 'month' | 'year'
    hoverBar: null,      // which bar the pointer is on
    // Last dismissed row, held so it can be put back. One deep, like an email
    // client: undo is for the mistake you just made, not a history.
    undo: null,
    setAsideOpen: false, // the two tick lists start collapsed — they are long,
    typesOpen: false,    // and most visitors set them once
    statesOpen: false,
    naicsOpen: false,
    sort: 'due',         // 'due' = soonest deadline first | 'none' = as SAM.gov returned
    scoring: false,      // the panel's own loading state, separate from busy
    score: null,
    detailsOpen: false,
    // Every verdict produced this session, keyed the same way the feed keys its
    // rows: { score, recommendation }. The panel holds one at a time; this holds
    // all of them, so a scored row keeps showing its number after the panel has
    // moved on, and Save can send the verdict for the row being saved rather
    // than whichever one is on screen.
    verdicts: {},

    // What is typed into the sidebar right now. The page re-renders wholesale
    // on every state change, which recreates those inputs — without this, a
    // background refresh landing mid-sentence would wipe what you were typing,
    // and the fields would snap back to the last saved values. Cleared on a
    // successful save, when the server's copy becomes the truth again — and
    // restored from disk on boot, so a reload with edits pending does not throw
    // them away.
    draft: loadDraft(),
    // Sidebar sections that are collapsed by default — past performance is
    // add-once-and-forget, so it should not push the fields you edit often
    // below the fold.
    ppOpen: false,
    editAccount: false,  // Settings > Account, in edit mode

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

  // Icons live in the inline <svg> sprite in go-no-go.html under a "gg-i-"
  // prefix that nothing else may use. Ids share one namespace per document, and
  // getElementById returns whichever comes FIRST — the sprite sits at the top of
  // <body>, so a symbol named after a field (there was a "gg-key" symbol and a
  // "gg-key" input) wins, and val() reads .value off an SVGSymbolElement, which
  // has none. That threw on every "Connect and start". Keep the prefix here, in
  // one place, so a new icon can never shadow a form field again.
  function icon(name, size) {
    var s = size || 16;
    return '<svg width="' + s + '" height="' + s + '" aria-hidden="true"><use href="#gg-i-' + name + '"/></svg>';
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

  // Reads a field. `typeof el.value` rather than a plain truthiness check: if an
  // id ever collides with a non-field element again, this returns '' — the same
  // as an empty field — instead of throwing and killing the click handler.
  var val = function (id) {
    var el = document.getElementById(id);
    return el && typeof el.value === 'string' ? el.value.trim() : '';
  };

  /** Groups a money value in thousands for display: 300000 -> "300,000". Nobody
   *  reads 1000000 at a glance, and on this form the difference between a $1M
   *  and a $10M ceiling decides which bids come back GO.
   *
   *  Everything but digits and a decimal point is dropped, so the same function
   *  can be run over a value it has already formatted — which is what happens on
   *  every re-render. A trailing point survives ("1200." stays "1,200."): that
   *  is a number halfway through being typed, not a broken one. */
  function groupMoney(raw) {
    var parts = String(raw == null ? '' : raw).replace(/[^\d.]/g, '').split('.');
    var whole = parts.shift().replace(/^0+(?=\d)/, '');
    var rest = parts.length ? '.' + parts.join('').slice(0, 2) : '';
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + rest;
  }

  /** The other direction: what the server is allowed to see. The grouping is
   *  display only — Number('300,000') is NaN, and the API reads NaN as "leave
   *  the stored value alone", so posting the formatted string would produce a
   *  save that says "Saved." and changes nothing. */
  var moneyVal = function (id) { return val(id).replace(/[^\d.]/g, ''); };

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

  /** Re-read the workspace: profile, readiness and today's counters. Used
   *  wherever the page shows a figure that changes while you work. */
  function refresh() {
    if (!S.token) return Promise.resolve();
    return api('/me').then(function (body) {
      adopt(body);
      render();
    }).catch(function () { /* a failed refresh must not disturb the view */ });
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
    // A draft left on this browser was typed against whichever workspace was
    // open before. Signing in may be a different one, and applying one company's
    // NAICS codes to another's profile is worse than losing an unsaved edit.
    dropDraft();
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

  // Three separate reasons this button can fail to appear, and until now all
  // three looked identical from the outside — an empty space where Google should
  // be, which is exactly how "works locally, missing in the cloud" happens. Each
  // one now names itself in the console, so whoever is looking knows whether to
  // go to the host's env vars or to the Google console.
  function mountGoogle() {
    var host = document.getElementById('gg-google');
    if (!host) return;

    if (!S.config.google_client_id) {
      warnGoogle('GOOGLE_CLIENT_ID is not set on this host, so /go-no-go/api/config ' +
        'reports no client id and the button is hidden. Set it in the host\'s ' +
        'environment (Vercel: Project → Settings → Environment Variables; Render: ' +
        'Service → Environment) and redeploy. Emailed codes work without it.');
      return;
    }
    if (!window.google || !window.google.accounts) {
      warnGoogle('accounts.google.com/gsi/client has not loaded — blocked by a network, ' +
        'an extension or a content-security policy. ggOnGoogleLoad remounts the button ' +
        'if it arrives later.');
      return;
    }

    window.google.accounts.id.initialize({
      client_id: S.config.google_client_id,
      callback: window.ggGoogleCallback,
    });
    window.google.accounts.id.renderButton(host, {
      theme: 'outline', size: 'large', width: 320, text: 'continue_with', shape: 'rectangular',
    });

    // Google rejects an unregistered origin by logging origin_mismatch and
    // drawing nothing at all — no exception to catch, so the only tell is that
    // the host stayed empty.
    setTimeout(function () {
      if (host.childElementCount === 0) {
        warnGoogle('Google declined to render the button for origin ' + location.origin +
          '. Add that exact origin (scheme + host, no path) to the OAuth client\'s ' +
          'Authorised JavaScript origins in the Google Cloud console.');
      }
    }, 1200);
  }

  function warnGoogle(why) {
    if (window.console && console.warn) console.warn('[go-no-go] Google sign-in unavailable: ' + why);
  }

  function signOut() {
    api('/sign-out', { method: 'POST' }).catch(function () { /* token dies locally regardless */ });
    localStorage.removeItem(TOKEN_KEY);
    S.token = null; S.profile = null; S.readiness = null;
    S.results = null; S.score = null; S.step = null; S.codeSent = false;
    // Verdicts and unsaved edits belong to the workspace that produced them, and
    // the next person to sign in on this browser must not inherit either.
    S.verdicts = {};
    dropDraft();
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
    S.busy = true; S.error = null; S.openId = null; S.score = null; S.scoreFor = null; S.page = 0; S.month = ''; S.place = ''; render();

    api('/search?q=' + encodeURIComponent(S.query))
      .then(function (body) {
        S.busy = false;
        S.results = body.results || [];
        S.filteredOut = body.filtered_out || 0;
        cacheResults(S.results);
        adopt(body);          // fresh usage counters
        render();
      })
      .catch(function (e) { S.results = []; fail(e); });
  }

  function analyse(index) {
    var r = visibleResults()[index];
    if (!r) return;
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
    // Stacked on a phone the panel is far below the list — go to it now, so the
    // "Scoring 12 criteria…" line is the answer to the press.
    revealScorePanel();

    api('/score', { method: 'POST', body: r })
      .then(function (body) {
        S.scoring = false;
        S.score = body.result;
        // Analysing does NOT put the notice in the pipeline. It used to, and the
        // row then vanished from the feed the instant it was scored — because the
        // feed hides anything already in the pipeline — leaving a verdict in the
        // panel for a row you could no longer see, and a card sitting in Under
        // Review that nobody had decided to track. Reading a score is not a
        // commitment; Save is. The board only gains a card when Save is pressed,
        // and only changes stage when a stage button is.
        //
        // So the verdict is kept here against the row instead: it has to outlive
        // analysing the next one, both so the feed can go on showing it and so
        // Save sends it whatever the panel has moved on to.
        S.verdicts[id] = {
          score: body.result.overall_score,
          recommendation: body.result.recommendation,
        };
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
        if (body.expired) {
          // Say it rather than letting cards vanish silently.
          S.notice = body.expired + ' opportunit' + (body.expired === 1 ? 'y' : 'ies') +
            ' cleared from Under Review after 30 days.';
          setTimeout(function () { S.notice = null; render(); }, 6000);
        }
        render();
      })
      .catch(function () { /* an empty pipeline is the normal first state */ });
  }

  /** Keep a notice. Carries the score across when one has just been run, so a
   *  card arrives in the pipeline already carrying its verdict. */
  function saveOpportunity(index) {
    var r = visibleResults()[index];
    if (!r) return;
    var id = r.notice_id || r.solicitation_number || String(index);
    var body = JSON.parse(JSON.stringify(r));
    // Whatever this row scored, not whatever the panel happens to be showing:
    // analysing three notices and then saving the first used to save it with no
    // verdict at all, because the panel had moved on.
    var verdict = S.verdicts[id];
    if (verdict) {
      body.score = verdict.score;
      body.recommendation = verdict.recommendation;
    }
    api('/opportunities', { method: 'POST', body: body })
      .then(function () {
        // Name the stage: saving is now the only thing that puts a notice on the
        // board, so it should say where it landed.
        S.notice = verdict
          ? 'Saved to Under Review, with its score.'
          : 'Saved to Under Review.';
        render();
        setTimeout(function () { S.notice = null; render(); }, 2500);
        return loadOpportunities();
      })
      .catch(fail);
  }

  /** How the score is arrived at, in the order someone reading a verdict
   *  wants it. Written once, shown in Settings. */
  /** The current bands, as the server reports them. Never a second copy of the
   *  numbers — if the thresholds are retuned, every sentence on the page
   *  follows without an edit. */
  function bandsText() {
    var b = S.config.bands;
    return b && b.summary ? b.summary : 'GO / NOT SURE / NO-GO by score';
  }

  function scoringTips() { return [
    ['Twelve criteria, weighted',
     'What the work is (NAICS, 18%) and whether you do it (capability, 15%) count for most; ' +
     'eligibility and time to respond come next; the code it is filed under counts for least. ' +
     'Each scores 0\u2013100.'],
    ['One bad criterion can hold a verdict back',
     'A roofer is not a highway contractor because the paperwork suits them. If the work, your ' +
     'capability, the size, the deadline or the bonding scores badly, a clean GO is held back ' +
     'to “review required” however well everything else did — and the verdict names ' +
     'which criterion held it.'],
    [bandsText(),
     'The band is the recommendation. Open the full calculation under any verdict to see ' +
     'exactly what each criterion contributed.'],
    ['50 means \u201cnothing on file\u201d',
     'Not a bad score \u2014 an unknown. A criterion with nothing to compare against stays ' +
     'neutral rather than counting against the opportunity.'],
    ['Two things override the average',
     'A deadline that has already passed, and a set-aside you do not hold. Both make the bid ' +
     'impossible rather than unattractive, so they score 0 outright instead of being averaged ' +
     'away by eleven good criteria.'],
    ['Half the weight unknown means no verdict',
     'If most of what the score is made of has nothing to weigh, you get NEEDS MORE INFO ' +
     'instead of a recommendation — judging an empty profile is not judging the ' +
     'opportunity. Filling in the heavy criteria is what unlocks a real answer, not filling ' +
     'in the most fields.'],
    ['What sharpens it fastest',
     'NAICS codes first \u2014 the largest single input. Then set-asides (they decide ' +
     'eligibility outright), your office address (distance), and one or two past projects.'],
  ]; }

  /** Getting a SAM.gov API key. Steps as they appear on sam.gov, because
   *  \u201cAccount Details\u201d is not where most people look first. */
  var API_KEY_STEPS = [
    'Sign in at sam.gov \u2014 a free personal account is enough. You do not need a UEI or an ' +
      'active entity registration just to read opportunities.',
    'Open the account menu with your name, top right, and choose Account Details.',
    'Scroll to the API Key section and choose Request API Key (or Regenerate if one exists).',
    'Re-enter your SAM.gov password when prompted \u2014 that is what reveals the key.',
    'Copy the whole string. SAM.gov shows it once; if you lose it, regenerate rather than guess.',
    'Paste it here. It is stored encrypted and only its last four characters are ever displayed.',
  ];

  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  /** 'YYYY-MM' -> 'August 2026'. */
  function monthLabel(key) {
    var bits = key.split('-');
    return MONTH_NAMES[Number(bits[1]) - 1] + ' ' + bits[0];
  }

  /** Every month present in the current feed, earliest first, with counts. */
  function monthsInFeed() {
    var counts = {};
    (S.results || []).forEach(function (r) {
      var d = r.solicitation_due_date;
      if (d && d.length >= 7) counts[d.slice(0, 7)] = (counts[d.slice(0, 7)] || 0) + 1;
    });
    return Object.keys(counts).sort().map(function (k) {
      return { key: k, label: monthLabel(k), count: counts[k] };
    });
  }

  /** Every state present in the current feed, with counts. */
  function statesInFeed() {
    var counts = {};
    (S.results || []).forEach(function (r) {
      var st = (r.place_of_performance_state || '').toUpperCase();
      if (st) counts[st] = (counts[st] || 0) + 1;
    });
    return Object.keys(counts).sort().map(function (k) { return { key: k, count: counts[k] }; });
  }

  /** What the feed actually shows: the month filter applied, then ordered by
   *  deadline. Everything that acts on a row (save, analyse, paginate) works
   *  off this same array, so an index never means two different things. */
  function visibleResults() {
    var mine = (S.profile && S.profile.states_served) || [];
    var rows = (S.results || []).filter(function (r) {
      // Anything SAVED lives in the pipeline now, and leaving it in the feed as
      // well means deciding twice about the same notice. Analysed is not saved:
      // a scored notice stays right here, marked with its verdict, until you
      // decide it is worth tracking.
      if (savedFor(r)) return false;
      if (S.month && (r.solicitation_due_date || '').slice(0, 7) !== S.month) return false;
      if (!S.place) return true;
      var st = (r.place_of_performance_state || '').toUpperCase();
      return S.place === 'mine' ? mine.indexOf(st) !== -1 : st === S.place;
    });
    if (S.sort === 'due') {
      rows = rows.slice().sort(function (a, b) {
        // Undated notices last: a missing deadline is not an imminent one.
        var da = a.solicitation_due_date || '9999-99-99';
        var db = b.solicitation_due_date || '9999-99-99';
        return da < db ? -1 : da > db ? 1 : 0;
      });
    }
    return rows;
  }

  /** The saved card for this notice, if it is already in the pipeline. */
  function savedFor(r) {
    return S.opportunities.filter(function (o) {
      return (r.notice_id && o.notice_id === r.notice_id) ||
             (r.solicitation_number && o.solicitation_number === r.solicitation_number) ||
             (r.title && o.title === r.title);
    })[0] || null;
  }

  function isSaved(r) { return !!savedFor(r); }

  /** Score an opportunity already in the pipeline. The notice was stored whole
   *  when it was saved, so this needs no SAM.gov call — the same rubric runs
   *  against the same fields, and the resulting verdict is written back onto
   *  the card so the board shows it without re-running anything. */
  function scoreSaved(id) {
    var o = S.opportunities.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!o) return;

    S.openId = 'saved-' + id;
    S.score = null;
    S.scoreFor = o.title || o.solicitation_number || null;
    S.scoring = true;
    S.error = null;
    render();
    revealScorePanel();

    var notice = o.raw && typeof o.raw === 'object' ? o.raw : {
      title: o.title, agency: o.agency, solicitation_number: o.solicitation_number,
      solicitation_naics: o.naics, solicitation_set_aside: o.set_aside,
      solicitation_due_date: o.due_date,
      place_of_performance_city: o.city, place_of_performance_state: o.state,
      ui_link: o.ui_link,
    };

    api('/score', { method: 'POST', body: notice })
      .then(function (body) {
        S.scoring = false;
        S.score = body.result;
        adopt(body);
        render();
        // Keep the card's badge in step with the verdict just produced.
        return api('/opportunities', {
          method: 'POST',
          body: Object.assign({}, notice, {
            notice_id: o.notice_id, solicitation_number: o.solicitation_number,
            score: body.result.overall_score, recommendation: body.result.recommendation,
          }),
        }).then(loadOpportunities);
      })
      .catch(function (e) { S.scoring = false; S.openId = null; S.scoreFor = null; fail(e); });
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

  /** Empty a whole stage. Confirmed, because it removes work rather than a
   *  single card, and named so the confirmation says which column. */
  function clearStage(key) {
    var stage = S.stages.filter(function (st) { return st.key === key; })[0];
    var n = S.opportunities.filter(function (o) { return o.status === key; }).length;
    if (!window.confirm('Remove all ' + n + ' opportunit' + (n === 1 ? 'y' : 'ies') +
        ' from ' + (stage ? stage.label : key) + '? This cannot be undone.')) return;

    S.opportunities = S.opportunities.filter(function (o) { return o.status !== key; });
    render();
    api('/opportunities/stage/' + encodeURIComponent(key), { method: 'DELETE' })
      .then(loadOpportunities)
      .catch(fail);
  }

  /** Remove every card due in the selected month, across all stages. Named in
   *  the confirmation, and counted, because this can take away work that was
   *  deliberately advanced — unlike the automatic 30-day clear, which only
   *  ever touches Under Review. */
  function clearMonth() {
    if (!S.pipeMonth) return;
    var month = S.pipeMonth;
    var doomed = S.opportunities.filter(function (o) {
      return (o.due_date || '').slice(0, 7) === month;
    });
    if (!doomed.length) return;

    var advanced = doomed.filter(function (o) { return o.status !== 'under_review'; }).length;
    if (!window.confirm(
      'Remove all ' + doomed.length + ' opportunit' + (doomed.length === 1 ? 'y' : 'ies') +
      ' due in ' + monthLabel(month) + '?' +
      (advanced ? '\n\n' + advanced + ' of them have been moved past Under Review.' : '') +
      '\n\nThis cannot be undone.'
    )) return;

    S.opportunities = S.opportunities.filter(function (o) {
      return (o.due_date || '').slice(0, 7) !== month;
    });
    S.pipeMonth = '';
    render();
    api('/opportunities/month/' + encodeURIComponent(month), { method: 'DELETE' })
      .then(loadOpportunities)
      .catch(fail);
  }

  function removeOpportunity(id) {
    S.opportunities = S.opportunities.filter(function (o) { return String(o.id) !== String(id); });
    render();
    api('/opportunities/' + id, { method: 'DELETE' }).then(loadOpportunities).catch(fail);
  }

  /** Empty the feed. Purely local — the results and their cache are on this
   *  machine, so nothing is re-requested and no SAM.gov quota is spent. Saved
   *  opportunities are untouched; they live in the pipeline. */
  function clearFeed() {
    S.results = null;
    S.undo = null;
    S.page = 0;
    S.openId = null;
    S.score = null;
    S.scoreFor = null;
    try { localStorage.removeItem(RESULTS_KEY); } catch (e) { /* private mode */ }
    render();
  }

  /** Drop one notice from the feed. Local only — nothing is deleted anywhere,
   *  the row is simply not shown. Kept in S.undo so the next click can put it
   *  back at the position it came from. */
  function dismissResult(index) {
    var row = visibleResults()[index];
    if (!row) return;
    var at = S.results.indexOf(row);
    if (at === -1) return;

    S.undo = { row: row, at: at, title: row.title || row.solicitation_number || 'That notice' };
    S.results = S.results.slice(0, at).concat(S.results.slice(at + 1));
    cacheResults(S.results);
    if (S.openId === (row.notice_id || row.solicitation_number)) {
      S.openId = null; S.score = null; S.scoreFor = null;
    }
    render();

    // The offer expires, like every undo toast — but only if it is still the
    // same one, so a second dismissal does not cancel the first's timer.
    var mine = S.undo;
    setTimeout(function () { if (S.undo === mine) { S.undo = null; render(); } }, 8000);
  }

  function undoDismiss() {
    if (!S.undo) return;
    var restored = S.undo;
    S.results = S.results.slice(0, restored.at).concat([restored.row], S.results.slice(restored.at));
    cacheResults(S.results);
    S.undo = null;
    render();
  }

  function setView(v) { S.view = v; S.error = null; render(); }
  function toggleProfile() { S.profileOpen = !S.profileOpen; render(); }

  /** Company and name only. Both go through the same profile endpoint as the
   *  sidebar fields, so there is one write path for the workspace record. */
  function saveAccount() {
    S.busy = true; S.error = null; render();
    api('/profile', {
      method: 'PUT',
      body: { company: val('gg-acct-company'), name: val('gg-acct-name') },
    }).then(function (body) {
      adopt(body);
      delete S.draft['gg-acct-company'];
      delete S.draft['gg-acct-name'];
      S.editAccount = false;
      S.busy = false;
      S.notice = 'Account updated.';
      render();
      setTimeout(function () { S.notice = null; render(); }, 2500);
    }).catch(fail);
  }

  function saveProfile() {
    S.busy = true; S.error = null; render();
    api('/profile', {
      method: 'PUT',
      body: {
        naics_codes: S.draft.naics || (S.profile && S.profile.naics_codes) || [],
        certifications: S.draft.certs || (S.profile && S.profile.certifications) || [],
        contract_types: S.draft.types || (S.profile && S.profile.contract_types) || [],
        min_bid_days: S.draft.lead != null ? S.draft.lead : (S.profile && S.profile.min_bid_days),
        states_served: S.draft.states || (S.profile && S.profile.states_served) || [],
        office_address: val('gg-office'),
        bonding_capacity: moneyVal('gg-bond'),
        project_value_min: moneyVal('gg-min'),
        project_value_max: moneyVal('gg-max'),
      },
    }).then(function (body) {
      adopt(body);
      // The saved profile is now authoritative, so drop the drafts — from disk as
      // well as from memory — and let the sidebar redraw from it, which is also
      // the confirmation that it stuck.
      dropDraft();
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
      body: { title: title, agency: val('gg-pp-agency'), contract_value: moneyVal('gg-pp-value') },
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
          (S.busy ? '<span class="gg-spin"></span> Sending…' : 'Continue ' + icon('arrow', 15)) +
        '</button>' +
        '<p class="gg-hint">We email you a code — no password to create or remember.</p>';

    return '<div class="gg-wrap gg-wrap--wide"><div class="gg-hero">' +
      '<div>' +
        '<h1 class="gg-h1">Should you bid it?<br/>Find out in 30 seconds.</h1>' +
        '<p class="gg-lead">Search live federal solicitations with your own SAM.gov key and get an instant ' +
          'GO / REVIEW / NO-GO — scored across 12 criteria against your company. Free, no card.</p>' +
        '<ul>' +
          '<li>' + icon('check', 18) + '<span>Your SAM.gov key, your quota, your data</span></li>' +
          '<li>' + icon('check', 18) + '<span>12 scored criteria, with the reason behind every score</span></li>' +
          '<li>' + icon('check', 18) + '<span>Set up in three steps — sign in, country, key</span></li>' +
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
        (i < current ? icon('check', 12) : i + 1) + '</span><b>' + l + '</b></div>' +
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
          (selected && selected.connected ? '' : ' disabled') + '>Continue ' + icon('arrow', 15) + '</button>' +
      '</div>' +
    '</div>';
  }

  function viewApiKey() {
    var countries = S.config.countries || [];
    var portal = (countries.filter(function (c) { return c.code === S.country; })[0] || {}).portal || 'SAM.gov';
    var p = S.profile || {};

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
        '<div class="gg-msg">' +
          '<div style="display:flex;gap:8px;align-items:center;font-weight:600;margin-bottom:8px">' +
            icon('bulb', 15) + 'How to get one — it is free' +
          '</div>' +
          '<ol class="gg-steps-list">' +
            API_KEY_STEPS.map(function (t) { return '<li>' + t + '</li>'; }).join('') +
          '</ol>' +
          '<div style="margin-top:10px">' +
            '<a href="https://sam.gov" target="_blank" rel="noopener" ' +
              'style="color:var(--gg-orange);font-weight:600">Open sam.gov ' + icon('ext', 12) + '</a>' +
          '</div>' +
        '</div>' +
        (p.has_api_key
          // Show what is already stored before asking for a replacement — a
          // blank box gives no way to tell whether the right key is on file.
          ? '<div class="gg-prof-row" style="margin-bottom:14px">' +
              '<span class="gg-muted">Current key:</span>' +
              '<span><code>****' + esc(p.api_key_hint || '') + '</code></span>' +
            '</div>'
          : '') +
        '<div class="gg-field">' +
          '<label class="gg-label" for="gg-key">' +
            (p.has_api_key ? 'New API key' : 'API key') + '</label>' +
          '<input class="gg-input" id="gg-key" type="password" autocomplete="off" autofocus ' +
            'placeholder="' + (p.has_api_key
              ? 'Paste a new key to replace the one above'
              : 'Paste your ' + esc(portal) + ' API key') + '" value=""/>' +
        '</div>' +
        '<div style="display:flex;gap:10px">' +
          (S.settingsMode
            // Back to Settings, not out to the workspace: Cancel undoes the
            // trip you just made, it does not abandon where you were.
            ? '<button class="gg-btn gg-btn--ghost" data-act="back-to-settings">Cancel</button>'
            : '<button class="gg-btn gg-btn--ghost" data-act="to-country">Back</button>') +
          '<button class="gg-btn" data-act="link-key"' + (S.busy ? ' disabled' : '') + '>' +
            (S.busy ? '<span class="gg-spin"></span> Verifying…'
              : (S.settingsMode ? 'Save key' : 'Connect and start ' + icon('arrow', 15)))
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
    var saved = savedFor(r);
    var verdict = S.verdicts[id];
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
          // The verdict stays on the row it belongs to. It used to be carried off
          // to the board the moment it was produced; now the row keeps it, so a
          // feed you have worked down shows what each notice scored instead of
          // only the last one you pressed.
          (verdict
            ? '<span class="gg-score-pill ' + verdictClass(verdict.recommendation) + '" ' +
                'title="' + esc(verdict.recommendation) + '">' + verdict.score + '</span>'
            : '') +
          (r.ui_link ? '<a class="gg-btn gg-btn--ghost gg-btn--small" href="' + esc(r.ui_link) + '" target="_blank" rel="noopener">SAM.gov ' + icon('ext', 13) + '</a>' : '') +
          '<button class="gg-btn gg-btn--ghost gg-btn--small" data-act="save" data-i="' + i + '">' +
            'Save' + '</button>' +
          // No arrow on "Analysed": the arrow said the notice had gone somewhere,
          // and it no longer goes anywhere. Pressing it again closes the panel.
          '<button class="gg-btn gg-btn--small' + (open ? ' gg-btn--ghost' : '') + '" data-act="analyse" data-i="' + i + '">' +
            (open ? 'Analysed' : 'Go/No-Go') + '</button>' +
          '<button class="gg-result-x" data-act="dismiss" data-i="' + i + '" ' +
            'title="Remove from this feed" aria-label="Remove from this feed">&times;</button>' +
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
      // Classed so a phone can drop the name and email and keep the button:
      // this is the only way into settings, the API key and sign out.
      '<span class="gg-who-text" style="text-align:left">' +
        '<span class="gg-who-name">' + esc(p.company || p.name || 'Your workspace') + '</span><br/>' +
        '<span class="gg-who-sub">' + esc(p.email || '') + '</span>' +
      '</span>' +
      // The chevron is what makes this read as a menu rather than a label.
      '<span class="gg-who-caret">' + icon('caret', 14) + '</span>' +
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

  /** Settings. One section per subject, in the order they matter: who you are,
   *  what you are connected to, what feeds the score, what you have used. Sign
   *  out sits alone at the bottom, away from everything else — it is the one
   *  action here you would not want to hit while reaching for something else. */
  function viewSettings() {
    var p = S.profile || {};
    var country = (S.config.countries || []).filter(function (c) { return c.code === (p.country_code || 'US'); })[0];
    var portal = country ? country.portal : 'SAM.gov';
    var used = S.usage || {};

    function row(label, value) {
      return '<div class="gg-prof-row"><span class="gg-muted">' + esc(label) + ':</span>' +
        '<span>' + esc(value == null || value === '' ? 'not set' : value) + '</span></div>';
    }
    function section(title, inner) {
      return '<section class="gg-set-section">' +
        '<div class="gg-side-title">' + esc(title) + '</div>' + inner + '</section>';
    }

    return '<div class="gg-wrap">' +
      '<div class="gg-set-head">' +
        '<h2 class="gg-h2" style="margin:0">Settings</h2>' +
        '<button class="gg-btn gg-btn--ghost gg-btn--small" data-act="cancel-settings">' +
          'Back to workspace</button>' +
      '</div>' +

      messages() +

      '<div class="gg-card">' +
        section('Account', S.editAccount
          // Email is not editable: it identifies the workspace, and changing it
          // would mean moving the pipeline and key to a different one.
          ? row('Email', p.email) +
            '<div style="margin-top:14px">' +
              field('gg-acct-company', 'Company', p.company || '', 'Acme Construction LLC') +
              field('gg-acct-name', 'Your name', p.name || '', 'Jane Doe') +
            '</div>' +
            '<div class="gg-set-actions">' +
              '<button class="gg-btn gg-btn--small" data-act="save-account"' +
                (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Saving...' : 'Save') + '</button>' +
              '<button class="gg-btn gg-btn--ghost gg-btn--small" data-act="cancel-account">Cancel</button>' +
            '</div>'
          : row('Email', p.email) +
            row('Company', p.company) +
            row('Name', p.name) +
            '<div class="gg-set-actions">' +
              '<button class="gg-btn gg-btn--ghost gg-btn--small" data-act="edit-account">Edit</button>' +
            '</div>') +

        section('Procurement portal',
          row('Country', country ? country.name : (p.country_code || 'US')) +
          row(portal + ' API key', p.has_api_key ? '****' + (p.api_key_hint || '') : 'not connected') +
          row('Status', p.api_key_status === 'ok' ? 'Verified with ' + portal : 'Not verified') +
          '<div class="gg-set-actions">' +
            '<button class="gg-btn gg-btn--small" data-act="edit-key">' +
              (p.has_api_key ? 'Change key or country' : 'Connect a key') + '</button>' +
            (p.has_api_key
              ? '<button class="gg-btn gg-btn--ghost gg-btn--small" data-act="rm-key">Remove key</button>'
              : '') +
          '</div>') +

        section('Usage today',
          row('Searches', (used.searches_today || 0) + ' / ' + (used.searches_limit || 60)) +
          row('Analyses', (used.scores_today || 0) + ' / ' + (used.scores_limit || 40)) +
          '<p class="gg-hint">Both reset at midnight UTC. Searches spend your own ' + esc(portal) +
            ' quota, never a shared one.</p>') +

        // Company profile is deliberately not repeated here. It is edited in
        // the workspace's left column, beside the results it explains, and two
        // views of the same fields would eventually disagree.


        section('How the score works',
          '<ul class="gg-tips-list gg-tips-list--wide">' +
            scoringTips().map(function (t) {
              return '<li><strong>' + t[0] + '</strong><br/><span class="gg-crit-why">' + t[1] +
                '</span></li>';
            }).join('') +
          '</ul>') +

        section('Getting a ' + esc(portal) + ' API key',
          '<ol class="gg-steps-list">' +
            API_KEY_STEPS.map(function (t) { return '<li>' + t + '</li>'; }).join('') +
          '</ol>' +
          '<div class="gg-set-actions">' +
            '<a class="gg-btn gg-btn--ghost gg-btn--small" href="https://sam.gov/content/api-keys" ' +
              'target="_blank" rel="noopener">Open SAM.gov API keys ' + icon('ext', 13) + '</a>' +
          '</div>') +

        '<section class="gg-set-signout">' +
          '<div>' +
            '<div style="font-weight:600;font-size:14px">Sign out</div>' +
            '<div class="gg-hint" style="margin-top:2px">Your workspace, key and pipeline stay here. ' +
              'Sign back in with the same email to pick up where you left off.</div>' +
          '</div>' +
          '<button class="gg-btn gg-btn--ghost" data-act="sign-out">Sign out</button>' +
        '</section>' +
      '</div>' +
    '</div>';
  }

  /** The capture pipeline — the app's stages, one column each. */
  /** Months present on the board, earliest first, with counts. */
  function monthsInPipeline() {
    var counts = {};
    (S.opportunities || []).forEach(function (o) {
      var d = o.due_date;
      if (d && d.length >= 7) counts[d.slice(0, 7)] = (counts[d.slice(0, 7)] || 0) + 1;
    });
    return Object.keys(counts).sort().map(function (k) {
      return { key: k, label: monthLabel(k), count: counts[k] };
    });
  }

  /** The board's own toolbar: which month, and a way to clear it. */
  function viewBoardBar() {
    var months = monthsInPipeline();
    var undated = (S.opportunities || []).filter(function (o) { return !o.due_date; }).length;
    var shown = S.opportunities.filter(function (o) {
      return !S.pipeMonth || (o.due_date || '').slice(0, 7) === S.pipeMonth;
    }).length;

    return '<div class="gg-feed-head">' +
      '<span class="gg-muted">' + shown + ' in the pipeline' +
        (S.pipeMonth ? ' due in ' + esc(monthLabel(S.pipeMonth)) : '') +
        (!S.pipeMonth && undated ? ' \u00b7 ' + undated + ' with no deadline' : '') + '</span>' +
      '<label class="gg-feed-ctl">Due' +
        '<select class="gg-input gg-input--inline" id="gg-pipe-month">' +
          '<option value=""' + (S.pipeMonth ? '' : ' selected') + '>All months</option>' +
          months.map(function (m) {
            return '<option value="' + esc(m.key) + '"' + (S.pipeMonth === m.key ? ' selected' : '') +
              '>' + esc(m.label) + ' (' + m.count + ')</option>';
          }).join('') +
        '</select>' +
      '</label>' +
      (S.pipeMonth
        ? '<button class="gg-col-clear" data-act="clear-month">Clear ' +
          esc(monthLabel(S.pipeMonth)) + '</button>'
        : '') +
    '</div>';
  }

  /**
   * Pipeline totals, grouped by deadline.
   *
   * Cards with no deadline are counted in the totals but cannot sit in a
   * period — dropping them silently would make the bars disagree with the
   * board, so they are reported separately instead.
   */
  function pipelineSummary() {
    var byPeriod = {};
    var undated = 0;
    var scored = [];
    var awarded = 0;
    var lost = 0;

    (S.opportunities || []).forEach(function (o) {
      if (o.status === 'awarded') awarded++;
      if (o.status === 'lost') lost++;
      if (typeof o.score === 'number') scored.push(o.score);

      var d = o.due_date || '';
      if (d.length < 7) { undated++; return; }
      var key = S.period === 'year' ? d.slice(0, 4) : d.slice(0, 7);
      var row = byPeriod[key] || (byPeriod[key] = { key: key, count: 0, awarded: 0, lost: 0, scores: [] });
      row.count++;
      if (o.status === 'awarded') row.awarded++;
      if (o.status === 'lost') row.lost++;
      if (typeof o.score === 'number') row.scores.push(o.score);
    });

    var periods = Object.keys(byPeriod).sort().map(function (k) {
      var r = byPeriod[k];
      r.label = S.period === 'year' ? k : monthLabel(k);
      r.avg = r.scores.length
        ? Math.round(r.scores.reduce(function (a, b) { return a + b; }, 0) / r.scores.length)
        : null;
      return r;
    });

    var decided = awarded + lost;
    return {
      periods: periods,
      undated: undated,
      total: (S.opportunities || []).length,
      awarded: awarded,
      lost: lost,
      // Only meaningful once something has been decided; shown as "—" until then
      // rather than as a confident 0%.
      winRate: decided ? Math.round((awarded / decided) * 100) : null,
      avgScore: scored.length
        ? Math.round(scored.reduce(function (a, b) { return a + b; }, 0) / scored.length)
        : null,
      scoredCount: scored.length,
    };
  }

  function tile(label, value, note, tone) {
    return '<div class="gg-tile' + (tone ? ' is-' + tone : '') + '">' +
      '<div class="gg-tile-value">' + esc(String(value)) + '</div>' +
      '<div class="gg-tile-label">' + esc(label) + '</div>' +
      (note ? '<div class="gg-tile-note">' + esc(note) + '</div>' : '') +
    '</div>';
  }

  /**
   * One bar per period, one series, one hue — so no legend is needed and the
   * title says what is being counted. Values sit above the bars rather than
   * inside them: the brand orange is 2.78:1 on white, which is below the 3:1
   * a mark needs to carry meaning on its own, so the numbers and the table
   * below are what actually convey the data. The bars rank it at a glance.
   */
  function viewDashboard() {
    var d = pipelineSummary();

    if (!d.total) {
      return '<div class="gg-card"><p class="gg-muted" style="margin:0">Nothing in the pipeline yet. ' +
        'Analyse an opportunity from the feed and it will appear here.</p></div>';
    }

    var max = d.periods.reduce(function (m, r) { return Math.max(m, r.count); }, 0) || 1;

    var chart = d.periods.length
      ? '<div class="gg-chart" role="img" aria-label="Opportunities by deadline">' +
          d.periods.map(function (r, i) {
            var pct = Math.round((r.count / max) * 100);
            return '<div class="gg-bar-slot' + (S.hoverBar === i ? ' is-hover' : '') + '" ' +
              'data-act="bar" data-i="' + i + '" tabindex="0">' +
              '<div class="gg-bar-value">' + r.count + '</div>' +
              '<div class="gg-bar-track">' +
                '<div class="gg-bar" style="height:' + Math.max(pct, 2) + '%"></div>' +
              '</div>' +
              '<div class="gg-bar-label">' + esc(r.label.replace(' 20', '\u2019')) + '</div>' +
              (S.hoverBar === i
                ? '<div class="gg-bar-tip">' +
                    '<strong>' + esc(r.label) + '</strong><br/>' +
                    r.count + ' opportunit' + (r.count === 1 ? 'y' : 'ies') +
                    (r.avg != null ? '<br/>average score ' + r.avg : '') +
                    (r.awarded ? '<br/>' + r.awarded + ' awarded' : '') +
                    (r.lost ? '<br/>' + r.lost + ' lost' : '') +
                  '</div>'
                : '') +
            '</div>';
          }).join('') +
        '</div>'
      : '<p class="gg-muted" style="margin:0 0 16px">No deadlines on file to chart yet.</p>';

    // The table is not an extra — it is what makes the chart legible to anyone
    // the colour or the bar heights fail, and it carries the detail the bars
    // deliberately leave out.
    var table = d.periods.length
      ? '<table class="gg-calc" style="margin-top:20px"><thead><tr>' +
          '<th>' + (S.period === 'year' ? 'Year' : 'Month') + '</th>' +
          '<th class="gg-num">Tracked</th><th class="gg-num">Awarded</th>' +
          '<th class="gg-num">Lost</th><th class="gg-num">Avg score</th>' +
        '</tr></thead><tbody>' +
          d.periods.map(function (r) {
            return '<tr><td>' + esc(r.label) + '</td>' +
              '<td class="gg-num">' + r.count + '</td>' +
              '<td class="gg-num">' + (r.awarded || '\u2014') + '</td>' +
              '<td class="gg-num">' + (r.lost || '\u2014') + '</td>' +
              '<td class="gg-num">' + (r.avg != null ? r.avg : '\u2014') + '</td></tr>';
          }).join('') +
        '</tbody></table>'
      : '';

    return '<div class="gg-dash-head">' +
        '<div class="gg-views" style="margin:0">' +
          ['month', 'year'].map(function (g) {
            return '<button class="gg-view-btn' + (S.period === g ? ' is-on' : '') + '" ' +
              'data-act="period" data-p="' + g + '">' + (g === 'month' ? 'Monthly' : 'Yearly') + '</button>';
          }).join('') +
        '</div>' +
        '<span class="gg-muted" style="font-size:12.5px">Grouped by response deadline' +
          (d.undated ? ' \u00b7 ' + d.undated + ' with no deadline' : '') + '</span>' +
      '</div>' +

      '<div class="gg-tiles">' +
        tile('In pipeline', d.total, d.scoredCount + ' scored') +
        tile('Awarded', d.awarded, null, 'go') +
        tile('Lost', d.lost, null, 'nogo') +
        tile('Win rate', d.winRate == null ? '\u2014' : d.winRate + '%',
          d.winRate == null ? 'nothing decided yet' : d.awarded + ' of ' + (d.awarded + d.lost)) +
        tile('Average score', d.avgScore == null ? '\u2014' : d.avgScore,
          d.avgScore == null ? 'nothing scored yet' : 'across ' + d.scoredCount) +
      '</div>' +

      '<div class="gg-card" style="margin-top:16px">' +
        '<div class="gg-side-title">Opportunities by deadline</div>' +
        chart + table +
      '</div>';
  }

  function viewBoard() {
    var stages = S.stages.length ? S.stages : [{ key: 'under_review', label: 'Under Review' }];
    return viewBoardBar() + '<div class="gg-board">' + stages.map(function (stage, si) {
      var cards = S.opportunities.filter(function (o) {
        if (o.status !== stage.key) return false;
        return !S.pipeMonth || (o.due_date || '').slice(0, 7) === S.pipeMonth;
      // Soonest deadline at the top of every column: on a board, the next
      // thing to act on should be the first thing seen. Undated last.
      }).sort(function (a, b) {
        var da = a.due_date || '9999-99-99';
        var db = b.due_date || '9999-99-99';
        return da < db ? -1 : da > db ? 1 : 0;
      });
      return '<div class="gg-col">' +
        '<div class="gg-col-head">' + esc(stage.label) +
          (stage.expires
            ? '<span class="gg-col-ttl" title="Cards here clear themselves after ' +
              stage.expires + ' days unless you move them along">' + stage.expires + 'd</span>'
            : '') +
          '<span class="gg-col-count">' + cards.length + '</span>' +
          (cards.length
            ? '<button class="gg-col-clear" data-act="clear-stage" data-stage="' + esc(stage.key) + '" ' +
              'title="Remove every card in ' + esc(stage.label) + '">Clear</button>'
            : '') +
        '</div>' +
        '<div class="gg-col-body">' +
          (stage.expires && cards.length
            ? '<div class="gg-col-empty" style="padding:0 3px 6px">Clears after ' +
              stage.expires + ' days \u2014 move a card on to keep it.</div>'
            : '') +
          (cards.length ? cards.map(function (o) {
            return '<div class="gg-card-mini' +
              (S.openId === 'saved-' + o.id ? ' is-selected' : '') + '">' +
              '<div class="gg-card-mini-title">' + esc(o.title || o.solicitation_number || 'Untitled') + '</div>' +
              '<div class="gg-card-mini-meta">' +
                esc([o.agency, o.due_date ? 'due ' + o.due_date : null].filter(Boolean).join(' · ')) +
              '</div>' +
              (o.score != null
                ? '<div class="gg-card-mini-verdict">' +
                    '<span class="gg-score-pill ' + verdictClass(o.recommendation) + '">' +
                      o.score + '</span>' +
                    '<span class="gg-card-mini-word">' + esc(o.recommendation || '') + '</span>' +
                  '</div>'
                : '') +
              '<div class="gg-card-mini-foot">' +
                '<button class="gg-move gg-move--score" data-act="score-saved" data-id="' + o.id + '" ' +
                  'title="' + (o.score != null ? 'Re-run the analysis' : 'Run the Go/No-Go analysis') + '">' +
                  (o.score != null ? '↻' : 'Go/No-Go') + '</button>' +
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

  /** Feed toolbar: how many, filtered by which month, in what order. Months
   *  come from the results themselves, so the list only ever offers a month
   *  that has something in it. */
  /** The undo offer, bottom left, out of the way of everything. */
  function viewUndo() {
    if (!S.undo) return '';
    return '<div class="gg-undo" role="status">' +
      '<span>Removed <strong>' + esc(S.undo.title.slice(0, 48)) +
        (S.undo.title.length > 48 ? '\u2026' : '') + '</strong></span>' +
      '<button class="gg-undo-btn" data-act="undo">Undo</button>' +
    '</div>';
  }

  /** The search box and its button. Lives in the frozen toolbar, so it is its
   *  own function rather than inline markup — the input carries its own border,
   *  which is why there is no card around it. */
  function viewSearch() {
    return '<div class="gg-search">' +
      '<input class="gg-input" id="gg-q" value="' + esc(S.query) + '" ' +
        'placeholder="Search opportunities"/>' +
      '<button class="gg-btn" data-act="search"' + (S.busy ? ' disabled' : '') + '>' +
        (S.busy ? '<span class="gg-spin"></span> Searching…' : icon('search', 15) + ' Search') +
      '</button>' +
    '</div>';
  }

  function viewFeedBar() {
    var months = monthsInFeed();
    var shown = visibleResults().length;
    return '<div class="gg-feed-head">' +
      '<span class="gg-muted">' + shown +
        (S.month ? ' due in ' + esc(monthLabel(S.month)) : ' opportunit' + (shown === 1 ? 'y' : 'ies')) +
        (S.query ? ' for "' + esc(S.query) + '"' : '') +
        (S.filteredOut
          ? '<span class="gg-muted"> \u00b7 ' + S.filteredOut + ' non-construction hidden</span>'
          : '') + '</span>' +
      '<label class="gg-feed-ctl">Due' +
        '<select class="gg-input gg-input--inline" id="gg-month">' +
          '<option value=""' + (S.month ? '' : ' selected') + '>All months</option>' +
          months.map(function (m) {
            return '<option value="' + esc(m.key) + '"' + (S.month === m.key ? ' selected' : '') + '>' +
              esc(m.label) + ' (' + m.count + ')</option>';
          }).join('') +
        '</select>' +
      '</label>' +
      '<label class="gg-feed-ctl">Location' +
        '<select class="gg-input gg-input--inline gg-input--place" id="gg-place">' +
          '<option value=""' + (S.place ? '' : ' selected') + '>Anywhere</option>' +
          ((S.profile && (S.profile.states_served || []).length)
            // A count, not the list: eight state codes made the dropdown wider
            // than everything beside it, and the list is on screen already.
            ? '<option value="mine"' + (S.place === 'mine' ? ' selected' : '') + '>' +
              'My states (' + S.profile.states_served.length + ')</option>'
            : '') +
          statesInFeed().map(function (st) {
            return '<option value="' + esc(st.key) + '"' + (S.place === st.key ? ' selected' : '') + '>' +
              esc(st.key) + ' (' + st.count + ')</option>';
          }).join('') +
        '</select>' +
      '</label>' +
      '<label class="gg-feed-ctl">Sort' +
        '<select class="gg-input gg-input--inline" id="gg-sort">' +
          '<option value="due"' + (S.sort === 'due' ? ' selected' : '') + '>Deadline, soonest</option>' +
          '<option value="none"' + (S.sort === 'none' ? ' selected' : '') + '>As SAM.gov returned</option>' +
        '</select>' +
      '</label>' +
      '<button class="gg-col-clear" data-act="clear-feed">Clear all</button>' +
    '</div>';
  }

  function viewPager(pages, from, total) {
    if (pages <= 1) return '';
    var shown = Math.min(from + PAGE_SIZE, total);
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
    return '<aside class="gg-side gg-card" id="gg-score-panel">' +
      // The checklist belongs beside the verdict, not above the results: every
      // unticked item is a reason the score below is less certain than it could
      // be, so the two are read together.
      viewChecklist() +
      '<div class="gg-side-title">Go/No-Go analysis</div>' + body +
    '</aside>';
  }

  /** GO green, NO-GO red, anything else orange. REVIEW and NEEDS MORE INFO
   *  share the orange outline deliberately: neither is a decision, and neither
   *  should look as settled as one. */
  function verdictClass(recommendation) {
    var v = String(recommendation || '').toUpperCase();
    if (v === 'GO') return 'is-go';
    // Still a go, so still green — outlined rather than filled, because it
    // carries a condition.
    if (v.indexOf('GO -') === 0 || v.indexOf('GO,') === 0) return 'is-go-review';
    if (v === 'NO-GO' || v === 'NO GO') return 'is-nogo';
    return '';
  }

  function viewScore(s) {
    var verdict = String(s.recommendation || '').toUpperCase();
    var badgeClass = verdictClass(verdict);

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
      (S.detailsOpen ? 'Hide' : 'Show') + ' the full calculation</button>';

    if (S.detailsOpen && s.matches) {
      // Showing the arithmetic matters more here than in a paid tool: a number
      // with no visible derivation is not one anyone will bet a bid on. Which
      // means it has to be the SAME arithmetic — the criteria are weighted, and
      // recomputing a flat mean here printed 68 under a verdict of 70. Each
      // match carries its own share of the score; use it, never a share derived
      // from how many rows there happen to be.
      var shareOf = function (m) {
        return typeof m.share === 'number' ? m.share : 1 / s.matches.length;
      };
      var overridden = !!s.override_reason && s.overall_score === 0;

      out += '<div class="gg-calc-head">The ' + s.matches.length + ' criteria are not equally ' +
        'weighted — each one’s share of the score is below, and what it adds is its ' +
        'score × that share.</div>';

      out += '<table class="gg-calc"><thead><tr>' +
        '<th>Criterion</th><th class="gg-num">Score</th><th class="gg-num">Weight</th>' +
        '<th class="gg-num">Adds</th>' +
      '</tr></thead><tbody>';

      var running = 0;
      s.matches.forEach(function (m) {
        var adds = m.score * shareOf(m);
        running += adds;
        out += '<tr class="' + (m.score < 50 ? 'is-weak' : m.score === 50 ? 'is-neutral' : '') + '">' +
          '<td><span class="gg-crit-name">' + esc(m.title) + '</span><br/>' +
            '<span class="gg-crit-why">' + esc(m.reason) + '</span></td>' +
          '<td class="gg-num">' + m.score + '</td>' +
          '<td class="gg-num">' + (shareOf(m) * 100).toFixed(1) + '%</td>' +
          '<td class="gg-num">' + adds.toFixed(1) + '</td>' +
        '</tr>';
      });

      out += '<tr class="gg-calc-total"><td>Total</td><td class="gg-num"></td>' +
        '<td class="gg-num"></td><td class="gg-num">' + Math.round(running) + '</td></tr>' +
      '</tbody></table>';

      if (overridden) {
        out += '<div class="gg-calc-head">The criteria come to ' + Math.round(running) +
          ', but this scores 0: an expired deadline, or a set-aside you do not hold, makes the ' +
          'bid impossible rather than merely unattractive — so it overrides the weighted total ' +
          'instead of being averaged into it.</div>';
      }

      // The bands come from the server for the same reason the weights do: a
      // second copy here goes stale silently. This footer once read
      // "above 55 GO · 40–55 NOT SURE" long after the thresholds had moved.
      out += '<div class="gg-calc-head">50 means “nothing on file” — neutral, not bad. ' +
        'Bands: ' + esc(bandsText()) + '.</div>';
    }
    return out;
  }

  /** The left sidebar: everything about the visitor's company, permanently in
   *  view beside the results. It answers "why did it score that?" without a
   *  click, and editing a field is one field away from re-running the score. */
  function viewSidebar() {
    var p = S.profile || {};
    var perf = p.past_performance || [];

    return '<aside class="gg-side gg-side--profile gg-card">' +
      '<div class="gg-side-block">' +
        '<div class="gg-side-title">Your company</div>' +
        '<p class="gg-hint" style="margin:-6px 0 12px">The more of this we know, the more of the 12 criteria can score.</p>' +
        naicsPicker(p) +
        setAsidePicker(p) +
        statePicker(p) +
        field('gg-office', 'Office address', p.office_address || '', '123 Main St, Richmond, VA') +
        moneyField('gg-bond', 'Bonding capacity', p.bonding_capacity || '', '5000000') +
        moneyField('gg-min', 'Smallest job you take', p.project_value_min || '', '100000') +
        moneyField('gg-max', 'Largest job you take', p.project_value_max || '', '5000000') +
        contractTypePicker(p) +
        leadTimePicker(p) +
      '</div>' +

      '<div class="gg-side-block">' +
        '<button class="gg-toggle gg-side-title" style="margin-bottom:' + (S.ppOpen ? '12px' : '0') + '" ' +
          'data-act="toggle-pp" aria-expanded="' + (S.ppOpen ? 'true' : 'false') + '">' +
          'Past performance' +
          '<span class="gg-col-count">' + perf.length + '</span>' +
          '<span class="gg-toggle-caret">' + icon('caret', 14) + '</span>' +
        '</button>' +
        (S.ppOpen
          ? perf.map(function (r) {
              return '<div class="gg-row" style="font-size:13px;padding:8px 10px"><span>' + esc(r.title) +
                (r.agency ? '<br/><span class="gg-muted" style="font-size:12px">' + esc(r.agency) + '</span>' : '') +
                '</span><button class="gg-row-x" data-act="rm-pp" data-id="' + r.id + '" aria-label="Remove">&times;</button></div>';
            }).join('') +
            field('gg-pp-title', 'Project', '', 'Barracks roof replacement') +
            field('gg-pp-agency', 'Agency', '', 'USACE') +
            moneyField('gg-pp-value', 'Contract value', '', '1200000') +
            '<button class="gg-btn gg-btn--small gg-btn--ghost gg-btn--block" data-act="add-pp">Add project</button>'
          : '') +
      '</div>' +

      // Pinned to the bottom of the panel rather than sitting at the end of a
      // dozen fields. Reaching it used to mean scrolling the whole page past
      // everything else on it, and once you had scrolled back up to correct a
      // field it was out of sight again — a form whose Save you have to go and
      // find is a form people leave unsaved. Outside the blocks above so that
      // Past performance keeps scrolling in the panel behind it, still reachable
      // while Save stays where it can be pressed.
      // is-dirty is also set directly by keepDraft() as fields change, because
      // ticking a box deliberately does not re-render. Both routes set the same
      // class, so the marker is right whether it arrives by edit or by redraw.
      '<div class="gg-side-foot' + (hasProfileDraft() ? ' is-dirty' : '') + '">' +
        '<div class="gg-side-dirty">Unsaved changes</div>' +
        '<button class="gg-btn gg-btn--small gg-btn--block" data-act="save-profile"' +
          (S.busy ? ' disabled' : '') + '>Save profile</button>' +
      '</div>' +
    '</aside>';
    // (The connected SAM.gov account moved to the profile panel in the header:
    //  it is account settings, not an input to the score, and this sidebar is
    //  only the latter.)
  }

  /** Which set-asides this company holds. A fixed list, not free text: the
   *  rubric compares what is stored here against the certification a
   *  solicitation requires, and "8a" is not "8(a)" — a typo silently cost
   *  someone every 8(a) opportunity they were entitled to bid. */
  function setAsidePicker(p) {
    var options = S.config.set_asides || [];
    var chosen = S.draft.certs || p.certifications || [];
    return '<div class="gg-field gg-field--pick">' +
      '<button class="gg-picker-head" data-act="toggle-setasides" ' +
        'aria-expanded="' + (S.setAsideOpen ? 'true' : 'false') + '">' +
        '<span class="gg-label" style="margin:0">Set-asides you hold</span>' +
        '<span class="gg-picker-count">' + (chosen.length ? chosen.length + ' selected' : 'none') + '</span>' +
        '<span class="gg-toggle-caret">' + icon('caret', 14) + '</span>' +
      '</button>' +
      (chosen.length && !S.setAsideOpen
        ? '<div class="gg-picker-summary">' +
            chosen.map(function (v) { return '<span>' + esc(v) + '</span>'; }).join('') +
          '</div>'
        : '') +
      (S.setAsideOpen ? '<div class="gg-ticks">' : '<div hidden>') +
        options.map(function (o) {
          var on = chosen.indexOf(o.value) !== -1;
          return '<label class="gg-tick' + (on ? ' is-on' : '') + '">' +
            '<input type="checkbox" class="gg-cert" value="' + esc(o.value) + '"' +
              (on ? ' checked' : '') + '/>' +
            '<span>' + esc(o.label) + '</span>' +
          '</label>';
        }).join('') +
      '</div>' +
      // No standing advice under this picker. What it said — an unheld set-aside
      // is a hard NO-GO — is said where it applies instead: the verdict names the
      // set-aside as the reason when it fires, which is the moment it matters.
      // In the panel it was a paragraph of grey text between every visitor and
      // the fields below it.
    '</div>';
  }

  /** The construction trades this company is coded for. A list, because the
   *  score compares codes exactly and because most people know their trade by
   *  name long before they know its number. */
  function naicsPicker(p) {
    var options = S.config.naics || [];
    var chosen = S.draft.naics || p.naics_codes || [];
    return '<div class="gg-field gg-field--pick">' +
      '<button class="gg-picker-head" data-act="toggle-naics" ' +
        'aria-expanded="' + (S.naicsOpen ? 'true' : 'false') + '">' +
        '<span class="gg-label" style="margin:0">NAICS codes you hold</span>' +
        '<span class="gg-picker-count">' + (chosen.length ? chosen.length + ' selected' : 'none') + '</span>' +
        '<span class="gg-toggle-caret">' + icon('caret', 14) + '</span>' +
      '</button>' +
      (chosen.length && !S.naicsOpen
        ? '<div class="gg-picker-summary">' +
            chosen.map(function (v) { return '<span>' + esc(v) + '</span>'; }).join('') +
          '</div>'
        : '') +
      (S.naicsOpen ? '<div class="gg-ticks">' : '<div hidden>') +
        options.map(function (o) {
          var on = chosen.indexOf(o.value) !== -1;
          return '<label class="gg-tick' + (on ? ' is-on' : '') + '">' +
            '<input type="checkbox" class="gg-naics" value="' + esc(o.value) + '"' +
              (on ? ' checked' : '') + '/><span>' + esc(o.label) + '</span></label>';
        }).join('') +
      '</div>' +
      (S.naicsOpen
        ? '<div class="gg-hint">The single biggest input to the score. Codes outside ' +
          'construction can still be typed into your SAM.gov profile — this list is the ' +
          'sector 23 trades this page covers.</div>'
        : '') +
    '</div>';
  }

  /** Where this company will travel to work. Codes, not names: scoreState
   *  compares the two-letter code on the notice, so "Virginia" typed by hand
   *  would read as a state you do not serve. */
  function statePicker(p) {
    var options = S.config.states || [];
    var chosen = S.draft.states || p.states_served || [];
    return '<div class="gg-field gg-field--pick">' +
      '<button class="gg-picker-head" data-act="toggle-states" ' +
        'aria-expanded="' + (S.statesOpen ? 'true' : 'false') + '">' +
        '<span class="gg-label" style="margin:0">States you work in</span>' +
        '<span class="gg-picker-count">' + (chosen.length ? chosen.length + ' selected' : 'none') + '</span>' +
        '<span class="gg-toggle-caret">' + icon('caret', 14) + '</span>' +
      '</button>' +
      (S.statesOpen
        ? '<div class="gg-hint" style="margin:0 0 6px">These score the opportunity — they do ' +
          'not filter the feed. Work outside them still appears, scored down for distance. Use ' +
          '<strong>Where</strong> above the results to hide it. Drag this panel’s ' +
          'bottom-right corner wider to see more per row.</div>'
        : '') +
      (chosen.length && !S.statesOpen
        ? '<div class="gg-picker-summary">' +
            chosen.map(function (v) { return '<span>' + esc(v) + '</span>'; }).join('') +
          '</div>'
        : '') +
      (S.statesOpen ? '<div class="gg-ticks gg-ticks--cols">' : '<div hidden>') +
        options.map(function (o) {
          var on = chosen.indexOf(o.value) !== -1;
          return '<label class="gg-tick' + (on ? ' is-on' : '') + '">' +
            '<input type="checkbox" class="gg-state" value="' + esc(o.value) + '"' +
              (on ? ' checked' : '') + '/><span>' + esc(o.label) + '</span></label>';
        }).join('') +
      '</div>' +
    '</div>';
  }

  /** Which contract vehicles this company actually bids. Scored against the
   *  type each notice is classified as. */
  function contractTypePicker(p) {
    var options = S.config.contract_types || [];
    var chosen = S.draft.types || p.contract_types || [];
    return '<div class="gg-field gg-field--pick">' +
      '<button class="gg-picker-head" data-act="toggle-types" ' +
        'aria-expanded="' + (S.typesOpen ? 'true' : 'false') + '">' +
        '<span class="gg-label" style="margin:0">Contract types you bid</span>' +
        '<span class="gg-picker-count">' + (chosen.length ? chosen.length + ' selected' : 'none') + '</span>' +
        '<span class="gg-toggle-caret">' + icon('caret', 14) + '</span>' +
      '</button>' +
      (chosen.length && !S.typesOpen
        ? '<div class="gg-picker-summary">' +
            chosen.map(function (v) { return '<span>' + esc(v) + '</span>'; }).join('') +
          '</div>'
        : '') +
      (S.typesOpen ? '<div class="gg-ticks">' : '<div hidden>') +
        options.map(function (o) {
          var on = chosen.indexOf(o.value) !== -1;
          return '<label class="gg-tick' + (on ? ' is-on' : '') + '">' +
            '<input type="checkbox" class="gg-ctype" value="' + esc(o.value) + '"' +
              (on ? ' checked' : '') + '/><span>' + esc(o.label) + '</span></label>';
        }).join('') +
      '</div>' +
      (S.typesOpen
        ? '<div class="gg-hint">Leave all unticked and any recognised type scores as ' +
          '"supported, no preference stated".</div>'
        : '') +
    '</div>';
  }

  /** How long before the due date this company needs to put a bid together.
   *  Anything closer than this scores down, and an already-passed deadline is
   *  an outright NO-GO. */
  function leadTimePicker(p) {
    var value = S.draft.lead != null ? S.draft.lead : (p.min_bid_days == null ? '' : String(p.min_bid_days));
    var choices = ['', '7', '10', '14', '20', '30', '45'];
    return '<div class="gg-field">' +
      '<label class="gg-label" for="gg-lead">Days you need to bid</label>' +
      '<select class="gg-input" id="gg-lead">' +
        choices.map(function (d) {
          return '<option value="' + d + '"' + (String(value) === d ? ' selected' : '') + '>' +
            (d === '' ? 'Use the 20-day default' : d + ' days') + '</option>';
        }).join('') +
      '</select>' +
      '<div class="gg-hint">A notice due sooner than this scores down on Bid Preparation Time.</div>' +
    '</div>';
  }

  function field(id, label, value, placeholder) {
    var shown = Object.prototype.hasOwnProperty.call(S.draft, id) ? S.draft[id] : value;
    return '<div class="gg-field">' +
      '<label class="gg-label" for="' + id + '">' + esc(label) + '</label>' +
      '<input class="gg-input" id="' + id + '" value="' + esc(shown == null ? '' : shown) + '" ' +
        'placeholder="' + esc(placeholder) + '"/>' +
    '</div>';
  }

  /** A dollar amount: a fixed $ inside the box and thousands grouped as it is
   *  typed. The $ is an adornment rather than part of the value, so it cannot be
   *  backspaced away or end up in what is posted — which is also why the label
   *  no longer needs to say "($)". data-money is what the input handler keys off:
   *  a list of ids here would have to be kept in step with this by hand. */
  function moneyField(id, label, value, placeholder) {
    var shown = Object.prototype.hasOwnProperty.call(S.draft, id) ? S.draft[id] : value;
    return '<div class="gg-field">' +
      '<label class="gg-label" for="' + id + '">' + esc(label) + '</label>' +
      '<div class="gg-money">' +
        '<span class="gg-money-sign" aria-hidden="true">$</span>' +
        '<input class="gg-input" id="' + id + '" data-money="1" inputmode="numeric" ' +
          'autocomplete="off" value="' + esc(groupMoney(shown)) + '" ' +
          'placeholder="' + esc(groupMoney(placeholder)) + '"/>' +
      '</div>' +
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
      var rows = visibleResults();
      var pages = Math.ceil(rows.length / PAGE_SIZE);
      if (S.page >= pages) S.page = 0;   // a shorter result set than last time
      var from = S.page * PAGE_SIZE;
      body = (rows.length === 0
        ? '<div class="gg-card"><p class="gg-muted" style="margin:0">Nothing matches these ' +
          'filters. Try Anywhere, or All months — the search itself covers the whole ' +
          'country, so a state filter only narrows what came back.</p></div>'
        : '') +
        rows.slice(from, from + PAGE_SIZE)
        // The absolute index is what save/analyse look up, so pass it through
        // rather than the index within the page.
        .map(function (r, n) { return viewResult(r, from + n); }).join('') +
        viewPager(pages, from, rows.length);
    }

    var isFeed = S.view === 'feed';
    var centre = S.view === 'dashboard' ? viewDashboard() : isFeed
      // The box takes three different things and works out which — say so,
      // rather than leaving it to be discovered. Each example is clickable,
      // because the fastest way to learn what a box accepts is to watch it
      // work once. It stays in the scroll: it explains the box above it, and
      // once you have searched once you never need it again.
      ? '<div class="gg-search-hint">Search by ' +
          '<button class="gg-eg" data-act="example" data-q="roofing">keyword</button> ' +
          '<span class="gg-muted">(roofing, HVAC, paving)</span>, ' +
          '<button class="gg-eg" data-act="example" data-q="238220">NAICS code</button> ' +
          '<span class="gg-muted">(6 digits)</span>, or ' +
          '<button class="gg-eg" data-act="example" data-q="W912DR26R0012">' +
            'solicitation number</button>' +
        '</div>' + body
      : (S.opportunities.length
          ? viewBoard()
          : '<div class="gg-card"><p class="gg-muted" style="margin:0">Your pipeline is empty. ' +
            'Search the feed and press <strong>Save</strong> on anything worth tracking — ' +
            'it stays here even after the notice closes on SAM.gov.</p></div>');

    // No link to the product app anywhere on this page — it stands on its own
    // as a free tool rather than as a funnel into a signup.
    return '<div class="gg-wrap gg-wrap--full">' +
      // Pipeline drops the company sidebar: those fields tune a score, and a
      // board is for moving work along. Eight stages in the middle third of
      // the screen meant scrolling sideways to find your own cards.
      '<div class="gg-layout' + (isFeed ? '' : ' gg-layout--board') + '">' +
        (isFeed ? viewSidebar() : '') +
        '<main class="gg-main">' +
          '<div class="gg-topbar">' +
            '<div class="gg-views">' +
            '<button class="gg-view-btn' + (isFeed ? ' is-on' : '') + '" data-act="view" data-v="feed">' +
              'Opportunity Feed' + (S.results ? '<span class="gg-view-count">' + S.results.length + '</span>' : '') +
            '</button>' +
            '<button class="gg-view-btn' + (S.view === 'pipeline' ? ' is-on' : '') + '" ' +
              'data-act="view" data-v="pipeline">' +
              'Pipeline<span class="gg-view-count">' + S.opportunities.length + '</span>' +
            '</button>' +
            '<button class="gg-view-btn' + (S.view === 'dashboard' ? ' is-on' : '') + '" ' +
              'data-act="view" data-v="dashboard">Overview</button>' +
            '</div>' +
            // Frozen with the view switch rather than scrolling away above the
            // results: reading down a long feed and wanting a different search —
            // or a different month, or only your own states — is the normal case,
            // and scrolling back to the top for it is the page making you walk
            // back for something it could have kept in reach. The filters keep
            // their original place above the box, so the hint below it still sits
            // under the box it describes. Feed only: there is nothing to search
            // or filter on a board.
            (isFeed
              ? (S.results && S.results.length ? viewFeedBar() : '') + viewSearch()
              : '') +
          '</div>' +
          messages() +
          centre +
        '</main>' +
        viewScorePanel() +
      '</div>' +
      viewUndo() +
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

    // The header just changed — signing in adds the account button, signing out
    // takes it away — so re-measure before anything sticky is scrolled.
    syncHeadHeight();
  }

  function focus(id) {
    var el = document.getElementById(id);
    if (el) el.focus();
  }

  /** Publishes the sticky header's real height as --gg-head-h. Every sticky
   *  offset on the page is measured from that variable, and 63px is only true of
   *  a wide screen with a short header: on a phone the header is shorter, and
   *  signing in makes it taller again by adding the account button. When the
   *  constant and the header disagree, the frozen toolbar either floats a strip
   *  of gap below the header — with results scrolling through it — or hides its
   *  own first line behind it. Measured, so it cannot disagree. */
  function syncHeadHeight() {
    var head = document.querySelector('.gg-head');
    if (!head) return;
    var h = Math.round(head.getBoundingClientRect().height);
    if (h > 0) document.documentElement.style.setProperty('--gg-head-h', h + 'px');
  }

  var headSyncQueued = false;
  window.addEventListener('resize', function () {
    // Rotating a phone fires this in a burst; one measurement per frame is
    // enough and keeps the reflow off the resize path.
    if (headSyncQueued) return;
    headSyncQueued = true;
    requestAnimationFrame(function () { headSyncQueued = false; syncHeadHeight(); });
  });

  /** Brings the analysis panel into view on a narrow screen. Stacked, that panel
   *  sits below the entire result list, so pressing Go/No-Go scored the
   *  opportunity off screen and read as a button that did nothing. Clear of the
   *  sticky header, or the verdict lands underneath it. */
  function revealScorePanel() {
    // 860px is where .gg-layout stops being columns and starts being a stack —
    // the same breakpoint, expressed once in each language.
    var stacked = window.matchMedia
      ? window.matchMedia('(max-width: 860px)').matches
      : window.innerWidth <= 860;
    if (!stacked) return;
    // After the render that draws the panel, never before it.
    requestAnimationFrame(function () {
      var el = document.getElementById('gg-score-panel');
      if (!el) return;
      var head = document.querySelector('.gg-head');
      var y = el.getBoundingClientRect().top + (window.pageYOffset || 0) -
        ((head ? head.getBoundingClientRect().height : 0) + 10);
      if (y < 0) y = 0;
      try { window.scrollTo({ top: y, behavior: 'smooth' }); }
      catch (err) { window.scrollTo(0, y); }   // older Safari: no options object
    });
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
    else if (act === 'open-settings') {
      S.profileOpen = false; S.step = 'settings'; S.error = null;
      render();
      // Settings reports usage, so fetch the current figures rather than
      // showing whatever was true when the page was opened. Rendering first
      // keeps it instant; the numbers correct themselves a moment later.
      refresh();
    }
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
    else if (act === 'back-to-settings') { S.step = 'settings'; S.settingsMode = false; S.error = null; render(); }
    else if (act === 'link-key') { e.preventDefault(); linkKey(); }
    else if (act === 'rm-key') removeKey();
    else if (act === 'search') { e.preventDefault(); search(); }
    else if (act === 'example') {
      var box = document.getElementById('gg-q');
      if (box) { box.value = el.getAttribute('data-q'); box.focus(); }
    }
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
    else if (act === 'score-saved') scoreSaved(el.getAttribute('data-id'));
    else if (act === 'clear-stage') clearStage(el.getAttribute('data-stage'));
    else if (act === 'clear-month') clearMonth();
    else if (act === 'period') { S.period = el.getAttribute('data-p'); S.hoverBar = null; render(); }
    else if (act === 'bar') { S.hoverBar = Number(el.getAttribute('data-i')); render(); }
    else if (act === 'clear-feed') clearFeed();
    else if (act === 'dismiss') dismissResult(Number(el.getAttribute('data-i')));
    else if (act === 'undo') undoDismiss();
    else if (act === 'toggle-setasides') { S.setAsideOpen = !S.setAsideOpen; render(); }
    else if (act === 'toggle-types') { S.typesOpen = !S.typesOpen; render(); }
    else if (act === 'toggle-states') { S.statesOpen = !S.statesOpen; render(); }
    else if (act === 'toggle-naics') { S.naicsOpen = !S.naicsOpen; render(); }
    else if (act === 'goto') {
      var fieldId = el.getAttribute('data-field');
      if (fieldId === 'gg-set-asides' && !S.setAsideOpen) { S.setAsideOpen = true; render(); }
      if (fieldId === 'gg-naics-head' && !S.naicsOpen) { S.naicsOpen = true; render(); }
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
    else if (act === 'edit-account') { S.editAccount = true; render(); focus('gg-acct-company'); }
    else if (act === 'cancel-account') {
      S.editAccount = false;
      delete S.draft['gg-acct-company'];
      delete S.draft['gg-acct-name'];
      render();
    }
    else if (act === 'save-account') saveAccount();
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
    // Set-aside ticks live in the same draft as the text fields, so a
    // background re-render cannot silently untick them.
    if (e.target && e.target.className === 'gg-naics') {
      var codes = (S.draft.naics || (S.profile && S.profile.naics_codes) || []).slice();
      var ni = codes.indexOf(e.target.value);
      if (e.target.checked && ni === -1) codes.push(e.target.value);
      if (!e.target.checked && ni !== -1) codes.splice(ni, 1);
      S.draft.naics = codes;
      keepDraft();
      return;
    }
    if (e.target && e.target.className === 'gg-state') {
      var states = (S.draft.states || (S.profile && S.profile.states_served) || []).slice();
      var si = states.indexOf(e.target.value);
      if (e.target.checked && si === -1) states.push(e.target.value);
      if (!e.target.checked && si !== -1) states.splice(si, 1);
      S.draft.states = states;
      keepDraft();
      return;
    }
    if (e.target && e.target.className === 'gg-ctype') {
      var types = (S.draft.types || (S.profile && S.profile.contract_types) || []).slice();
      var ti = types.indexOf(e.target.value);
      if (e.target.checked && ti === -1) types.push(e.target.value);
      if (!e.target.checked && ti !== -1) types.splice(ti, 1);
      S.draft.types = types;
      keepDraft();
      return;
    }
    if (e.target && e.target.id === 'gg-lead') { S.draft.lead = e.target.value; keepDraft(); return; }
    if (e.target && e.target.id === 'gg-month') { S.month = e.target.value; S.page = 0; render(); return; }
    if (e.target && e.target.id === 'gg-place') { S.place = e.target.value; S.page = 0; render(); return; }
    if (e.target && e.target.id === 'gg-pipe-month') { S.pipeMonth = e.target.value; render(); return; }
    if (e.target && e.target.id === 'gg-sort') { S.sort = e.target.value; S.page = 0; render(); return; }
    if (e.target && e.target.className === 'gg-cert') {
      var current = (S.draft.certs || (S.profile && S.profile.certifications) || []).slice();
      var at = current.indexOf(e.target.value);
      if (e.target.checked && at === -1) current.push(e.target.value);
      if (!e.target.checked && at !== -1) current.splice(at, 1);
      S.draft.certs = current;
      keepDraft();
      return;
    }
    if (e.target && e.target.id === 'gg-country') {
      S.country = e.target.value;
      render();
      focus('gg-key');
    }
  });

  // Every keystroke in a sidebar field goes into the draft. No render here —
  // re-rendering on input would move the caret; this only has to survive a
  // render triggered by something else.
  // Per-bar hover tooltip. Delegated like everything else, and mouseout clears
  // it so a tooltip never outlives the pointer.
  document.addEventListener('mouseover', function (e) {
    var slot = e.target.closest && e.target.closest('[data-act="bar"]');
    var next = slot ? Number(slot.getAttribute('data-i')) : null;
    if (next !== S.hoverBar) { S.hoverBar = next; render(); }
  });

  document.addEventListener('focusin', function (e) {
    var slot = e.target.closest && e.target.closest('[data-act="bar"]');
    if (slot) { S.hoverBar = Number(slot.getAttribute('data-i')); render(); }
  });

  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el && el.id && el.id.indexOf('gg-') === 0 && el.tagName === 'INPUT') {
      if (el.getAttribute('data-money')) regroupMoney(el);
      S.draft[el.id] = el.value;
      // Only the profile's own fields: the same draft holds the search box and
      // the API key, and neither belongs on disk or in "unsaved profile".
      if (PROFILE_KEYS.indexOf(el.id) !== -1) keepDraft();
    }
  });

  /** Regroups a money field in place, keeping the caret where the typist left
   *  it. Rewriting .value alone would drop the caret at the end of the box after
   *  every keystroke, which makes correcting a digit in the middle of a figure
   *  impossible — so the caret is restored by how many digits precede it, not by
   *  character offset, since inserting a comma shifts every offset after it. */
  function regroupMoney(el) {
    var caret = el.selectionStart;
    var next = groupMoney(el.value);
    if (next === el.value) return;

    var before = caret == null
      ? -1
      : el.value.slice(0, caret).replace(/[^\d.]/g, '').length;
    el.value = next;
    if (before < 0) return;

    var seen = 0;
    var at = 0;
    while (at < next.length && seen < before) {
      if (/[\d.]/.test(next.charAt(at))) seen += 1;
      at += 1;
    }
    // Guarded: setSelectionRange throws on input types that have no selection,
    // and losing the caret must never take the keystroke with it.
    try { el.setSelectionRange(at, at); } catch (err) { /* not selectable */ }
  }

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

  // A crash inside a handler used to leave the page merely unresponsive — the
  // button did nothing, and since the failure is in the browser, nothing showed
  // up in the server logs either, so there was nothing to go on. Say so on the
  // page. Resource failures (a blocked Google script, a missing image) arrive
  // here too with no message; those are already handled and are not worth a
  // scare message.
  window.addEventListener('error', function (e) {
    if (S.booting || !e || !e.message) return;
    S.busy = false;
    S.error = 'Something broke on this page: ' + e.message +
      ' — reload and try again. If it keeps happening, send us this message.';
    try { render(); } catch (_) { /* render is what broke; the console has it */ }
  });

  boot();
})();
