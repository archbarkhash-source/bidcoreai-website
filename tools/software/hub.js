/**
 * /software — the hub the trade pages hang off.
 *
 * It has two jobs. For a visitor, it is a way to get to the page for the scope
 * they are pricing today, which is why the grid is filterable rather than a
 * wall of twenty identical cards. For search, it is the page that collects the
 * whole section into one internal-link surface.
 */
const page = {
  slug: 'index',
  url: '/software',
  name: 'Construction Software',
  h1: 'Construction Estimating and Takeoff Software, by Trade',
  title: 'Construction Estimating &amp; Takeoff Software | BidcoreAI',
  description: 'AI construction software for takeoff, estimating, bidding and proposals — one platform, with a workspace for every trade and for federal work. Book a demo.',
  keywords: 'construction software, construction estimating software, construction takeoff software, quantity takeoff software, construction bidding software, ai bidding software, federal bidding software, preconstruction software',
  eyebrow: 'Construction software',
  eyebrowIcon: 'ic-layers',
  heroLead: 'BidcoreAI is an AI-powered preconstruction platform: read the documents, measure the drawings, price the quantities against your own cost data, package the bid and draft the proposal — in one workspace, for whichever trade you are estimating today.',
  pills: [
    { icon: 'ic-scan',  text: 'AI takeoff' },
    { icon: 'ic-calc',  text: 'Cost estimating' },
    { icon: 'ic-pkg',   text: 'Bid packages &amp; proposals' },
  ],
  card: {
    eyebrow: 'One platform',
    headline: 'Drawings in, bid out',
    sub: 'Six capabilities that most contractors currently buy from four vendors and reconcile by hand',
    items: [
      'AI document analysis — scope with page citations',
      'AI quantity takeoff on PDF drawings in the browser',
      'CSI-coded cost estimating on your own cost data',
      'Bid packages, ITB tracking and quote leveling',
      'AI-drafted proposals from the priced estimate',
    ],
  },
  intro: {
    eyebrow: 'What this section is',
    h2: 'One Platform, a Workspace for Every Scope',
    paras: [
      'Every page in this section describes the same platform doing a different job. The takeoff engine, the cost database, the bid tools and the proposal writer do not change between trades. What changes is what gets measured and in which units — cubic yards and formwork contact area for concrete, pounds of metal by gauge for ductwork, unit counts at coursing for masonry, head counts by hazard classification for sprinkler, cut and fill between two surfaces for earthwork.',
      'That is the argument for a single system rather than a shelf of trade tools. A general contractor pricing a whole building measures every division in one project, against one cost database, with one set of drawings and one revision history. A subcontractor pricing one trade uses the same workspace scoped to their own scope, and gets the same audit trail: every quantity linked to the sheet it came from, every assumption written down.',
      'The same is true downstream of the estimate. <a href="/software/construction-bidding-software">Bidding</a> — packages, invitations, coverage, levelling and proposals — runs in the same project as the estimate that generated it, so the number you submit is the number you priced. <a href="/software/federal-bidding-software">Federal work</a> adds solicitation reading, FAR clause review, wage determinations and proposals written to the evaluation criteria, on top of the same estimating engine.',
      'The pages below go into the detail of each area — what the software does, how it does it, where bids in that scope usually go wrong, and what comes out at the end. Start with the head-term pages if you want the general argument, or go straight to what you are bidding this week.',
    ],
  },
  features: {
    eyebrow: 'Platform',
    h2: 'What the Platform Does, in Every Trade',
    lead: 'The capabilities every trade page below is describing a different application of.',
    cards: [
      { icon: 'ic-brain',  title: 'AI Document Analysis', desc: 'Specifications, drawings and addenda read end to end, with the scope returned as a checkable list citing the page it came from.' },
      { icon: 'ic-scan',   title: 'AI Quantity Takeoff', desc: 'Counts, lengths, areas and volumes measured on PDF drawings in the browser, proposed by AI and confirmed by an estimator.' },
      { icon: 'ic-calc',   title: 'Cost Estimating', desc: 'Quantities priced against your own cost library, coded to CSI MasterFormat, with material, labor and equipment separated.' },
      { icon: 'ic-db',     title: 'Cost Database', desc: 'Your historical unit costs stored and reused, so the second estimate of a building type is faster and better than the first.' },
      { icon: 'ic-shield', title: 'Risk and Compliance Analysis', desc: 'Contract clauses, liquidated damages, insurance limits and schedule risk extracted with page citations.' },
      { icon: 'ic-pkg',    title: 'Bid Packages', desc: 'Scope split into subcontractor packages straight from the estimate, with the right sheets and spec sections attached.' },
      { icon: 'ic-chart',  title: 'Bid Leveling', desc: 'Subcontractor quotes compared line against line, with what each included and excluded made explicit.' },
      { icon: 'ic-file',   title: 'Proposal Generation', desc: 'A proposal drafted from the estimate you priced, in the structure the client or the solicitation asked for.' },
      { icon: 'ic-flag',   title: 'Federal Bidding', desc: 'SAM.gov opportunities, a free Go/No-Go Analyzer and proposal structures that match how solicitations are evaluated.' },
      { icon: 'ic-refresh',title: 'Revision Comparison', desc: 'A re-issued drawing set compared against the last, so an addendum means checking what changed rather than starting again.' },
      { icon: 'ic-users',  title: 'Team Collaboration', desc: 'Several estimators in one project at once, with a record of who changed which number and when.' },
      { icon: 'ic-cloud',  title: 'Browser-Based', desc: 'Windows, macOS, iPad or a jobsite laptop. No workstation licence, no plugin versions, nothing to install.' },
    ],
  },
  projectsH2: 'Project Types the Platform Is Used On',
  projectsLead: 'From a tenant fit-out to a federal barracks — the same workspace, scoped to the job.',
  workflow: {
    h2: 'How a Bid Runs in BidcoreAI',
    lead: 'The same seven steps whether you are pricing one trade or twenty-eight divisions.',
    steps: [
      { t: 'Upload the drawings and specifications', s: 'Plan set, specification book, addenda and bid forms. Large sets can arrive as a Drive, Dropbox or WeTransfer link instead of an upload.' },
      { t: 'The AI reads the documents', s: 'Every sheet, schedule and specification section is analysed and the scope returned as a list, each item citing the page it came from.' },
      { t: 'Quantities are measured', s: 'The takeoff workspace measures across the whole set. AI proposes the measurements; an estimator confirms, corrects and adds what only a person would catch.' },
      { t: 'Review the measurements', s: 'Every quantity is shown on its sheet at the scale it was measured, so a reviewer can verify a number without re-measuring it.' },
      { t: 'Apply your costs', s: 'Quantities priced against your own cost library or a regional benchmark, with productivity, waste and equipment carried into the line item.' },
      { t: 'Package and level', s: 'The estimate splits into subcontractor packages, ITBs go out with the right sheets, and returning quotes are levelled against the scope sent.' },
      { t: 'Export or submit', s: 'Export to Excel for your own bid form, or generate the proposal from the priced estimate and submit it with the assumptions attached.' },
    ],
  },
  benefits: {
    eyebrow: 'Benefits',
    h2: 'Why One Platform Beats Four',
    lead: 'The gains come from the connections between the steps, not from any single step.',
    cards: [
      { icon: 'ic-zap',     title: 'No Export Between Steps', desc: 'Takeoff, estimate, package and proposal share one data model, so there is no re-keying and no chance of pricing a superseded takeoff.' },
      { icon: 'ic-db',      title: 'Costs That Compound', desc: 'Every estimate feeds one cost database. After a season of bidding, your unit costs reflect your crews on your projects rather than a national average.' },
      { icon: 'ic-check',   title: 'Auditable Numbers', desc: 'Every quantity keeps its sheet, scale and author. When a number is challenged after award, you can show it instead of defending it.' },
      { icon: 'ic-trending',title: 'More Bids per Estimator', desc: 'The binding constraint on most contractors is estimator hours. Cutting takeoff time is what turns three properly priced bids a week into eight.' },
      { icon: 'ic-shield',  title: 'Fewer Scope Misses', desc: 'Reading the specification systematically catches the sections a hurried estimator skims — the omissions that survive into the contract.' },
      { icon: 'ic-users',   title: 'Work That Outlives People', desc: 'Estimates, measurements, assumptions and correspondence live in the project rather than on one estimator\'s desktop.' },
    ],
  },
  faqH2: 'Construction Software — Common Questions',
  faqs: [
    { q: 'What is BidcoreAI?', a: 'BidcoreAI is an AI-powered preconstruction platform for US contractors. It reads drawings and specifications, measures quantities, prices them against your own cost data, splits the scope into subcontractor bid packages, levels the quotes that come back and drafts the proposal — in one workspace rather than four disconnected tools.' },
    { q: 'Is this one product or a suite of them?', a: 'One. Every page in this section describes the same platform applied to a different scope. What changes between them is what gets measured, in which units, and what the bid has to comply with — not the software. A general contractor, a concrete subcontractor and a federal prime use the same workspace scoped differently.' },
    { q: 'Does it handle bidding as well as estimating?', a: 'Yes, in the same project. Bid packages are generated from the priced estimate, invitations are tracked by trade, coverage is visible as bid day approaches, subcontractor quotes are levelled line against line, and the proposal is drafted from the estimate you actually priced. See <a href="/software/construction-bidding-software">construction bidding software</a>.' },
    { q: 'Do I need separate takeoff and estimating software?', a: 'No — both are built in. Quantity takeoff and cost estimating share one project, so confirmed quantities are immediately available for pricing with no export step and no version mismatch between what was measured and what was priced.' },
    { q: 'Can I use my own cost database?', a: 'Yes, and it is the intended way to run the platform. Import an existing cost library from Excel or CSV, build one from your completed projects, or map to the cost codes your accounting system uses. A regional benchmark is available as a fallback for scope you have never priced.' },
    { q: 'What does it cost?', a: 'There are three plans — Starter, Pro and Premium — differing in active projects, team seats and which capabilities are included. See <a href="/pricing">pricing</a> for the full feature matrix, or book a demo and we will tell you which tier fits how you bid.' },
    { q: 'Is there anything free?', a: 'Yes. The <a href="/go-no-go">Go/No-Go Analyzer</a> is free and needs no card: connect your own SAM.gov API key and get an instant twelve-criterion bid/no-bid analysis on a federal opportunity. It is the fastest way to see how the platform reads a solicitation.' },
    { q: 'Do I have to install anything?', a: 'No. Everything runs in the browser on Windows, macOS, iPad and Android tablets. There is no plugin, no CAD licence and no per-workstation install, so adding an estimator during a busy bid week is an invitation rather than an IT ticket.' },
    { q: 'What file formats does it accept?', a: 'PDF drawing sets including scanned and vector plans, specification books, addenda and bid forms. Cost libraries import from Excel or CSV, and everything exports back to Excel or CSV.' },
    { q: 'What is the difference between the software and your estimating services?', a: 'The software gives you capacity you control and a cost database that improves with every bid. The <a href="/construction-estimating-services">estimating services</a> give you finished work without hiring — estimators working inside this same platform who measure and price a package for you, typically in 24 to 72 hours. Most contractors want both at different moments.' },
    { q: 'Does it support federal bidding?', a: 'Yes, which is unusual for estimating software. SAM.gov opportunity analysis, the free Go/No-Go Analyzer, FAR-aware risk and compliance review and proposal structures that follow how solicitations are actually evaluated are all built in. See the <a href="/guide">federal bidding guide</a> for how the pieces fit together.' },
  ],
  service: {
    h2: 'Or Have Estimators Do It for You',
    body: 'Software solves the per-bid cost of estimating. It does not create hours in a week when five sets land at once. BidcoreAI also runs professional takeoff and estimating services staffed by estimators working in this same platform — send the drawing set and get back measured quantities, a priced estimate, a marked-up drawing set and a written basis of estimate.',
    href: '/quantity-takeoff-estimating-services',
    label: 'Takeoff &amp; Estimating Services',
  },
  cta: {
    h2: 'See It Run on Your Own Drawings',
    lead: 'Bring a set you have already bid. Watching it price a job whose real numbers you know is the only demo that settles anything.',
  },
};

