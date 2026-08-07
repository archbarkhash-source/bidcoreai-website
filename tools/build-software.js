/**
 * Builds the /software section into views/software/*.html.
 *
 *   node tools/build-software.js
 *
 * Why a generator when every other page on this site is hand-written HTML:
 * twenty trade pages share one page shape and differ only in their content,
 * and twenty hand-copied files drift. The copy that matters — what the trade
 * measures, how it is measured, what an estimator gets wrong, the FAQs — is
 * written per page in tools/software/pages/*.js and is unique to each. What
 * the generator repeats is only the layout.
 *
 * The nav, footer, icon sheet and demo modal are lifted at build time out of a
 * real page (CHROME_SRC) rather than copied in here, so a future nav change
 * made across views/*.html reaches this section on the next build instead of
 * quietly leaving it a version behind.
 *
 * Output is committed. Nothing runs this at request time.
 */
const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const VIEWS      = path.join(ROOT, 'views');
const OUT_DIR    = path.join(VIEWS, 'software');
const CHROME_SRC = path.join(VIEWS, 'concrete-estimating-services.html');

const SITE    = 'https://www.bidcoreai.com';
const CSS_VER = '20260806b';

const pages = require('./software/pages');
const hub   = require('./software/hub');

/* ─────────────────────────────────────────────────────────────
   Chrome — sliced out of an existing page
────────────────────────────────────────────────────────────── */
function readChrome() {
  const src = fs.readFileSync(CHROME_SRC, 'utf8');

  const topStart = src.indexOf('<body>');
  const topEnd   = src.indexOf('<!-- PAGE CONTENT -->');
  const botStart = src.indexOf('<!-- ════════ FOOTER ════════ -->');
  if (topStart < 0 || topEnd < 0 || botStart < 0) {
    throw new Error(`Cannot find the chrome markers in ${path.basename(CHROME_SRC)} — ` +
      'has that page been restructured? Point CHROME_SRC at a page that still has them.');
  }

  let top = src.slice(topStart + '<body>'.length, topEnd);
  let bot = src.slice(botStart);

  /* The source page is a Services page, so its Services tab is marked active.
     Clear every active tab, then mark Features — which is the menu the software
     pages hang off, rather than a tab of their own. */
  top = top.replace(/class="nl nl-drop-t on"/g, 'class="nl nl-drop-t"')
           .replace(/class="nl on"/g, 'class="nl"')
           .replace('class="nl nl-drop-t" id="nl-features"', 'class="nl nl-drop-t on" id="nl-features"');

  /* These pages are served from /software/<slug>, one level deeper than the
     rest of the site, so the "../public/…" paths the other views use would
     resolve to the wrong place. Absolute is unambiguous at any depth. */
  bot = bot.replace('src="../public/script.js"', 'src="/script.js"');

  /* Six columns instead of five: the footer gains a Software column here. */
  bot = bot.replace('class="ft-grid"', 'class="ft-grid ft-grid--6"')
           .replace('<div class="ft-col-t">Quick Links</div>', FOOTER_SOFTWARE_COL + '<div class="ft-col-t">Quick Links</div>');

  if (!bot.includes('ft-grid--6') || !bot.includes('Estimating Software</a>')) {
    throw new Error('Footer surgery failed — the footer markup in the chrome source has changed.');
  }
  return { top, bot };
}

const FOOTER_SOFTWARE_COL = `<div class="ft-col-t">Software</div>
        <ul class="ft-links">
          <li><a href="/software">All Software</a></li>
          <li><a href="/software/construction-estimating-software">Construction Estimating Software</a></li>
          <li><a href="/software/construction-takeoff-software">Construction Takeoff Software</a></li>
          <li><a href="/software/quantity-takeoff-software">Quantity Takeoff Software</a></li>
          <li><a href="/software/construction-bidding-software">Construction Bidding Software</a></li>
          <li><a href="/software/ai-bidding-software">AI Bidding Software</a></li>
          <li><a href="/software/federal-bidding-software">Federal Bidding Software</a></li>
          <li><a href="/software/concrete-estimating-software">Concrete Estimating Software</a></li>
          <li><a href="/software/electrical-estimating-software">Electrical Estimating Software</a></li>
        </ul>
      </div>
      <div>
        `;

