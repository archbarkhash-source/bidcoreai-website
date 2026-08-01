/**
 * public/comments.js — the comment section on a blog post.
 *
 * Loaded only by post pages. The slug comes from data-slug on the container
 * rather than from location.pathname, so the markup stays the single source of
 * truth and the script does no URL parsing.
 *
 * Everything a visitor typed is written with textContent, never innerHTML. That
 * is the whole XSS story here: comment bodies are arbitrary text from strangers,
 * and the only safe way to put them on a page is to let the DOM treat them as
 * text. Nothing below ever builds HTML from a response.
 */
(function () {
  var root = document.getElementById('comments');
  if (!root) return;

  var slug = root.getAttribute('data-slug');
  var list = root.querySelector('.cm-list');
  var form = root.querySelector('.cm-form');
  var note = root.querySelector('.cm-note');
  var count = root.querySelector('.cm-count');
  var btn = form ? form.querySelector('button[type="submit"]') : null;

  // A comment posted the instant the page loads was not typed by a person.
  var loadedAt = Date.now();

  function say(msg, kind) {
    note.textContent = msg;
    note.className = 'cm-note' + (kind ? ' cm-note--' + kind : '');
    note.style.display = msg ? 'block' : 'none';
  }

  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function render(comments) {
    list.textContent = '';
    count.textContent = comments.length
      ? comments.length + (comments.length === 1 ? ' comment' : ' comments')
      : 'No comments yet';
    comments.forEach(function (c) {
      var item = document.createElement('article');
      item.className = 'cm-item';

      var head = document.createElement('div');
      head.className = 'cm-head';

      var who = document.createElement('span');
      who.className = 'cm-who';
      who.textContent = c.name;              // text, never markup

      var at = document.createElement('span');
      at.className = 'cm-at';
      at.textContent = when(c.created_at);

      head.appendChild(who);
      head.appendChild(at);

      var body = document.createElement('p');
      body.className = 'cm-body';
      body.textContent = c.body;             // text, never markup

      item.appendChild(head);
      item.appendChild(body);
      list.appendChild(item);
    });
  }

  fetch('/api/comments/' + encodeURIComponent(slug))
    .then(function (r) { return r.json(); })
    .then(function (d) { render(d.comments || []); })
    .catch(function () {
      // A comment section that cannot load is not worth an error message on an
      // article; the post itself is the point.
      count.textContent = '';
    });

  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (Date.now() - loadedAt < 3000) {
      say('Take a moment — then post your comment.', 'err');
      return;
    }
    var payload = {
      name: form.elements.name.value,
      email: form.elements.email.value,
      body: form.elements.body.value,
      website: form.elements.website.value,   // honeypot; a person never sees it
    };
    if (!payload.name.trim() || !payload.body.trim()) {
      say('Please add your name and a comment.', 'err');
      return;
    }

    btn.disabled = true;
    var label = btn.textContent;
    btn.textContent = 'Posting…';

    fetch('/api/comments/' + encodeURIComponent(slug), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'Could not post that comment.');
        form.reset();
        // Say what actually happened. "Posted" would have them looking for a
        // comment that is not on the page and will not be until it is approved.
        say('Thank you — your comment has been sent for review and will appear once approved.', 'ok');
      })
      .catch(function (err) { say(err.message, 'err'); })
      .finally(function () { btn.disabled = false; btn.textContent = label; });
  });
})();
