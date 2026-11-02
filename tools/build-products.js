/**
 * Builds the two product pages (BidcoreAI Scale, BidcoreAI Sync) under /products/<slug> from one template.
 *
 *   node tools/build-products.js
 *
 * The page chrome (nav, footer, symbols) is copied from an existing feature page, so a nav change made to every page
 * is picked up the next time this runs. The wording describes what the BidcoreAI application's US workspace does today:
 * keep it to features that exist in the app (takeoff and estimating = Scale, the whole lifecycle including bidding = Sync)
 * and say nothing about what is not built.
 */
const fs = require('fs');
const path = require('path');

const VIEWS = path.join(__dirname, '..', 'views');
const OUT = path.join(VIEWS, 'products');
const CHROME_SRC = path.join(VIEWS, 'bid-packages-leveling.html');

const ICONS = {
  pkg: 'ic-pkg', users: 'ic-users', file: 'ic-file', filter: 'ic-filter', flag: 'ic-flag', cal: 'ic-sched', layout: 'ic-layout',
  brain: 'ic-brain', scan: 'ic-scan', db: 'ic-db', calc: 'ic-calc', chart: 'ic-chart', report: 'ic-report', building: 'ic-building',
  tool: 'ic-tool', layers: 'ic-layers', check: 'ic-check', shield: 'ic-shield', mail: 'ic-mail',
};