/* ─────────────────────────────────────────────────────────────
   Helpers
────────────────────────────────────────────────────────────── */
const byline = Object.fromEntries(pages.map(p => [p.slug, p]));

/** Schema.org wants plain text, not the markup the page renders. */
function plain(html) {
  return String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
    .replace(/&times;/g, '×').replace(/&frac12;/g, '½')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

const ico  = (id, s = 12) => `<svg width="${s}" height="${s}"><use href="#ic-${id}"/></svg>`;
const attr = s => String(s).replace(/"/g, '&quot;');

/* Shared across the trade pages: the project types the platform is used on.
   A chip list, not prose — it is here to answer "does it cover what I build". */
const PROJECT_TYPES = [
  ['ic-building', 'Commercial'],
  ['ic-home',     'Residential &amp; multifamily'],
  ['ic-tool',     'Industrial'],
  ['ic-shield',   'Healthcare'],
  ['ic-users',    'Educational'],
  ['ic-flag',     'Federal &amp; government'],
  ['ic-tag',      'Retail'],
  ['ic-pkg',      'Warehouse &amp; distribution'],
  ['ic-star',     'Hospitality'],
  ['ic-trending', 'Infrastructure &amp; civil'],
];

const CHIP = 'display:inline-flex;align-items:center;gap:6px;background:var(--white);border:1px solid var(--g200);border-radius:8px;padding:10px 16px;font-size:12.5px;font-weight:600;color:var(--navy);text-decoration:none';

/* ─────────────────────────────────────────────────────────────
   Sections
────────────────────────────────────────────────────────────── */
function head(p) {
  const url = `${SITE}${p.url}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${p.title}</title>
<meta name="description" content="${attr(p.description)}"/>
<meta name="keywords" content="${attr(p.keywords)}"/>
<link rel="canonical" href="${url}"/>
<meta property="og:title" content="${attr(p.title)}"/>
<meta property="og:description" content="${attr(p.description)}"/>
<meta property="og:url" content="${url}"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="BidcoreAI"/>
<meta property="og:image" content="https://bidcoreai-assets.vercel.app/logo.png"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${attr(p.title)}"/>
<meta name="twitter:description" content="${attr(p.description)}"/>
<meta name="twitter:image" content="https://bidcoreai-assets.vercel.app/logo.png"/>
<link rel="icon" type="image/png" href="https://bidcoreai-assets.vercel.app/favicon.png"/>
<link rel="stylesheet" href="/style.css?v=${CSS_VER}"/>
${schema(p)}
</head>`;
}

function schema(p) {
  const url = `${SITE}${p.url}`;
  const crumbs = [
    { '@type': 'ListItem', position: 1, name: 'Home',     item: `${SITE}/` },
    { '@type': 'ListItem', position: 2, name: 'Software', item: `${SITE}/software` },
  ];
  if (p.url !== '/software') crumbs.push({ '@type': 'ListItem', position: 3, name: plain(p.name), item: url });

  const blocks = [{
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: `BidcoreAI ${plain(p.name)}`,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Construction Estimating Software',
    operatingSystem: 'Web browser — Windows, macOS, iOS, Android',
    url,
    description: plain(p.description),
    softwareHelp: `${SITE}/guide`,
    featureList: (p.features ? p.features.cards : hub.featureList).map(c => plain(c.title || c)),
    /* No price and no rating: neither is published, and inventing either to
       win a rich result would be a lie told in structured data. */
    offers: { '@type': 'Offer', priceCurrency: 'USD', url: `${SITE}/pricing`, category: 'Subscription' },
    provider: { '@type': 'Organization', name: 'BidcoreAI', url: `${SITE}/` },
  }, {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs,
  }, {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'BidcoreAI',
    url: `${SITE}/`,
    logo: 'https://bidcoreai-assets.vercel.app/logo.png',
    description: 'AI-powered preconstruction platform for US contractors — quantity takeoff, cost estimating, bid packages, leveling and proposals.',
    sameAs: [
      'https://www.youtube.com/@bidcoreai',
      'https://www.linkedin.com/company/bidcoreai',
      'https://x.com/BidcoreAI',
    ],
  }];

  if (p.faqs && p.faqs.length) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: p.faqs.map(f => ({
        '@type': 'Question',
        name: plain(f.q),
        acceptedAnswer: { '@type': 'Answer', text: plain(f.a) },
      })),
    });
  }

  return blocks.map(b => `<script type="application/ld+json">\n${JSON.stringify(b, null, 2)}\n</script>`).join('\n');
}

