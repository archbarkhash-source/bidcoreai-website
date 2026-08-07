/**
 * Every page under /software, in the order they appear on the hub.
 *
 * The content lives in the group files below — grouped the way an estimator
 * thinks about a set of drawings (structure, MEP, finishes, site) rather than
 * alphabetically, so related trades are written next to each other and stay
 * consistent about units and terminology.
 */
const core       = require('./pages/core');
const bidding    = require('./pages/bidding');
const structure  = require('./pages/structure');
const mep        = require('./pages/mep');
const finishes   = require('./pages/finishes');
const site       = require('./pages/site');

const pages = [...core, ...bidding, ...structure, ...mep, ...finishes, ...site];

for (const p of pages) {
  p.url = `/software/${p.slug}`;
}

/* A slug typo in a `related` list would otherwise render a dead internal link,
   which is exactly the thing this section exists to avoid. */
const slugs = new Set(pages.map(p => p.slug));
for (const p of pages) {
  for (const r of p.related) {
    if (!slugs.has(r)) throw new Error(`${p.slug}: related slug "${r}" is not a page`);
  }
  if (p.title.length > 62) throw new Error(`${p.slug}: meta title is ${p.title.length} chars — keep it under 62`);
  if (p.description.length < 140 || p.description.length > 165) {
    throw new Error(`${p.slug}: meta description is ${p.description.length} chars — aim for 150–160`);
  }
}

module.exports = pages;