const PRODUCTS = [
  {
    slug: 'scale',
    name: 'BidcoreAI Scale',
    image: 'takeoff_markup.jpg',
    imageAlt: 'Takeoff markup on a drawing in BidcoreAI Scale',
    headline: 'Measure it.<br>Price it.<br>Scale your bids.',
    lead: 'BidcoreAI Scale is takeoff and estimating in one workspace: read the documents, measure the drawings on screen, price the work on your own cost database and draft the proposal from the bid you priced.',
    keywords: 'BidcoreAI Scale, construction takeoff software, construction estimating software, AI takeoff, cost estimation, CSI estimating, bid proposal',
    pillars: [
      ['scan', 'Takeoff on screen', 'Measure counts, lengths and areas on PDF drawings. AI symbol detection proposes counts for you to review and apply, so nothing is accepted without a person.'],
      ['brain', 'AI Analysis of the documents', 'Specs, SOWs and addenda read end to end: scope by trade, risk at clause level with the page cited, and a Go/No-Go decision before you spend estimating time.'],
      ['db', 'Cost Estimation on your own database', 'Price quantities on a cost database you own across the CSI divisions, with markup factors, overrides and a Final Estimate. Start from benchmark data or build it from your historical costs.'],
      ['calc', 'Bid Cost', 'Build the bid from general conditions, equipment, subcontractors, materials, labor, payroll, alternates and markups, on top of the estimate.'],
      ['file', 'AI Bid Proposal', 'Cover letter through price schedule, drafted from the bid you priced. Your estimators edit it before it goes out.'],
      ['users', 'Takeoff Services when you need hands', 'Our US estimators can measure the set for you and deliver the quantities straight into your project.'],
    ],
    steps: [
      ['Set up and read', 'Upload the drawings and documents. AI Analysis pulls out scope, risk and the Go/No-Go view.'],
      ['Measure and price', 'Takeoff quantities flow into the estimate on your own rates, with markups applied once.'],
      ['Build the bid', 'Bid Cost totals the job and the proposal is drafted from the same numbers.'],
    ],
    faqs: [
      ['What is BidcoreAI Scale?', 'The takeoff and estimating product of BidcoreAI: documents, takeoff, cost estimation, bid cost and proposal in one project. It is the part of the platform estimators and preconstruction teams use every day.'],
      ['Does the AI make the decisions?', 'No. The AI reads and measures. Your estimators review it and decide.'],
      ['Do I have to use my own cost data?', 'No. Build the database from your historical costs and keep it private to your organisation, or start from benchmark data.'],
      ['Can someone else do the takeoff?', 'Yes. Our US estimators can measure the set for you and deliver the quantities into your project. See Takeoff Services.'],
      ['How is Scale different from BidcoreAI Sync?', 'Scale stops at the priced bid. Sync includes everything in Scale and carries the numbers on into budgeting, scheduling, billing, procurement and the site.'],
    ],
    related: ['sync', 'ai-quantity-takeoff', 'csi-cost-estimation', 'ai-bid-proposal', 'go-no-go'],
  },
  {
    slug: 'sync',
    name: 'BidcoreAI Sync',
    image: 'Project_Documets.jpg',
    imageAlt: 'Project documents and records in a BidcoreAI project',
    headline: 'From bid to built,<br>on one set<br>of numbers.',
    lead: 'BidcoreAI Sync is the end-to-end lifecycle: it includes everything in BidcoreAI Scale and adds bidding with your subcontractors, then carries the estimate you bid with into the budget, schedule, billing, procurement and the site.',
    keywords: 'BidcoreAI Sync, end to end construction software, preconstruction to construction, construction project management, budgeting, pay application, procurement, site operations',
    groups: [
      {
        title: 'Bid Management',
        lead: 'Win the work: read the documents, measure, price the bid and bring your subcontractors in.',
        items: [
          ['brain', 'Documents and AI Analysis', 'Specs, SOWs and addenda read end to end: scope by trade, risk at clause level with the page cited, and a Go/No-Go decision.'],
          ['scan', 'Takeoff', 'Measure counts, lengths and areas on screen. AI symbol detection proposes counts for you to review and apply.'],
          ['db', 'Cost Estimation', 'Price on your own cost database across the CSI divisions, with markup factors, overrides and a Final Estimate.'],
          ['calc', 'Bid Cost', 'General conditions, equipment, subs, materials, labor, payroll, alternates and markups, carried into the bid.'],
          ['pkg', 'Bid Packages and Leveling', 'Packages by trade, ITBs to your subs, the Sub Bid Log, bid leveling and federal opportunities.'],
          ['file', 'AI Bid Proposal', 'Cover letter through price schedule, drafted from the bid you priced and edited by your team.'],
        ],
      },
      {
        title: 'Project Management',
        lead: 'Win it and run it on the numbers you bid with. The budget syncs from the estimate.',
        items: [
          ['calc', 'Budgeting', 'A line per cost code: original budget, approved changes, committed and projected costs, forecast to complete and over or under.'],
          ['cal', 'Scheduling and Calendar', 'A Gantt with linked tasks, dates that recalculate when a predecessor moves, and a calendar of milestones, deliveries and work packages.'],
          ['report', 'Schedule of Values and Pay App', 'An AIA G703-style Schedule of Values and a G702/G703-style pay application, with retainage, change orders and deductions.'],
          ['file', 'Daily Log, Submittals and RFIs', 'The site diary plus submittal, RFI and transmittal logs.'],
          ['layers', 'Procurement', 'Long-lead items, purchase orders and change orders tracked beside the costs, loaded from the estimate.'],
          ['brain', 'Monthly Narrative', 'Drafted only from the records of the month, with every number checked against the data. A person edits and approves it.'],
        ],
      },
      {
        title: 'Site Operations',
        lead: 'Put the crews and equipment on the plan and release the work, with a workspace for contractors and for subcontractors.',
        items: [
          ['cal', 'Crew and Resource Scheduler', 'A cross-project scheduler for crews and resources, with conflict detection.'],
          ['users', 'Workforce Directory', 'People, crews, crew templates and equipment, with their availability.'],
          ['pkg', 'Work Packages and Orders', 'Jobs and work packages with their work-order status.'],
          ['building', 'Subcontractors', 'See your subcontractors and what is committed to them.'],
          ['layout', 'Operations Dashboard', 'Portfolio, resource, operations and financial figures, each from stored data. A figure with no data says so.'],
        ],
      },
    ],
    steps: [
      ['Bid', 'Read the documents, measure, estimate, invite subs and level their bids in the same project.'],
      ['Win and budget', 'Sync the budget lines from the estimate, then plan the schedule and track changes against it.'],
      ['Build and bill', 'Record the site, order the materials, release the work and bill from the Schedule of Values.'],
    ],
    faqs: [
      ['What is BidcoreAI Sync?', 'The end-to-end product: preconstruction through construction on one platform, so the numbers you bid with are the numbers you build and bill against.'],
      ['Does Sync include Scale?', 'Yes. Everything in BidcoreAI Scale is part of Sync, together with bid packages and subcontractor bid leveling. Scale on its own is for teams that only need takeoff and estimating.'],
      ['Is it the same project as the bid?', 'Yes. The budget can be synced from the estimate, so there is no re-entry between bidding and the job.'],
      ['Is the monthly report written by AI?', 'It is drafted from the records of the month, and every number in the text is checked against them. A person edits and approves it before it locks.'],
      ['Which billing format does the pay app follow?', 'An AIA G702/G703-style application built on the Schedule of Values. An approved application is frozen and the next one carries its figures forward.'],
    ],
    related: ['scale', 'ai-bid-proposal', 'bid-packages-leveling'],
  },
];