/** Visible breadcrumb trail — the counterpart to the BreadcrumbList above. */
function crumbs(p) {
  const last = p.url === '/software'
    ? '<span style="color:var(--navy);font-weight:600">Software</span>'
    : `<a href="/software" style="color:var(--g600);text-decoration:none">Software</a>
      <span style="color:var(--g400)">/</span>
      <span style="color:var(--navy);font-weight:600">${p.name}</span>`;
  return `<nav aria-label="Breadcrumb" style="background:var(--white);border-bottom:1px solid var(--g200);padding:11px 24px">
  <div class="con" style="display:flex;align-items:center;gap:8px;font-size:12px;flex-wrap:wrap">
    <a href="/" style="color:var(--g600);text-decoration:none">Home</a>
    <span style="color:var(--g400)">/</span>
    ${last}
  </div>
</nav>`;
}

function hero(p) {
  return `<div class="sol-hero">
  <div class="sol-hero-in">
    <div class="rv">
      <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(232,93,0,.14);border:1px solid rgba(232,93,0,.26);border-radius:100px;padding:5px 13px;font-size:10.5px;font-weight:700;color:var(--org2);text-transform:uppercase;letter-spacing:.08em;margin-bottom:16px">
        ${ico(p.eyebrowIcon, 11)} ${p.eyebrow}
      </div>
      <h1 class="h1" style="font-size:clamp(32px,4.6vw,58px)">${p.h1}</h1>
      <p style="font-size:16px;color:var(--g600);max-width:640px;line-height:1.74;margin-top:14px">${p.heroLead}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:18px">
        ${p.pills.map((pill, i) =>
          `<span class="pill pill-${['o', 't', 'b'][i % 3]}">${ico(pill.icon, 10)} ${pill.text}</span>`).join('\n        ')}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:24px">
        <button class="btn btn-p btn-lg" onclick="openModal('Book Live Demo')">${ico('play', 16)} Book a Demo</button>
        <a href="/go-no-go" class="btn btn-gh btn-lg">Try the Free Analyzer</a>
        <a href="/features" class="btn btn-gh btn-lg">Explore Features</a>
      </div>
      <div style="font-size:11.5px;color:var(--g400);margin-top:12px">Free Go/No-Go Analyzer &middot; no card required &middot; a specialist replies within 1 business day</div>
    </div>
    <div style="margin-top:44px;max-width:520px">
      <div class="svc-card rv">
        <div style="position:relative;z-index:1">
          <div class="eyebrow" style="color:var(--org2)">${ico('calc', 11)} ${p.card.eyebrow}</div>
          <div class="svc-price-v" style="font-size:30px;line-height:1.15">${p.card.headline}</div>
          <div class="svc-price-u">${p.card.sub}</div>
        </div>
        <div class="svc-dels">
          ${p.card.items.map(i => `<div class="svc-del">${ico('check', 13).replace('<svg', '<svg style="color:var(--teal)"')} ${i}</div>`).join('\n          ')}
        </div>
      </div>
    </div>
  </div>
</div>`;
}