/** Fallback featureList for the SoftwareApplication schema. */
const featureList = page.features.cards.map(c => c.title);

/**
 * The filterable grid of every trade page. The filter is a plain input over
 * data-terms — twenty cards is small enough that anything cleverer would be
 * slower than typing, and it degrades to a full list with JavaScript off.
 */
function grid(pages, { ico, CHIP }) {
  /* Three groups, by the question the visitor is answering: how do I measure
     and price it, how do I get the bid out, and what trade am I on today. */
  const BID  = ['construction-bidding-software', 'ai-bidding-software', 'federal-bidding-software'];
  const CORE = ['construction-estimating-software', 'construction-takeoff-software', 'quantity-takeoff-software'];

  const pick   = slugs => slugs.map(s => pages.find(p => p.slug === s));
  const core   = pick(CORE);
  const bid    = pick(BID);
  const trades = pages.filter(p => !CORE.includes(p.slug) && !BID.includes(p.slug));

  if ([...core, ...bid].some(p => !p)) throw new Error('hub: a grouped slug no longer exists');

  const card = p => `<a class="sw-card" href="${p.url}" data-terms="${p.name.replace(/&amp;/g, 'and').toLowerCase()} ${p.keywords}">
        <span class="sw-card-ico">${ico(p.eyebrowIcon.replace('ic-', ''), 18)}</span>
        <span class="sw-card-t">${p.name}</span>
        <span class="sw-card-d">${p.card.sub}</span>
      </a>`;

  return `<section style="background:var(--white);padding:80px 24px" id="all-software">
  <div class="con">
    <div class="rv" style="text-align:center;margin-bottom:28px">
      <div class="eyebrow" style="justify-content:center">${ico('layout')} Every page in this section</div>
      <h2 class="h2">Find the Software for What You Are Bidding</h2>
      <p class="lead" style="margin:12px auto 0">${pages.length} workspaces on one platform. Type a trade, a material, a CSI division or "federal".</p>
    </div>
    <div class="rv" style="max-width:520px;margin:0 auto 32px">
      <input id="sw-filter" type="search" placeholder="Search — concrete, duct, rebar, sprinkler, federal, cut and fill…"
        oninput="filterSoftware(this.value)" aria-label="Filter software pages"
        style="width:100%;padding:13px 16px;border:1px solid var(--g200);border-radius:10px;font-family:var(--fb);font-size:14px;color:var(--navy);background:var(--white)"/>
    </div>
    <div class="rv">
      <div class="sw-group-h">Estimating and takeoff</div>
      <div class="sw-grid">
      ${core.map(card).join('\n      ')}
      </div>
      <div class="sw-group-h">Bidding and proposals</div>
      <div class="sw-grid">
      ${bid.map(card).join('\n      ')}
      </div>
      <div class="sw-group-h">By trade</div>
      <div class="sw-grid">
      ${trades.map(card).join('\n      ')}
      </div>
      <div id="sw-empty" style="display:none;text-align:center;padding:32px;font-size:13.5px;color:var(--g600)">
        Nothing matches that. <a href="/contact" style="color:var(--orange)">Ask us</a> — if it is on a drawing set, the platform measures it.
      </div>
    </div>
  </div>
</section>
<style>
.sw-group-h{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--g400);margin:0 0 14px}
.sw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:12px;margin-bottom:36px}
.sw-card{display:flex;flex-direction:column;gap:6px;padding:18px;border:1px solid var(--g200);border-radius:12px;background:var(--white);text-decoration:none;transition:border-color .16s,transform .16s,box-shadow .16s}
.sw-card:hover{border-color:var(--orange);transform:translateY(-2px);box-shadow:0 6px 20px rgba(11,60,93,.08)}
.sw-card-ico{color:var(--orange);display:block}
.sw-card-t{font-family:var(--fh);font-size:14.5px;font-weight:700;color:var(--navy);line-height:1.35}
.sw-card-d{font-size:12.5px;color:var(--g600);line-height:1.6}
</style>
<script>
/* Filters the grid on the client. The group headings hide when everything
   under them is filtered out, so an empty "By trade" label never sits alone. */
function filterSoftware(q){
  var t=q.trim().toLowerCase(), shown=0;
  document.querySelectorAll('.sw-card').forEach(function(c){
    var hit=!t||c.dataset.terms.indexOf(t)>-1;
    c.style.display=hit?'':'none';
    if(hit)shown++;
  });
  document.querySelectorAll('.sw-grid').forEach(function(g){
    var any=Array.prototype.some.call(g.querySelectorAll('.sw-card'),function(c){return c.style.display!=='none';});
    g.style.display=any?'':'none';
    if(g.previousElementSibling&&g.previousElementSibling.classList.contains('sw-group-h'))
      g.previousElementSibling.style.display=any?'':'none';
  });
  document.getElementById('sw-empty').style.display=shown?'none':'block';
}
</script>`;
}

module.exports = { page, grid, featureList };