const FEATURE_LINKS = {
  'ai-document-analysis': ['AI Document Analysis', 'Scope Extraction'],
  'ai-quantity-takeoff': ['AI Quantity Takeoff', 'Quantity Takeoff Workspace'],
  'csi-cost-estimation': ['Cost Estimation', 'Structured Estimating'],
  'ai-bid-proposal': ['AI Bid Proposal', 'Proposal Generation'],
  'ai-risk-compliance-analyser': ['AI Risk & Compliance Analyser', 'Risk and Compliance'],
  'bid-packages-leveling': ['Bid Packages & Leveling', 'Subcontractor bids side by side'],
  'go-no-go': ['Go/No-Go Analyzer', 'Free'],
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Text that is already trusted (the headline carries its own <br>) is left alone; everything else goes through esc().
const caret = '<span class="faq-ico"><svg width="14" height="14"><use href="#ic-caret"/></svg></span>';

function chrome() {
  const src = fs.readFileSync(CHROME_SRC, 'utf8').replace(/\r\n/g, '\n');
  const topEnd = src.indexOf('<!-- PAGE CONTENT -->');
  const botStart = src.indexOf('<!-- ════════ FOOTER ════════ -->');
  if (topEnd < 0 || botStart < 0) throw new Error(`Cannot find the chrome markers in ${path.basename(CHROME_SRC)}`);
  return { top: src.slice(0, topEnd), bot: src.slice(botStart).replace('src="../public/script.js', 'src="/script.js') };
}

function head(top, p) {
  const title = `${p.name.startsWith('BidcoreAI') ? p.name : 'BidcoreAI ' + p.name} | Products for US and Global Contractors`;
  const desc = p.lead;
  const url = `https://www.bidcoreai.com/products/${p.slug}`;
  return top
    .replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content=".*?"\/>/, `<meta name="description" content="${esc(desc)}"/>`)
    .replace(/<meta name="keywords" content=".*?"\/>/, `<meta name="keywords" content="${esc(p.keywords)}"/>`)
    .replace(/<link rel="canonical" href=".*?"\/>/, `<link rel="canonical" href="${url}"/>`)
    .replace(/<meta property="og:title" content=".*?"\/>/, `<meta property="og:title" content="${esc(title)}"/>`)
    .replace(/<meta property="og:description" content=".*?"\/>/, `<meta property="og:description" content="${esc(desc)}"/>`)
    .replace(/<meta property="og:url" content=".*?"\/>/, `<meta property="og:url" content="${url}"/>`)
    .replace(/<meta name="twitter:title" content=".*?"\/>/, `<meta name="twitter:title" content="${esc(title)}"/>`)
    .replace(/<meta name="twitter:description" content=".*?"\/>/, `<meta name="twitter:description" content="${esc(desc)}"/>`)
    // These pages sit one folder deeper than the rest of the site, so asset paths must be absolute.
    .replace('href="../public/style.css', 'href="/style.css');
}

function relatedCard(slug) {
  if (FEATURE_LINKS[slug]) {
    const [t, x] = FEATURE_LINKS[slug];
    return `      <a class="ft-rel-c" href="/${slug}">\n        <div class="ft-rel-t">${esc(t)}</div>\n        <div class="ft-rel-x">${esc(x)}</div>\n      </a>`;
  }
  const o = PRODUCTS.find((x) => x.slug === slug);
  if (!o) throw new Error('unknown related slug ' + slug);
  return `      <a class="ft-rel-c" href="/products/${slug}">\n        <div class="ft-rel-t">${esc(o.name)}</div>\n        <div class="ft-rel-x">Product</div>\n      </a>`;
}

function groupSections(p) {
  return p.groups.map((g, gi) => `    <div class="grp-h rv"${gi ? '' : ' style="margin-top:0"'}>
      <span class="grp-n">${gi + 1}</span>
      <div><h2 class="h2" style="font-size:clamp(20px,2.4vw,30px);text-align:left">${esc(g.title)}</h2><p class="grp-lead">${esc(g.lead)}</p></div>
    </div>
    <div class="ov-pillars rv" style="margin-top:20px">
${pillarCardsOf(g.items)}
    </div>`).join('\n');
}

