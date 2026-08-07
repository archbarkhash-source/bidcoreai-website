/**
 * Adds the /software pages to the Features menu on every page in /views.
 *
 * They go inside Features rather than into a tab of their own: the software
 * pages describe the platform, which is what Features already covers, and a
 * seventh top-level tab would push the nav past what fits on a laptop. It also
 * keeps Services meaning one thing — work done for you by estimators — instead
 * of holding two different trade lists that read almost the same.
 *
 * Every page carries its own copy of the nav markup, so this walks the files
 * and inserts the same two blocks into each. Idempotent: a page that already
 * has the software group is skipped, so it is safe to re-run.
 *
 *   node tools/add-software-nav.js
 */
const fs = require('fs');
const path = require('path');

const VIEWS = path.join(__dirname, '..', 'views');

/* Desktop — appended to the Features panel under its own heading, after the
   platform capabilities and before the panel closes. */
const DESKTOP = `
          <div class="nl-panel-h">Estimating &amp; takeoff software</div>
          <a class="nl-item" href="/software/construction-estimating-software">
            <span class="nl-item-ico"><svg width="15" height="15"><use href="#ic-calc"/></svg></span>
            <span class="nl-item-txt"><span class="nl-item-t">Construction Estimating Software</span><span class="nl-item-d">Priced estimates from your own cost data</span></span>
          </a>
          <a class="nl-item" href="/software/construction-takeoff-software">
            <span class="nl-item-ico"><svg width="15" height="15"><use href="#ic-scan"/></svg></span>
            <span class="nl-item-txt"><span class="nl-item-t">Construction Takeoff Software</span><span class="nl-item-d">Measure PDF drawings in the browser</span></span>
          </a>
          <a class="nl-item" href="/software/quantity-takeoff-software">
            <span class="nl-item-ico"><svg width="15" height="15"><use href="#ic-layers"/></svg></span>
            <span class="nl-item-txt"><span class="nl-item-t">Quantity Takeoff Software</span><span class="nl-item-d">Counts, lengths, areas and volumes</span></span>
          </a>
          <a class="nl-item" href="/software/construction-bidding-software">
            <span class="nl-item-ico"><svg width="15" height="15"><use href="#ic-pkg"/></svg></span>
            <span class="nl-item-txt"><span class="nl-item-t">Construction Bidding Software</span><span class="nl-item-d">Packages, ITBs, leveling and proposals</span></span>
          </a>
          <a class="nl-item" href="/software/federal-bidding-software">
            <span class="nl-item-ico"><svg width="15" height="15"><use href="#ic-flag"/></svg></span>
            <span class="nl-item-txt"><span class="nl-item-t">Federal Bidding Software</span><span class="nl-item-d">SAM.gov, FAR clauses and Section M proposals</span></span>
          </a>
          <a class="nl-more" href="/software">Software by Trade <span aria-hidden="true">&rarr;</span></a>`;

/* Mobile — the same three, appended to the Features group. */
const MOBILE = `
      <a class="mob-nl" href="/software/construction-estimating-software"><svg width="14" height="14"><use href="#ic-calc"/></svg> Estimating Software</a>
      <a class="mob-nl" href="/software/construction-takeoff-software"><svg width="14" height="14"><use href="#ic-scan"/></svg> Takeoff Software</a>
      <a class="mob-nl" href="/software/quantity-takeoff-software"><svg width="14" height="14"><use href="#ic-layers"/></svg> Quantity Takeoff Software</a>
      <a class="mob-nl" href="/software/construction-bidding-software"><svg width="14" height="14"><use href="#ic-pkg"/></svg> Bidding Software</a>
      <a class="mob-nl" href="/software/federal-bidding-software"><svg width="14" height="14"><use href="#ic-flag"/></svg> Federal Bidding Software</a>
      <a class="mob-nl mob-nl--more" href="/software">Software by Trade <span aria-hidden="true">&rarr;</span></a>`;

/* Both anchors are the last item in their respective Features menus. Matched
   as patterns rather than literals because these files are checked out with
   CRLF endings on Windows and with LF elsewhere. */
const DESKTOP_ANCHOR = /<span class="nl-item-t">AI Bid Proposal<\/span><span class="nl-item-d">Drafted from the bid you just priced<\/span><\/span>\r?\n *<\/a>/;
const MOBILE_ANCHOR  = /<a class="mob-nl" href="\/ai-bid-proposal">.*?AI Bid Proposal<\/a>/;

let changed = 0, skipped = 0, missed = [];

for (const file of fs.readdirSync(VIEWS).filter(f => f.endsWith('.html'))) {
  const full = path.join(VIEWS, file);
  let html = fs.readFileSync(full, 'utf8');

  if (html.includes('href="/software"')) { skipped++; continue; }
  if (!DESKTOP_ANCHOR.test(html) || !MOBILE_ANCHOR.test(html)) { missed.push(file); continue; }

  /* Match the file's own line endings, so a Windows checkout does not end up
     with three lines of LF in the middle of a CRLF file. */
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const fix = s => s.replace(/\n/g, eol);

  html = html.replace(MOBILE_ANCHOR,  m => m + fix(MOBILE));
  html = html.replace(DESKTOP_ANCHOR, m => m + fix(DESKTOP));

  fs.writeFileSync(full, html);
  changed++;
}

console.log(`Software links in the Features menu: ${changed} page(s) updated, ${skipped} already had them.`);
if (missed.length) console.log(`  no Features menu (left alone): ${missed.join(', ')}`);
