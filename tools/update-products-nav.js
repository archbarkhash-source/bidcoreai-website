/**
 * Puts the two products (BidcoreAI Scale, BidcoreAI Sync) into the Products menu of every page in /views,
 * and updates the footer. Every page carries its own copy of the nav,
 * so this walks the files. Idempotent: running it again changes nothing.
 *
 *   node tools/update-products-nav.js
 */
const fs = require('fs');
const path = require('path');

const VIEWS = path.join(__dirname, '..', 'views');
const NEW_VER = '20261102g';

const ITEMS = [
  ['/products/scale', 'ic-scan', 'BidcoreAI Scale', 'AI takeoff and cost estimating'],
  ['/products/sync', 'ic-layers', 'BidcoreAI Sync', 'End to end: bid, budget, build and site'],
];

const desktopItems = ITEMS.map(([href, ic, t, d]) => `          <a class="nl-item" href="${href}">
            <span class="nl-item-ico"><svg width="15" height="15"><use href="#${ic}"/></svg></span>
            <span class="nl-item-txt"><span class="nl-item-t">${t}</span><span class="nl-item-d">${d}</span></span>
          </a>`).join('\n');
const mobileItems = ITEMS.map(([href, ic, t]) => `      <a class="mob-nl" href="${href}"><svg width="14" height="14"><use href="#${ic}"/></svg> ${t}</a>`).join('\n');

const FOOT_LI = `          <li><a href="/products/scale">BidcoreAI Scale</a></li>
          <li><a href="/products/sync">BidcoreAI Sync</a></li>
`;

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out);
    else if (f.name.endsWith('.html')) out.push(p);
  }
  return out;
}

let changed = 0;
for (const file of walk(VIEWS)) {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let s = raw.replace(/\r\n/g, '\n');
  const before = s;

  // Desktop Products dropdown.
  const dStart = s.indexOf('id="nl-features"');
  if (dStart >= 0) {
    const open = '<div class="nl-panel" role="menu">\n';
    const a = s.indexOf(open, dStart);
    const close = '\n        </div>\n      </div>';
    const b = s.indexOf(close, a);
    if (a < 0 || b < 0) throw new Error('Products dropdown not found in ' + file);
    const inner = s.slice(a + open.length, b);
    if (!/^(\s*<a class="nl-item"[\s\S]*?<\/a>\s*)+$/.test(inner)) throw new Error('Unexpected Products dropdown content in ' + file);
    s = s.slice(0, a + open.length) + desktopItems + s.slice(b);
  }

  // Mobile Products group.
  const mStart = s.indexOf('<span class="mob-grp-l">Products</span>');
  if (mStart >= 0) {
    const sumEnd = s.indexOf('</summary>\n', mStart) + '</summary>\n'.length;
    const endTag = s.indexOf('    </details>', sumEnd);
    if (sumEnd < 12 || endTag < 0) throw new Error('Mobile Products group not found in ' + file);
    s = s.slice(0, sumEnd) + mobileItems + '\n' + s.slice(endTag);
  }

  // The "US & Global" tag beside the logo was removed again at the owner's request: strip it wherever it is found.
  s = s.replace(/\n    <span class="mkt-tag"[^>]*>[^<]*<\/span>/g, '');

  // Footer.
  // Bid Connect is no longer a separate product: its features sit under BidcoreAI Sync.
  s = s.replace(/ *<li><a href="\/products\/bid-connect">Bid Connect<\/a><\/li>\n/g, '');
  s = s.replace('Built exclusively for US contractors.', 'Built for US and global contractors.');
  if (!s.includes('href="/products/scale">BidcoreAI Scale</a></li>')) {
    s = s.replace('<div class="ft-col-t">Products</div>\n        <ul class="ft-links">\n', (m) => m + FOOT_LI);
  }
  s = s.replace(/style\.css\?v=[0-9a-z]+/g, `style.css?v=${NEW_VER}`);

  if (s !== before) {
    fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
    changed++;
  }
}
console.log('updated', changed, 'files');