function intro(p) {
  return section('white', `
    <div class="rv" style="max-width:820px;margin:0 auto">
      <div class="eyebrow">${ico('brain')} ${p.intro.eyebrow}</div>
      <h2 class="h2">${p.intro.h2}</h2>
      ${p.intro.paras.map(t => `<p style="font-size:14.5px;color:var(--g600);line-height:1.85;margin-top:16px">${t}</p>`).join('\n      ')}
    </div>`);
}

function cardGrid(p, block, bg, icon) {
  return section(bg, `
    <div class="rv" style="text-align:center;margin-bottom:44px">
      <div class="eyebrow" style="justify-content:center">${ico(icon)} ${block.eyebrow}</div>
      <h2 class="h2">${block.h2}</h2>
      <p class="lead" style="margin:12px auto 0">${block.lead}</p>
    </div>
    <div class="svcx-grid">
      ${block.cards.map((c, i) => `<div class="svcx rv">
        <div class="svcx-ico${['', ' svcx-ico--b', ' svcx-ico--t'][i % 3]}">${ico(c.icon, 20)}</div>
        <div class="svcx-t">${c.title}</div>
        <p class="svcx-p">${c.desc}</p>
        ${c.items ? `<ul class="svcx-ul">
          ${c.items.map(x => `<li>${ico('check')} ${x}</li>`).join('\n          ')}
        </ul>` : ''}
      </div>`).join('\n      ')}
    </div>`);
}

function csi(p) {
  return section('white', `
    <div class="rv" style="text-align:center;margin-bottom:44px">
      <div class="eyebrow" style="justify-content:center">${ico(p.csi.icon || 'report')} ${p.csi.eyebrow || 'Spec coverage'}</div>
      <h2 class="h2">${p.csi.h2}</h2>
      <p class="lead" style="margin:12px auto 0">${p.csi.lead}</p>
    </div>
    <div class="csi-grid rv">
      ${p.csi.rows.map(r => `<div class="csi-row"><span class="csi-n">${r.n}</span><span class="csi-l">${r.l}</span></div>`).join('\n      ')}
    </div>`);
}

function projects(p) {
  return section('g50', `
    <div class="rv" style="text-align:center;margin-bottom:32px">
      <div class="eyebrow" style="justify-content:center">${ico('building')} Supported projects</div>
      <h2 class="h2">${p.projectsH2 || 'Project Types It Is Built For'}</h2>
      <p class="lead" style="margin:12px auto 0">${p.projectsLead}</p>
    </div>
    <div class="rv" style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center">
      ${PROJECT_TYPES.map(([i, t]) => `<span style="${CHIP}">${ico(i)} ${t}</span>`).join('\n      ')}
    </div>`);
}

function workflow(p) {
  return section('white', `
    <div class="rv" style="text-align:center;margin-bottom:44px">
      <div class="eyebrow" style="justify-content:center">${ico('refresh')} Workflow</div>
      <h2 class="h2">${p.workflow.h2}</h2>
      <p class="lead" style="margin:12px auto 0">${p.workflow.lead}</p>
    </div>
    <div class="svc-steps rv" style="max-width:800px;margin:0 auto">
      ${p.workflow.steps.map((s, i) => `<div class="svc-step"><div class="svc-n">${i + 1}</div><div><div class="svc-t">${s.t}</div><div class="svc-s">${s.s}</div></div></div>`).join('\n      ')}
    </div>`);
}

function why(p) {
  return section('dk', `
    <div class="rv" style="text-align:center;margin-bottom:44px">
      <div class="eyebrow" style="justify-content:center;color:rgba(232,93,0,.86)">${ico('sparkle')} Why BidcoreAI</div>
      <h2 class="h2 h2w">${p.why.h2}</h2>
      <p class="lead" style="margin:12px auto 0">${p.why.lead}</p>
    </div>
    <div class="svcx-grid">
      ${p.why.items.map((c, i) => `<div class="svcx rv">
        <div class="svcx-ico${['', ' svcx-ico--b', ' svcx-ico--t'][i % 3]}">${ico(c.icon, 20)}</div>
        <div class="svcx-t">${c.t}</div>
        <p class="svcx-p">${c.s}</p>
      </div>`).join('\n      ')}
    </div>`);
}

