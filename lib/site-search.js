'use strict';
/* Site search for www.bidcoreai.com.
 *
 * No database and no external service: the index is built once, on the first search, from the pages the server already routes (the SITEMAP list in server.js)
 * - each page's title, description, first heading and body text - plus every FAQ question and answer on those pages and one entry that points people looking
 * for the Indian version to bidcore.in. Results are therefore always things that exist on the site.
 */
const fs   = require('fs');
const path = require('path');

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'with', 'on', 'how', 'do', 'does', 'i', 'is', 'are', 'what', 'we', 'you', 'your', 'our', 'it', 'at', 'by', 'be', 'can', 'my', 'me', 'this', 'that']);
const SYNONYMS = { indian: 'india', indians: 'india', inr: 'india', rupee: 'india', rupees: 'india', bharat: 'india' };

// Where someone looking for the Indian BidcoreAI interface should go. The wording matches the FAQ entry on /pricing.
const INDIA_ENTRY = {
  kind: 'region',
  url: 'https://www.bidcore.in',
  title: 'BidcoreAI for India — bidcore.in',
  text: 'Looking for the Indian BidcoreAI interface? Use the country selector in the top bar and choose IN, or go straight to bidcore.in to explore the India software, public tenders and marketplace, sign up, and sign in to the Indian BidcoreAI workspace.',
  keywords: 'india indian bharat bidcore.in country region interface version site cpwd morth rupee inr switch',
};

const decode = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&middot;/g, '·').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const strip = (html) => decode(html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function tokens(text) {
  const out = [];
  for (let t of String(text).toLowerCase().split(/[^a-z0-9.]+/)) {
    t = t.replace(/^\.+|\.+$/g, '');
    if (t.length < 2 || STOP.has(t)) continue;
    if (SYNONYMS[t]) t = SYNONYMS[t];
    else if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1);
    out.push(t);
  }
  return out;
}

function pageDocs(sitemap, viewsDir) {
  const docs = [];
  for (const { url, file } of sitemap) {
    let html;
    try { html = fs.readFileSync(path.join(viewsDir, file), 'utf8'); } catch { continue; }
    const m = (re) => { const x = html.match(re); return x ? x[1] : ''; };
    const title = strip(m(/<title>([\s\S]*?)<\/title>/i)).replace(/\s*[–|-]\s*BidcoreAI\s*$/i, '');
    const desc = strip(m(/<meta\s+name="description"\s+content="([^"]*)"/i));
    const h1 = strip(m(/<h1[^>]*>([\s\S]*?)<\/h1>/i));
    const body = strip(html.replace(/<nav[\s\S]*?<\/nav>/gi, ' ').replace(/<footer[\s\S]*?<\/footer>/gi, ' ').replace(/<head[\s\S]*?<\/head>/i, ' ')).slice(0, 8000);
    docs.push({ kind: 'page', url, title: title || h1 || url, text: desc || body.slice(0, 200), fields: { title: title + ' ' + url, h1, desc, body } });
    for (const d of html.matchAll(/<details class="faq-i"([^>]*)>([\s\S]*?)<\/details>/gi)) {
      const id = (d[1].match(/id="([^"]+)"/) || [])[1];
      const q = strip((d[2].match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || [])[1] || '');
      const a = strip((d[2].match(/<div class="faq-a">([\s\S]*?)<\/div>/i) || [])[1] || '');
      if (q) docs.push({ kind: 'faq', url: url + (id ? '#' + id : ''), id, from: title || h1 || url, fromUrl: url, title: q, text: a, fields: { title: q, desc: a } });
    }
  }
  docs.push({ ...INDIA_ENTRY, fields: { title: INDIA_ENTRY.title, desc: INDIA_ENTRY.text, keywords: INDIA_ENTRY.keywords } });
  return docs;
}