function pillarCardsOf(list) {
  return list.map(([ic, t, x], i) => `      <div class="ov-p c${(i % 3) + 1}">
        <div class="ov-ico ${['b', 'o', 't'][i % 3]}"><svg width="22" height="22"><use href="#${ICONS[ic]}"/></svg></div>
        <div class="ov-title">${esc(t)}</div>
        <div class="ov-text">${esc(x)}</div>
      </div>`).join('\n');
}

function body(p) {
  const pillarCards = (list) => list.map(([ic, t, x], i) => `      <div class="ov-p c${(i % 3) + 1}">
        <div class="ov-ico ${['b', 'o', 't'][i % 3]}"><svg width="22" height="22"><use href="#${ICONS[ic]}"/></svg></div>
        <div class="ov-title">${esc(t)}</div>
        <div class="ov-text">${esc(x)}</div>
      </div>`).join('\n');
  const pillars = p.pillars ? pillarCards(p.pillars) : '';
  const steps = p.steps.map(([t, x], i) => `      <div class="ft-step">
        <div class="ft-step-n">${i + 1}</div>
        <div><div class="ft-step-t">${esc(t)}</div><div class="ft-step-x">${esc(x)}</div></div>
      </div>`).join('\n');
  const faqs = p.faqs.map(([q, a], i) => `      <details class="faq-i"${i === 0 ? ' open' : ''}>
        <summary class="faq-q">${esc(q)}${caret}</summary>
        <div class="faq-a">${esc(a)}</div>
      </details>`).join('\n');
  const related = p.related.map(relatedCard).join('\n');
  return `<!-- PAGE CONTENT -->
<section class="ft-hero">
  <div class="con ft-hero-in">
    <div>
      <div class="eyebrow"><svg width="12" height="12"><use href="#ic-sparkle"/></svg> ${esc(p.name)}</div>
      <h1 class="h1" style="font-size:clamp(28px,3.6vw,44px)">${p.headline}</h1>
      <p class="lead" style="margin-top:14px">${esc(p.lead)}</p>
      <div style="margin-top:26px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-p btn-lg" onclick="openModal('Book Live Demo')"><svg width="16" height="16"><use href="#ic-play"/></svg> Request a Demo</button>
      </div>
    </div>
    <div class="ft-vis">
      <div class="slide-img-wrap">
        <img src="/images/${p.image}" alt="${esc(p.imageAlt)}" loading="lazy"/>
      </div>
    </div>
  </div>
</section>

<section class="overview">
  <div class="con">
${p.groups ? groupSections(p) : `    <div class="rv" style="text-align:center"><h2 class="h2">What you can do</h2></div>
    <div class="ov-pillars rv" style="margin-top:40px">
${pillars}
    </div>`}
  </div>
</section>

<section class="slides-sec">
  <div class="con">
    <div class="rv" style="text-align:center;margin-bottom:34px"><h2 class="h2">How it works</h2></div>
    <div class="ft-steps rv">
${steps}
    </div>
  </div>
</section>

<section class="overview">
  <div class="con">
    <div class="faq rv" style="margin-top:0">
      <h2 class="h2" style="text-align:center;margin-bottom:22px">Questions</h2>
${faqs}
    </div>
  </div>
</section>

<section class="slides-sec" style="border-top:1px solid var(--g200)">
  <div class="con">
    <div class="rv" style="text-align:center;margin-bottom:26px"><h2 class="h2" style="font-size:clamp(20px,2.4vw,30px)">Related</h2></div>
    <div class="ft-rel rv">
${related}
    </div>
    <div style="text-align:center;margin-top:34px">
      <button class="btn btn-p btn-lg" onclick="openModal('Book Live Demo')"><svg width="16" height="16"><use href="#ic-play"/></svg> See it on your own bid</button>
    </div>
  </div>
</section>
`;
}

const { top, bot } = chrome();
fs.mkdirSync(OUT, { recursive: true });
for (const p of PRODUCTS) {
  fs.writeFileSync(path.join(OUT, `${p.slug}.html`), head(top, p) + body(p) + bot);
  console.log('wrote', `views/products/${p.slug}.html`);
}