function faq(p) {
  return `<section style="background:var(--g50);padding:88px 24px" id="faq">
  <div class="con">
    <div class="rv" style="text-align:center;margin-bottom:44px">
      <div class="eyebrow" style="justify-content:center">${ico('scan')} Frequently asked questions</div>
      <h2 class="h2">${p.faqH2 || `${p.name} — Your Questions Answered`}</h2>
    </div>
    <div class="faq-grid rv">
      ${p.faqs.map(f => `<div class="faq-item"><button class="faq-q" onclick="toggleFaq(this)"><span>${f.q}</span><svg class="faq-arrow" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg></button><div class="faq-a">${f.a}</div></div>`).join('\n      ')}
    </div>
  </div>
</section>
<style>
.faq-grid{display:flex;flex-direction:column;gap:0;border:1px solid var(--g200);border-radius:16px;overflow:hidden;background:var(--white)}
.faq-item{border-bottom:1px solid var(--g200)}
.faq-item:last-child{border-bottom:none}
.faq-q{width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 24px;background:none;border:none;cursor:pointer;font-family:var(--fb);font-size:14.5px;font-weight:600;color:var(--navy);text-align:left;transition:background .15s}
.faq-q:hover{background:var(--g50)}
.faq-q.open{background:var(--g50);color:var(--orange)}
.faq-q.open .faq-arrow{transform:rotate(180deg);stroke:var(--orange)}
.faq-arrow{flex-shrink:0;transition:transform .22s ease,stroke .15s;stroke:var(--g400)}
.faq-a{max-height:0;overflow:hidden;transition:max-height .32s ease,padding .22s ease;font-size:13.5px;color:var(--g600);line-height:1.76;padding:0 24px;background:var(--g50)}
.faq-a.open{max-height:900px;padding:16px 24px 20px;border-top:1px solid var(--g200)}
</style>`;
}

/** The service counterpart — outsourced estimating for people who would rather
    hand the drawings over than measure them. */
function service(p) {
  return section('white', `
    <div class="rv" style="max-width:820px;margin:0 auto;background:var(--g50);border:1px solid var(--g200);border-radius:16px;padding:32px">
      <div class="eyebrow">${ico('users')} Would rather not measure it yourself?</div>
      <h2 class="h2" style="font-size:clamp(20px,2.2vw,28px)">${p.service.h2}</h2>
      <p style="font-size:14px;color:var(--g600);line-height:1.8;margin-top:12px">${p.service.body}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
        <a href="${p.service.href}" class="btn btn-p">${p.service.label}</a>
        <a href="/work-samples" class="btn btn-gh">See Work Samples</a>
      </div>
    </div>`);
}

function related(p) {
  const links = p.related.map(slug => {
    const t = byline[slug];
    if (!t) throw new Error(`${p.slug}: related page "${slug}" does not exist`);
    return `<a href="${t.url}" style="${CHIP}">${ico(t.eyebrowIcon)} ${t.name}</a>`;
  });
  return section('g50', `
    <div class="rv" style="text-align:center;margin-bottom:28px">
      <div class="eyebrow" style="justify-content:center">${ico('layout')} Related software</div>
      <h2 class="h2" style="font-size:clamp(20px,2.4vw,30px)">Estimating Software for Every Trade</h2>
      <p class="lead" style="margin:12px auto 0">One platform, one cost database, one set of drawings — whichever scope you are pricing today.</p>
    </div>
    <div class="rv" style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center">
      ${links.join('\n      ')}
      <a href="/software" style="${CHIP};background:rgba(232,93,0,.12);border-color:rgba(232,93,0,.28);color:var(--org2)">${ico('layers')} All Construction Software</a>
    </div>`, 'padding:56px 24px');
}