function createSiteSearch({ sitemap, viewsDir }) {
  let index = null;
  function build() {
    const docs = pageDocs(sitemap, viewsDir);
    const df = new Map();
    for (const d of docs) {
      d.tok = {};
      const seen = new Set();
      for (const [f, text] of Object.entries(d.fields)) {
        d.tok[f] = new Set(tokens(text));
        d.tok[f].forEach((t) => seen.add(t));
      }
      seen.forEach((t) => df.set(t, (df.get(t) || 0) + 1));
    }
    return { docs, df, n: docs.length };
  }
  const W = { title: 6, h1: 5, keywords: 6, desc: 3, body: 1 };

  function search(query, { pages = 10, faqs = 5 } = {}) {
    if (!index) index = build();
    const q = String(query || '').trim().slice(0, 80);
    let qt = [...new Set(tokens(q))];
    if (!qt.length) return { query: q, region: null, faqs: [], pages: [] };
    const common = qt.filter((t) => (index.df.get(t) || 0) / index.n > 0.6);   // "BidcoreAI" is on every page; it should not decide the ranking
    if (common.length < qt.length) qt = qt.filter((t) => !common.includes(t));
    const phrase = q.toLowerCase();
    const scored = [];
    for (const d of index.docs) {
      // the India card answers questions about the Indian version only: it must match on its keywords or title, not on a stray word in its sentence
      if (d.kind === 'region' && !qt.some((t) => d.tok.keywords.has(t) || d.tok.title.has(t))) continue;
      let score = 0, hit = 0;
      for (const t of qt) {
        const idf = Math.log(1 + index.n / (1 + (index.df.get(t) || 0)));
        let best = 0;
        for (const [f, set] of Object.entries(d.tok)) if (set.has(t)) best = Math.max(best, (W[f] || 3) * idf);
        // a FAQ question is the whole point of a FAQ entry: weigh it like a page title
        if (best && d.kind === 'faq' && d.tok.title.has(t)) best = Math.max(best, 6 * idf);
        if (best) { score += best; hit++; }
      }
      if (!hit) continue;
      score *= 0.6 + 0.4 * (hit / qt.length);                                        // matching more of the words ranks higher
      if (phrase.length > 3 && (d.fields.title || '').toLowerCase().includes(phrase)) score += 8;
      if (d.kind === 'region') score += 50;
      scored.push({ d, score });
    }
    scored.sort((a, b) => b.score - a.score);
    const pick = (kind, n) => scored.filter((s) => s.d.kind === kind).slice(0, n).map((s) => ({ kind: s.d.kind, url: s.d.url, title: s.d.title, text: s.d.text }));
    return { query: q, region: pick('region', 1)[0] || null, faqs: pick('faq', faqs), pages: pick('page', pages) };
  }
  /** Every FAQ entry on the site (one per distinct question), each with the page it comes from. */
  function faqs() {
    if (!index) index = build();
    const seen = new Set();
    return index.docs.filter((d) => d.kind === 'faq' && !seen.has(d.title) && seen.add(d.title))
      .map((d) => ({ q: d.title, a: d.text, id: d.id || '', from: d.from, fromUrl: d.fromUrl }));
  }
  return { search, faqs };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const excerpt = (s, n = 220) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s);

/** The part of /search between the header and the footer: the box, then the results (or suggestions when there is no query). */
function renderBody(q, r) {
  const item = (x, cls = '') => {
    const external = /^https?:\/\//.test(x.url);
    return `<a class="sr-item${cls}" href="${esc(x.url)}"${external ? ' rel="noopener"' : ''}><div class="sr-t">${esc(x.title)}</div><div class="sr-u">${esc(x.url.replace(/^https?:\/\/(www\.)?/, ''))}</div><div class="sr-x">${esc(excerpt(x.text))}</div></a>`;
  };
  const total = r ? (r.region ? 1 : 0) + r.faqs.length + r.pages.length : 0;
  let out = `<section class="sr-hero"><div class="sr-in"><h1>Search BidcoreAI</h1><form class="sr-form" action="/search" method="get" role="search"><input type="search" name="q" value="${esc(q)}" placeholder="Search features, services, answers…" aria-label="Search BidcoreAI" maxlength="80" autofocus/><button class="btn btn-p" type="submit">Search</button></form></div></section><section class="sr-wrap">`;
  if (!r) {
    out += `<p class="sr-count">Try one of these:</p><div class="sr-sug">` +
      [['takeoff', 'AI quantity takeoff'], ['pricing', 'Pricing'], ['go/no-go', 'Go/No-Go analyzer'], ['proposal', 'Bid proposal'], ['india', 'Indian BidcoreAI']]
        .map(([v, l]) => `<a href="/search?q=${encodeURIComponent(v)}">${esc(l)}</a>`).join('') + `</div>`;
  } else if (!total) {
    out += `<div class="sr-empty">No results for <strong>${esc(q)}</strong>. Try a shorter word, or one of: <div class="sr-sug">` +
      ['takeoff', 'pricing', 'proposal', 'india'].map((v) => `<a href="/search?q=${v}">${v}</a>`).join('') + `</div></div>`;
  } else {
    out += `<p class="sr-count">${total} result${total === 1 ? '' : 's'} for <strong>${esc(q)}</strong></p>`;
    if (r.region) out += item(r.region, ' sr-item--hl');
    if (r.faqs.length) out += `<div class="sr-h">Answers</div>` + r.faqs.map((x) => item(x)).join('');
    if (r.pages.length) out += `<div class="sr-h">Pages</div>` + r.pages.map((x) => item(x)).join('');
  }
  return out + `</section>`;
}

/** The /faq page body: every FAQ on the site, grouped under the page it lives on, in the site's own accordion style. */
function renderFaqBody(items) {
  const groups = new Map();
  for (const it of items) { if (!groups.has(it.fromUrl)) groups.set(it.fromUrl, { from: it.from, items: [] }); groups.get(it.fromUrl).items.push(it); }
  let out = '<section class="sr-hero"><div class="sr-in"><h1>Frequently asked questions</h1><p class="sr-count" style="margin:0">Answers from across BidcoreAI. Looking for something specific? <a href="/search">Search the site</a>.</p></div></section><section class="sr-wrap">';
  for (const [url, g] of groups) {
    out += `<div class="sr-h"><a href="${esc(url)}" style="color:inherit">${esc(g.from.replace(/\s*[–|-]\s*BidcoreAI.*$/i, ''))}</a></div><div class="faq">`;
    for (const it of g.items) {
      out += `<details class="faq-i"${it.id ? ` id="${esc(it.id)}"` : ''}><summary class="faq-q">${esc(it.q)}<span class="faq-ico"><svg width="14" height="14"><use href="#ic-caret"/></svg></span></summary><div class="faq-a">${esc(it.a)}</div></details>`;
    }
    out += '</div>';
  }
  return out + '</section>';
}

module.exports = { createSiteSearch, renderBody, renderFaqBody };
