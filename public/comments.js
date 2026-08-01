/**
 * public/comments.js — the comment box on a blog post.
 *
 * One field. A commenter's name and picture come from a verified Google token
 * if there is one, and otherwise they post as Anonymous.
 *
 * Sign-in is meant to be invisible. Google One Tap runs on load with
 * auto_select, so someone signed into the browser who has used this site before
 * is recognised without touching anything — the form just says "Commenting as".
 * The sign-in button only appears if that produced nothing.
 *
 * Nothing about identity is sent from here except the Google credential itself.
 * The server reads the name out of the token it verifies; this script never
 * tells it who anyone is, because a client saying "I am X" is not evidence.
 *
 * Everything a visitor typed is written with textContent. Comment bodies are
 * arbitrary text from strangers and the DOM must treat them as text — there is
 * no innerHTML assignment in this file.
 */
(function () {
  var root = document.getElementById('comments');
  if (!root) return;

  var slug = root.getAttribute('data-slug');
  var list = root.querySelector('.cm-list');
  var form = root.querySelector('.cm-form');
  var note = root.querySelector('.cm-note');
  var count = root.querySelector('.cm-count');
  var box = root.querySelector('.cm-box');
  var who = root.querySelector('.cm-who-row');
  var gbtn = root.querySelector('.cm-gbtn');
  var btn = form.querySelector('button[type="submit"]');

  var identity = null;   // {name, picture, credential} once Google vouches
  var loadedAt = Date.now();

  function say(msg, kind) {
    note.textContent = msg || '';
    note.className = 'cm-note' + (kind ? ' cm-note--' + kind : '');
    note.style.display = msg ? 'block' : 'none';
  }

  function when(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString(undefined,
      { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function initials(name) {
    return (name || '?').trim().charAt(0).toUpperCase();
  }

  function addComment(c) {
    var item = document.createElement('article');
    item.className = 'cm-item';

    var av = document.createElement('div');
    av.className = 'cm-av';
    if (c.avatar_url) {
      var img = document.createElement('img');
      img.src = c.avatar_url;
      img.alt = '';
      img.loading = 'lazy';
      // A broken avatar should leave a letter, not a torn-image icon.
      img.onerror = function () { av.textContent = initials(c.name); };
      av.appendChild(img);
    } else {
      av.textContent = initials(c.name);
    }

    var main = document.createElement('div');
    main.className = 'cm-main';

    var head = document.createElement('div');
    head.className = 'cm-head';

    var nm = document.createElement('span');
    nm.className = 'cm-name';
    nm.textContent = c.name;                       // text, never markup
    head.appendChild(nm);

    if (c.verified) {
      var tick = document.createElement('span');
      tick.className = 'cm-verified';
      tick.title = 'Signed in with Google';
      tick.textContent = 'verified';
      head.appendChild(tick);
    }

    var at = document.createElement('span');
    at.className = 'cm-at';
    at.textContent = when(c.created_at);
    head.appendChild(at);

    var body = document.createElement('p');
    body.className = 'cm-body';
    body.textContent = c.body;                     // text, never markup

    main.appendChild(head);
    main.appendChild(body);
    item.appendChild(av);
    item.appendChild(main);
    list.appendChild(item);
    return item;
  }

  function setCount(n) {
    count.textContent = n ? n + (n === 1 ? ' comment' : ' comments') : '';
  }

  fetch('/api/comments/' + encodeURIComponent(slug))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var cs = d.comments || [];
      cs.forEach(addComment);
      setCount(cs.length);
    })
    .catch(function () { /* the article is the point; stay quiet */ });

  /* ── Google sign-in ──────────────────────────────────────────────────────
     Optional. Without it the box still works and the comment posts as
     Anonymous, so a blocked or slow Google never costs anyone the ability to
     comment. */
  window.cmGoogle = function (response) {
    var claims;
    try {
      // Read only for the greeting. The server verifies the signature; nothing
      // here is trusted for anything that matters.
      claims = JSON.parse(atob(response.credential.split('.')[1]));
    } catch (e) { claims = {}; }
    identity = {
      name: claims.name || claims.email || 'You',
      picture: claims.picture || null,
      credential: response.credential,
    };
    who.textContent = '';
    var av = document.createElement('span');
    av.className = 'cm-av cm-av--sm';
    if (identity.picture) {
      var im = document.createElement('img');
      im.src = identity.picture; im.alt = '';
      im.onerror = function () { av.textContent = initials(identity.name); };
      av.appendChild(im);
    } else { av.textContent = initials(identity.name); }
    var label = document.createElement('span');
    label.textContent = 'Commenting as ' + identity.name;
    who.appendChild(av);
    who.appendChild(label);
    who.style.display = 'flex';
    if (gbtn) gbtn.style.display = 'none';
    say('');
  };

  var clientId = null;
  var started = false;

  /* The button starts hidden. Most people never see it: One Tap below signs in
     a returning Chrome user without a click, and anyone who is not signed in
     can just type and post as Anonymous. It is revealed only when the silent
     path produced nothing, so it is a fallback rather than a step. */
  if (gbtn) gbtn.style.display = 'none';

  function revealButton() {
    if (!gbtn || identity || !clientId) return;
    if (!window.google || !window.google.accounts) return;
    gbtn.style.display = '';
    window.google.accounts.id.renderButton(gbtn, {
      theme: 'outline', size: 'medium', text: 'signin_with', shape: 'pill',
    });
  }

  function mountGoogle() {
    if (started || !clientId || !window.google || !window.google.accounts) return;
    started = true;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: window.cmGoogle,
      /* The whole point: a visitor who has signed in here before and is signed
         into the browser is picked up and returned through cmGoogle with no
         interaction at all.

         What this cannot do is identify a first-time visitor silently. A page
         does not get to read the browser's Google session; Google hands over an
         identity only after the person has agreed to give it to this site,
         once. That agreement is what auto_select then remembers. So: returning
         visitors are automatic, the first visit costs one tap, and anyone who
         ignores it still gets to comment. */
      auto_select: true,
      itp_support: true,
      cancel_on_tap_outside: false,
      context: 'use',
    });

    window.google.accounts.id.prompt();

    /* If nothing came back, offer the button. Timed rather than driven by the
       prompt's notification callback because those status methods are being
       withdrawn under FedCM — "did we end up with an identity?" is the question
       that actually matters and it stays answerable. */
    setTimeout(revealButton, 2600);
  }

  /* Asked for rather than baked into the page: these are static files with no
     access to the environment. If it is unset nothing Google-related ever runs
     and everyone comments as Anonymous. */
  fetch('/api/comments/config')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      clientId = d.google_client_id;
      mountGoogle();
    })
    .catch(function () { /* comment as Anonymous */ });

  // Google's script is async; whichever of the two finishes last mounts.
  window.cmOnGoogleLoad = mountGoogle;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = box.value.trim();
    if (!text) { say('Write something first.', 'err'); return; }
    if (Date.now() - loadedAt < 3000) {
      say('Take a moment — then post your comment.', 'err');
      return;
    }

    btn.disabled = true;
    var label = btn.textContent;
    btn.textContent = 'Posting…';

    fetch('/api/comments/' + encodeURIComponent(slug), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: text,
        credential: identity ? identity.credential : undefined,
        website: form.elements.website.value,
      }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'Could not post that comment.');
        box.value = '';
        if (res.d.comment) {
          // Signed in: it is live, so show it rather than describing it.
          var el = addComment(res.d.comment);
          setCount(list.children.length);
          el.classList.add('cm-item--new');
          say('');
        } else {
          say('Thanks — your comment will appear once it has been reviewed.', 'ok');
        }
      })
      .catch(function (err) { say(err.message, 'err'); })
      .finally(function () { btn.disabled = false; btn.textContent = label; });
  });
})();