function cta(p) {
  return `<section style="background:var(--dk);padding:64px 24px;border-top:1px solid var(--g200)">
  <div class="con" style="text-align:center">
    <div class="rv">
      <div class="eyebrow" style="justify-content:center;color:rgba(232,93,0,.86)">${ico('send')} Get started</div>
      <h2 class="h2 h2w" style="font-size:clamp(22px,2.6vw,34px)">${p.cta.h2}</h2>
      <p class="lead" style="margin:12px auto 0">${p.cta.lead}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:24px">
        <button class="btn btn-p btn-lg" onclick="openModal('Book Live Demo')">${ico('play', 16)} Book a Demo</button>
        <a href="/pricing" class="btn btn-gh btn-lg">See Pricing</a>
        <a href="/contact" class="btn btn-gh btn-lg">Talk to Us</a>
      </div>
    </div>
  </div>
</section>`;
}

function section(bg, inner, pad = 'padding:80px 24px') {
  const b = bg === 'dk' ? 'var(--dk)' : bg === 'g50' ? 'var(--g50)' : 'var(--white)';
  return `<section style="background:${b};${pad}">\n  <div class="con">${inner}\n  </div>\n</section>`;
}

/* ─────────────────────────────────────────────────────────────
   Assemble
────────────────────────────────────────────────────────────── */
function render(p, chrome) {
  return [
    head(p),
    '<body>',
    chrome.top,
    '<!-- PAGE CONTENT -->',
    crumbs(p),
    hero(p),
    intro(p),
    cardGrid(p, p.measures, 'g50', p.measures.icon || 'scan'),
    cardGrid(p, p.features, 'white', 'zap'),
    csi(p),
    projects(p),
    workflow(p),
    cardGrid(p, p.benefits, 'g50', 'trending'),
    why(p),
    faq(p),
    service(p),
    related(p),
    cta(p),
    chrome.bot,
  ].join('\n');
}

function renderHub(chrome) {
  return [
    head(hub.page),
    '<body>',
    chrome.top,
    '<!-- PAGE CONTENT -->',
    crumbs(hub.page),
    hero(hub.page),
    intro(hub.page),
    hub.grid(pages, { ico, CHIP }),
    cardGrid(hub.page, hub.page.features, 'white', 'zap'),
    projects(hub.page),
    workflow(hub.page),
    cardGrid(hub.page, hub.page.benefits, 'g50', 'trending'),
    faq(hub.page),
    service(hub.page),
    cta(hub.page),
    chrome.bot,
  ].join('\n');
}

function main() {
  const chrome = readChrome();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const written = [];
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), renderHub(chrome));
  written.push('/software');

  for (const p of pages) {
    fs.writeFileSync(path.join(OUT_DIR, `${p.slug}.html`), render(p, chrome));
    written.push(p.url);
  }

  /* Word count is the one quality check worth automating here: a trade page
     that comes out thin is a page that will not rank, and it is easy to miss
     by eye when the layout looks full either way. */
  let thin = 0;
  for (const url of written) {
    const file = url === '/software' ? 'index.html' : `${url.split('/').pop()}.html`;
    const html = fs.readFileSync(path.join(OUT_DIR, file), 'utf8');
    const body = html.slice(html.indexOf('<!-- PAGE CONTENT -->'), html.indexOf('<!-- ════════ FOOTER ════════ -->'));
    const words = plain(body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')).split(/\s+/).length;
    if (words < 1500) thin++;
    console.log(`  ${String(words).padStart(5)} words  ${url}${words < 1500 ? '   ← under 1,500' : ''}`);
  }
  console.log(`\n${written.length} pages written to views/software/${thin ? ` (${thin} under 1,500 words)` : ''}`);
}

main();
