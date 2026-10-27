/**
 * Builds the five product pages under /products/<slug> from one template.
 *
 *   node tools/build-products.js
 *
 * The page chrome (nav, footer, symbols) is copied from an existing feature page, so a nav change made to every page
 * is picked up the next time this runs. The wording describes what the BidcoreAI application's US workspace does today:
 * keep it to features that exist in the app's sidebar (Bid Connect, Bid Management, Project Management, Site Operations)
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
    slug: 'bid-connect',
    name: 'Bid Connect',
    image: 'Bidworkspace.jpg',
    imageAlt: 'Bid packages and subcontractor leveling in the bid workspace',
    headline: 'Invite subs.<br>Find opportunities.<br>Level every bid.',
    lead: 'Send bid invitations, track what comes back, compare subcontractor bids and watch federal opportunities, all from one section of the project.',
    keywords: 'bid invitations, subcontractor ITB, bid leveling, federal opportunities, sub bid log',
    pillars: [
      ['pkg', 'Start from a project or an opportunity', 'Create a project that opens straight in its Bid Invite, or create an opportunity with no project at all.'],
      ['layers', 'Bid packages by trade', 'One package per trade, with its scope, due date and bid instructions.'],
      ['users', 'Invite subcontractors', 'Send ITBs with the documents attached, from your own directory or a radius search by trade.'],
      ['report', 'Sub Bid Log', 'Track each bid per package, then send acknowledgement, clarification, addendum, award and regret notices from templates.'],
      ['filter', 'Bid leveling', 'Compare bids side by side with exclusions, alternates and clarifications, then carry the chosen amount into Bid Cost.'],
      ['flag', 'Opportunities and Federal Opportunities', 'See bid invitations other companies sent you, and a federal feed with match scoring, Go/No-Go, saved searches and alerts.'],
    ],
    steps: [
      ['Create the packages', 'One package per trade, from the project scope.'],
      ['Invite and track', 'ITBs go out with the current documents. Log each bid as it returns and send addenda to every invited sub at once.'],
      ['Level and award', 'Compare the bids on the same scope, award the package and send regret notices.'],
    ],
    faqs: [
      ['Where does the sub list come from?', 'Your own directory, plus a radius search by trade when you need coverage in an area you have not bid in before.'],
      ['Can I receive bid invitations as well as send them?', 'Yes. Opportunities lists the bid invitations other companies have sent you.'],
      ['Is there a calendar of deadlines?', 'Yes. The Preconstruction Calendar shows bid deadlines, queries, site visits, openings and award formalities across all your tenders.'],
    ],
    related: ['bid-management', 'project-management', 'procurement-management'],
  },
  {
    slug: 'bid-management',
    name: 'Bid Management',
    image: 'takeoff_markup.jpg',
    imageAlt: 'Takeoff markup on a drawing in the bid workspace',
    headline: 'From documents<br>to a priced bid.',
    lead: 'Read the documents, measure the drawings, price the work on your own cost database and draft the proposal, in one project.',
    keywords: 'construction bid management, AI document analysis, takeoff, cost estimation, bid proposal',
    pillars: [
      ['building', 'Project setup', 'Project details, team and the compliance profile, set once and used by every step.'],
      ['file', 'Documents', 'Drawings, specifications, solicitation and addenda, filed in folders and attached to the project.'],
      ['brain', 'AI Analysis', 'Scope by trade, risk at clause level, a Go/No-Go decision and alerts when a later amendment lands.'],
      ['scan', 'Takeoff', 'Measure drawings on screen. AI symbol detection proposes counts for you to review and apply.'],
      ['db', 'Cost Estimation', 'Price on your own cost database across the CSI divisions, with markup factors, overrides and a Final Estimate.'],
      ['calc', 'Bid Cost and AI Bid Proposal', 'Build the bid from general conditions, equipment, subs, materials, labor, payroll, alternates and markups, then draft the proposal from it.'],
    ],
    steps: [
      ['Set up and read', 'Upload the documents and let AI Analysis pull out scope and risk.'],
      ['Measure and price', 'Takeoff quantities flow into the estimate on your own rates.'],
      ['Build the bid', 'Bid Cost totals the job, and the proposal is drafted from it.'],
    ],
    faqs: [
      ['Does the AI make the decisions?', 'No. The AI reads and measures. Your estimators review it and decide.'],
      ['Can someone else do the takeoff?', 'Yes. Our US estimators can measure the set for you and deliver the quantities into your project. See Takeoff Services.'],
      ['Do I have to use my own cost data?', 'No. Build the database from your historical costs and keep it private to your organisation, or start from benchmark data.'],
    ],
    related: ['ai-document-analysis', 'ai-quantity-takeoff', 'csi-cost-estimation', 'ai-bid-proposal', 'ai-risk-compliance-analyser', 'go-no-go'],
  },
  {
    slug: 'project-management',
    name: 'Project Management',
    image: 'Project_Documets.jpg',
    imageAlt: 'Project documents and records in a BidcoreAI project',
    headline: 'Run the job<br>on the numbers<br>you bid with.',
    lead: 'Budget, schedule, billing and site records for a project you have won, connected to the estimate it came from.',
    keywords: 'construction project management, budgeting, schedule of values, pay application, daily log, RFI log',
    pillars: [
      ['calc', 'Budgeting', 'A line per cost code with original budget, approved changes, revised budget, committed and projected costs, forecast to complete and over or under. Sync it from the estimate.'],
      ['chart', 'Budget changes and cash flow', 'Every modification and change order in one register, a change history, and a cash flow ledger with running totals.'],
      ['cal', 'Scheduling', 'A Gantt with linked tasks, draggable bars, and dates that recalculate when a predecessor moves.'],
      ['layout', 'Project Management Calendar', 'Milestones, activities, deliveries and work packages of all your projects.'],
      ['report', 'Schedule of Values and Pay App', 'An AIA G703-style Schedule of Values and a G702/G703-style pay application, with retainage, change orders and deductions.'],
      ['file', 'Daily Log', 'The site diary: weather, manpower, equipment, notes, deliveries, visitors, inspections, safety, accidents and delays.'],
      ['brain', 'Monthly Narrative', 'Drafted only from the month\'s records, with every number checked against the data. The PM edits and approves it.'],
      ['check', 'Submittal, RFI and Transmittal Logs', 'Generate and track spec-section submittals, requests for information and document transmittals.'],
      ['layers', 'Procurement Log', 'Track long-lead items beside the budget. See Procurement Management.'],
    ],
    steps: [
      ['Budget from the estimate', 'Sync the budget lines from the estimate, then track changes against it.'],
      ['Schedule and record', 'Plan the Gantt, then keep the Daily Log and logs up to date.'],
      ['Bill and report', 'Bill from the Schedule of Values and write the month\'s narrative from the site records.'],
    ],
    faqs: [
      ['Is it the same project as the bid?', 'Yes. The budget can be synced from the estimate, so the numbers you bid with carry into the job.'],
      ['Is the monthly report written by AI?', 'It is drafted from the month\'s own records, and every number in the text is checked against them. A person edits and approves it before it locks.'],
      ['Which billing format does the pay app follow?', 'An AIA G702/G703-style application built on the Schedule of Values. An approved application is frozen and the next one carries its figures forward.'],
    ],
    related: ['procurement-management', 'site-operations', 'bid-management'],
  },
  {
    slug: 'procurement-management',
    name: 'Procurement Management',
    image: 'Pricing.jpg',
    imageAlt: 'Costs and orders tracked in a BidcoreAI project',
    headline: 'Know what is ordered,<br>what is late<br>and what changed.',
    lead: 'Track long-lead items, purchase orders and change orders inside the project, next to its costs.',
    keywords: 'construction procurement log, purchase orders, change orders, long lead items',
    pillars: [
      ['layers', 'Procurement Log', 'Long-lead items with description, quantity, units, contractor, supplier, lead time, quantity status and whether they are onsite.'],
      ['db', 'Load from the estimate', 'Pull each estimate line into the log as a row, instead of retyping the list.'],
      ['users', 'Linked to your Directory', 'Choose the contractor and the supplier from your own Directory.'],
      ['pkg', 'Purchase Orders', 'Tracked once per project and shown in Bid Cost and the cost estimate.'],
      ['report', 'Change Orders', 'Approved change orders feed their signed dollar impact into the totals.'],
      ['check', 'Approval and versions', 'Submit the log for approval. Earlier versions are kept.'],
    ],
    steps: [
      ['Load the items', 'Start the log from the estimate, then add suppliers and lead times.'],
      ['Track orders', 'Raise purchase orders and watch the quantity status and onsite columns.'],
      ['Record changes', 'Log change orders so their cost impact reaches the totals.'],
    ],
    faqs: [
      ['Does it compare supplier quotes?', 'No. Procurement Management tracks orders, lead times and changes. Subcontractor bids are compared in Bid Connect.'],
      ['Is it part of Project Management?', 'Yes. The Procurement Log sits in the Project Management section of the app, and purchase orders and change orders also appear in Bid Cost.'],
    ],
    related: ['project-management', 'bid-connect', 'site-operations'],
  },
  {
    slug: 'site-operations',
    name: 'Site Operations',
    image: 'peopleonsite.jpg',
    imageAlt: 'People on a construction site',
    headline: 'Plan crews and equipment.<br>Release the work.',
    lead: 'Schedule crews and resources across projects, keep the workforce directory, and issue work packages and orders, with a separate workspace for contractors and subcontractors.',
    keywords: 'construction site operations, crew scheduling, resource planning, work packages, workforce directory',
    pillars: [
      ['layout', 'Operations Dashboard', 'Portfolio, resource, operations and financial figures, each from stored data. A figure with no data says so instead of showing zero.'],
      ['cal', 'Crew and Resource Scheduler', 'A cross-project scheduler for crews and resources, with conflict detection.'],
      ['users', 'Workforce Directory', 'People, crews, crew templates and equipment, with their availability.'],
      ['building', 'Subcontractors', 'For general contractors: see your subcontractors and what is committed to them.'],
      ['pkg', 'Work Packages and Orders', 'Jobs and work packages with their work-order status.'],
      ['tool', 'Contractor and Subcontractor workspaces', 'The workspace follows the business type saved in your Company Information, so each company sees the view that fits it.'],
    ],
    steps: [
      ['Set up your company', 'Choose your business type in Company Information.'],
      ['Plan crews and equipment', 'Add people, crews and equipment, then schedule them across projects and resolve conflicts.'],
      ['Release the work', 'Issue work packages and track their work orders on the dashboard.'],
    ],
    faqs: [
      ['Is it for general contractors or subcontractors?', 'Both. Site Operations opens the General Contractor or the Subcontractor workspace from the business type in your Company Information.'],
      ['Where do daily site records go?', 'The Daily Log is in Project Management, under Reports.'],
    ],
    related: ['project-management', 'procurement-management', 'bid-connect'],
  },
];

const FEATURE_LINKS = {
  'ai-document-analysis': ['AI Document Analysis', 'Scope Extraction'],
  'ai-quantity-takeoff': ['AI Quantity Takeoff', 'Quantity Takeoff Workspace'],
  'csi-cost-estimation': ['Cost Estimation', 'Structured Estimating'],
  'ai-bid-proposal': ['AI Bid Proposal', 'Proposal Generation'],
  'ai-risk-compliance-analyser': ['AI Risk & Compliance Analyser', 'Risk and Compliance'],
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
  const title = `${p.name} | BidcoreAI Products`;
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
  return `      <a class="ft-rel-c" href="/products/${slug}">\n        <div class="ft-rel-t">${esc(o.name)}</div>\n        <div class="ft-rel-x">Product</div>\n      </a>`;
}

function body(p) {
  const pillars = p.pillars.map(([ic, t, x], i) => `      <div class="ov-p c${(i % 3) + 1}">
        <div class="ov-ico ${['b', 'o', 't'][i % 3]}"><svg width="22" height="22"><use href="#${ICONS[ic]}"/></svg></div>
        <div class="ov-title">${esc(t)}</div>
        <div class="ov-text">${esc(x)}</div>
      </div>`).join('\n');
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
    <div class="rv" style="text-align:center"><h2 class="h2">What you can do</h2></div>
    <div class="ov-pillars rv" style="margin-top:40px">
${pillars}
    </div>
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
