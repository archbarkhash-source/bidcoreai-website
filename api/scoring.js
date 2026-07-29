/**
 * api/scoring.js — Quick Go/No-Go, the free complimentary analysis.
 *
 * Twelve criteria, each 0-100, combined into one weighted score:
 *
 *   NAICS · PSC · Project Magnitude · Distance from Office · Preferred State ·
 *   Preferred Agency · Contract Type · Set-Aside · Capability Match ·
 *   Bond Capacity · Past Performance · Bid Preparation Time
 *
 * Bands come from the environment (see BANDS) — by default 85+ GO, 65-84 GO
 * with review required, 40-64 NOT SURE, below 40 NO-GO.
 *
 * Two conditions override the average outright, because both make the bid
 * legally impossible rather than merely unattractive: a due date that has
 * already passed, and a set-aside whose certification the contractor doesn't
 * hold. Eleven strong scores must not average those away.
 *
 * 50 means "nothing on file — neutral", never "bad". That distinction matters
 * on a free page where most visitors have filled in very little: an empty
 * profile should read as unknown, not as a red flag, and the UI can then
 * honestly say which missing input would sharpen the answer.
 *
 * ── Provenance ──────────────────────────────────────────────────────────────
 * This mirrors the rubric in the BidcoreAI product app
 * (backend/quick_go_no_go.py + capability_matching.py). It is a deliberate
 * second implementation, not a shared library: this site runs in its own repo,
 * its own runtime and its own database precisely so it shares nothing with the
 * product. The cost of that isolation is that a change to the product's bands
 * or thresholds must be made here too — keep the two in step when either moves.
 */

const DEFAULT_PREFERRED_BID_DAYS = 20;

// NAICS sector 23 (Construction). Enough to name a primary trade from the code
// alone; anything outside sector 23 reports the bare code rather than guessing.
const NAICS_TRADE_TITLES = {
  236210: 'Industrial Building Construction',
  237120: 'Oil and Gas Pipeline Construction',
  237210: 'Land Subdivision',
  238150: 'Glass and Glazing Contractors',
  238170: 'Siding Contractors',
  238190: 'Other Foundation, Structure, and Building Exterior Contractors',
  238290: 'Other Building Equipment Contractors',
  238340: 'Tile and Terrazzo Contractors',
  238350: 'Finish Carpentry Contractors',
  238390: 'Other Building Finishing Contractors',
  236115: 'New Single-Family Housing Construction',
  236116: 'New Multifamily Housing Construction',
  236220: 'Commercial and Institutional Building Construction',
  237110: 'Water and Sewer Line Construction',
  237130: 'Power and Communication Line Construction',
  237310: 'Highway, Street, and Bridge Construction',
  237990: 'Other Heavy and Civil Engineering Construction',
  238110: 'Poured Concrete Foundation and Structure Contractors',
  238120: 'Structural Steel and Precast Concrete Contractors',
  238140: 'Masonry Contractors',
  238160: 'Roofing Contractors',
  238210: 'Electrical Contractors',
  238220: 'Plumbing, Heating, and Air-Conditioning Contractors',
  238310: 'Drywall and Insulation Contractors',
  238320: 'Painting and Wall Covering Contractors',
  238330: 'Flooring Contractors',
  238910: 'Site Preparation Contractors',
  238990: 'All Other Specialty Trade Contractors',
};

// SAM.gov set-aside codes -> the certification a bidder must actually hold.
const SET_ASIDE_CERTS = {
  SBA: 'Small Business',
  SBP: 'Small Business',
  '8A': '8(a)',
  '8AN': '8(a)',
  HZC: 'HUBZone',
  HZS: 'HUBZone',
  SDVOSBC: 'SDVOSB',
  SDVOSBS: 'SDVOSB',
  WOSB: 'WOSB',
  WOSBSS: 'WOSB',
  EDWOSB: 'EDWOSB',
  EDWOSBSS: 'EDWOSB',
  VSA: 'VOSB',
  VSS: 'VOSB',
  LAS: 'Local Area Set-Aside',
  IEE: 'Indian Economic Enterprise',
  ISBEE: 'Indian Small Business Economic Enterprise',
  BICiv: 'Buy Indian',
};

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'services', 'service',
  'project', 'contract', 'construction', 'building', 'work', 'base', 'new',
]);

const keywords = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));

const asList = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : []);

// ── Individual criteria ──────────────────────────────────────────────────────

function scoreNaics(opportunityNaics, companyNaics) {
  const code = String(opportunityNaics || '').trim();
  const mine = asList(companyNaics).map((c) => String(c).trim());
  if (!code) return [50, 'This notice has no NAICS code — neutral score.'];
  if (!mine.length) return [50, 'No NAICS codes on file — add yours for a sharper score.'];
  if (mine.includes(code)) return [100, `Exact NAICS match on ${code}.`];
  if (mine.some((c) => c.slice(0, 4) === code.slice(0, 4))) {
    return [75, `Same NAICS industry group (${code.slice(0, 4)}xx) as codes you hold.`];
  }
  if (mine.some((c) => c.slice(0, 2) === code.slice(0, 2))) {
    return [35, `Same NAICS sector (${code.slice(0, 2)}) but a different trade from the codes ` +
      'you hold — sector 23 covers everything from roofing to bridges.'];
  }
  return [20, `NAICS ${code} is outside the codes on file.`];
}

function scorePsc(opportunityPsc, companyPsc) {
  const code = String(opportunityPsc || '').trim().toUpperCase();
  const mine = asList(companyPsc).map((c) => String(c).trim().toUpperCase());
  if (!code) return [50, 'This notice has no PSC code — neutral score.'];
  if (!mine.length) return [50, 'No PSC codes on file — neutral score.'];
  if (mine.includes(code)) return [100, `Exact PSC match on ${code}.`];
  if (mine.some((c) => c[0] === code[0])) return [70, `Same PSC family (${code[0]}) as codes you hold.`];
  return [30, `PSC ${code} is outside the codes on file.`];
}

function scoreMagnitude(value, min, max) {
  if (value == null) return [50, 'No project value published by SAM.gov — neutral score.'];
  if (min == null && max == null) return [50, 'No typical project size on file — neutral score.'];
  if (min != null && value < min) {
    return [40, `$${Math.round(value).toLocaleString()} is below your typical minimum of $${Math.round(min).toLocaleString()}.`];
  }
  if (max != null && value > max) {
    return [20, `$${Math.round(value).toLocaleString()} is above your typical maximum of $${Math.round(max).toLocaleString()}.`];
  }
  return [100, `$${Math.round(value).toLocaleString()} sits inside your typical project size range.`];
}

function scoreDistance(miles) {
  if (miles == null) return [50, 'No office address on file — add one to score mobilisation distance.'];
  if (miles <= 50) return [100, `${Math.round(miles)} miles from your office — local work.`];
  if (miles <= 150) return [85, `${Math.round(miles)} miles from your office — comfortable day trip.`];
  if (miles <= 250) return [70, `${Math.round(miles)} miles from your office — within normal coverage.`];
  if (miles <= 500) return [45, `${Math.round(miles)} miles from your office — mobilisation cost is material.`];
  return [20, `${Math.round(miles)} miles from your office — significant mobilisation risk.`];
}

function scoreState(state, statesServed) {
  const code = String(state || '').trim().toUpperCase();
  const mine = asList(statesServed).map((s) => String(s).trim().toUpperCase());
  if (!code) return [50, 'No place of performance on this notice — neutral score.'];
  if (!mine.length) return [50, 'No states on file — neutral score.'];
  if (mine.includes(code)) return [100, `${code} is a state you work in.`];
  return [30, `${code} is outside the states on file.`];
}

function scoreAgency(agency, targetAgencies) {
  const name = String(agency || '').toLowerCase();
  const mine = asList(targetAgencies).map((a) => String(a).toLowerCase());
  if (!name) return [50, 'No issuing agency on this notice — neutral score.'];
  if (!mine.length) return [50, 'No target agencies on file — neutral score.'];
  if (mine.some((a) => name.includes(a) || a.includes(name))) {
    return [100, 'Issued by an agency you target.'];
  }
  return [40, 'Not one of the agencies on file — no existing relationship scored.'];
}

const TIME_AND_MATERIALS = /\b(t\s*&\s*m|time\s+and\s+materials)\b/i;

function classifyContractType(type, title) {
  const text = `${type || ''} ${title || ''}`.toUpperCase();
  if (TIME_AND_MATERIALS.test(text)) return 'T&M';
  if (/\bMATOC\b/.test(text)) return 'MATOC';
  if (/\bSATOC\b/.test(text)) return 'SATOC';
  if (/\bIDIQ\b/.test(text)) return 'IDIQ';
  if (/\bBPA\b/.test(text)) return 'BPA';
  if (/INVITATION FOR BID|\bIFB\b/.test(text)) return 'IFB';
  if (/REQUEST FOR PROPOSAL|\bRFP\b|COMBINED SYNOPSIS/.test(text)) return 'RFP';
  if (/REQUEST FOR QUOT|\bRFQ\b/.test(text)) return 'RFQ';
  if (/SOURCES SOUGHT/.test(text)) return 'Sources Sought';
  if (/PRESOLICITATION/.test(text)) return 'Presolicitation';
  return null;
}

function scoreContractType(type, title, preferred) {
  const canonical = classifyContractType(type, title);
  const mine = asList(preferred);
  if (!canonical) return [[50, 'Contract type could not be determined from this notice — neutral score.'], null];
  if (!mine.length) return [[70, `${canonical} — recognised type, no preference stated.`], canonical];
  if (mine.includes(canonical)) return [[100, `${canonical} is a contract type you prefer.`], canonical];
  return [[45, `${canonical} is outside your preferred contract types.`], canonical];
}

function scoreSetAside(setAsideCode, certifications) {
  const code = String(setAsideCode || '').trim().toUpperCase();
  if (!code) return [100, 'Full and open competition — no certification required.'];
  const required = SET_ASIDE_CERTS[code] || code;
  const held = asList(certifications).map((c) => String(c).toLowerCase());
  if (!held.length) {
    return [50, `Reserved for ${required}. No certifications on file — add yours to confirm eligibility.`];
  }
  const needle = required.toLowerCase();
  if (held.some((c) => c.includes(needle) || needle.includes(c))) {
    return [100, `Set aside for ${required}, which you hold.`];
  }
  // Zero, not merely low: this is the override that makes the bid ineligible.
  return [0, `Reserved for ${required} — not among the certifications on file, so you cannot bid it.`];
}

function scoreCapability(title, naics, capabilities) {
  if (!capabilities.length) return [50, 'No capabilities on file to match against — neutral score.'];
  const needles = keywords(title);
  const code = String(naics || '').trim();
  const matched = [];
  let naicsHit = false;

  for (const c of capabilities) {
    const hay = String(c.title || '').toLowerCase();
    if (needles.some((n) => hay.includes(n))) matched.push(c.title);
    if (code && asList(c.naics_codes).map(String).includes(code)) {
      naicsHit = true;
      if (!matched.includes(c.title)) matched.push(c.title);
    }
  }

  if (naicsHit && matched.length) return [100, `NAICS and scope both match your capabilities (${matched.slice(0, 2).join(', ')}).`];
  if (matched.length >= 2) return [90, `Several capabilities cover this scope (${matched.slice(0, 2).join(', ')}).`];
  if (matched.length) return [70, `One capability covers this scope (${matched[0]}).`];
  if (!needles.length && !code) return [50, 'Nothing in this notice to match against your capabilities.'];
  return [40, "No capability on file matches this notice's scope or NAICS."];
}

function scoreBonding(value, capacity) {
  if (value == null) return [50, 'No project value published — bonding fit cannot be assessed.'];
  if (!capacity) return [50, 'No bonding capacity on file — neutral score.'];
  if (capacity >= value) return [100, `Bonding capacity ($${Math.round(capacity).toLocaleString()}) covers this project.`];
  if (capacity >= value * 0.5) return [60, `Bonding capacity covers roughly half of this project's value.`];
  return [20, `Bonding capacity ($${Math.round(capacity).toLocaleString()}) is well below this project's value.`];
}

function scorePastPerformance(title, naics, records) {
  if (!records.length) return [50, 'No past performance on file — neutral score.'];
  const hay = records.map((r) => `${r.title || ''} ${r.agency || ''} ${r.naics_code || ''}`.toLowerCase());
  const needles = keywords(title);
  if (naics) needles.push(String(naics).trim());
  if (!needles.length) return [50, 'Nothing in this notice to compare against your past performance.'];

  const hits = needles.reduce((n, needle) => n + (hay.some((h) => h.includes(needle)) ? 1 : 0), 0);
  if (hits >= 2) return [100, 'Strong overlap with work you have delivered before.'];
  if (hits === 1) return [70, 'Some overlap with work you have delivered before.'];
  return [30, 'No overlap found with the past performance on file.'];
}

function scoreBidTime(dueDate, preferredDays) {
  if (!dueDate) return [[50, 'No response deadline published — neutral score.'], null];
  const due = new Date(`${dueDate}T23:59:59Z`);
  if (Number.isNaN(due.getTime())) return [[50, 'Response deadline could not be read — neutral score.'], null];

  const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
  if (days < 0) return [[0, `The response deadline (${dueDate}) has already passed.`], days];
  if (days >= preferredDays) return [[100, `${days} days to respond — at or above your ${preferredDays}-day preparation window.`], days];
  if (days >= preferredDays * 0.5) return [[65, `${days} days to respond — tight against your ${preferredDays}-day window.`], days];
  if (days >= 3) return [[35, `Only ${days} days to respond — well inside your ${preferredDays}-day window.`], days];
  return [[15, `Only ${days} day(s) to respond — realistically too little time to prepare a bid.`], days];
}

// ── Support ──────────────────────────────────────────────────────────────────

/** Great-circle distance in miles. */
function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const RISK_TITLES = {
  'Distance from Office': 'Mobilisation',
  'Set-Aside': 'Eligibility',
  'Bid Preparation Time': 'Schedule',
  'Bond Capacity': 'Bonding',
  'Project Magnitude': 'Project Size Fit',
  'Capability Match': 'Capability Gap',
  'Past Performance': 'Past Performance',
  'Contract Type': 'Contract Type Fit',
  'NAICS Match': 'Scope Fit',
  'PSC Match': 'Scope Fit',
  'Preferred State': 'Geography',
  'Agency Match': 'Agency Relationship',
};

const status = (s) => (s >= 70 ? 'PASS' : s >= 40 ? 'REVIEW' : 'FAIL');

/**
 * Where the verdict changes. Set from the environment rather than written into
 * the code, because these are a judgement about how cautious the tool should
 * be — not a fact about scoring — and that judgement will want revising once
 * there is real usage to look at. Change them without a code edit:
 *
 *   GO_SCORE_MIN=55        above this  -> GO
 *   NOT_SURE_SCORE_MIN=40  at or above -> NOT SURE   (below -> NO-GO)
 *   UNKNOWN_RATIO=0.5      this share of criteria unscored -> NEEDS MORE INFO
 *
 * The defaults sit well below the product app's 85/65 on purpose: free
 * visitors fill in a fraction of a real profile, so half their criteria rest
 * at the neutral 50 and pull every average toward the middle. Judged on the
 * paid bands, genuinely good opportunities would come back NO-GO.
 */
function numberFromEnv(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) ? raw : fallback;
}

/**
 * Not every criterion carries the same weight, and a straight average said so
 * badly. Tested against a filled-in roofing contractor in Virginia, a plain
 * mean returned GO for highway construction (90), a $40M job from a firm that
 * caps at $5M (83), and a six-day deadline (90) — one disqualifying fact
 * diluted by eleven comfortable ones.
 *
 * These are shares of the total; they are normalised at use, so they do not
 * have to sum to exactly 1 and a criterion can be retuned on its own.
 */
const WEIGHTS = {
  'NAICS Match': 18,          // what the work actually is
  'Capability Match': 15,     // whether they do that work
  'Set-Aside': 12,            // whether they may bid at all
  'Bid Preparation Time': 12, // whether they can respond in time
  'Distance from Office': 10, // what it costs to get there
  'Project Magnitude': 10,    // whether it is their size of job
  'Past Performance': 7,
  'Bond Capacity': 6,
  'Preferred State': 4,
  'Contract Type': 3,
  'Agency Match': 2,
  'PSC Match': 1,             // a coarse code, and often absent
};

/**
 * Criteria that cannot be averaged away. Score below the floor and the verdict
 * is held at NOT SURE however well everything else did — a roofer is not a
 * highway contractor because the paperwork suits them. 50 is exempt
 * everywhere: it means "nothing on file", and an unknown must never be read as
 * a fault.
 */
const CAPS = {
  'NAICS Match': 40,
  'Capability Match': 40,
  'Project Magnitude': 40,
  'Bid Preparation Time': 40,
  'Bond Capacity': 30,
  'Distance from Office': 30,
};

const BANDS = {
  go: numberFromEnv('GO_SCORE_MIN', 85),
  goReview: numberFromEnv('GO_REVIEW_SCORE_MIN', 65),
  notSure: numberFromEnv('NOT_SURE_SCORE_MIN', 40),
  unknownRatio: numberFromEnv('UNKNOWN_RATIO', 0.5),
};

/**
 * Four answers, not three. The middle band is the honest one for most real
 * opportunities: good enough to pursue, not so clean that nobody should look
 * at it first — which is what a capture manager would actually say.
 */
const recommend = (s) =>
  (s >= BANDS.go ? 'GO'
    : s >= BANDS.goReview ? 'GO - REVIEW REQUIRED'
      : s >= BANDS.notSure ? 'NOT SURE'
        : 'NO-GO');

/** One sentence describing the current bands, so nothing has to restate them. */
function bandsSummary() {
  return `${BANDS.go}+ GO \u00b7 ${BANDS.goReview}\u2013${BANDS.go - 1} GO, review required \u00b7 ` +
    `${BANDS.notSure}\u2013${BANDS.goReview - 1} NOT SURE \u00b7 below ${BANDS.notSure} NO-GO`;
}

/** Medium and High only, worst first, max 3. A 50 is "not on file", not a risk. */
function buildRisks(matches) {
  return matches
    .filter((m) => m.score < 50)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((m) => ({
      title: RISK_TITLES[m.title] || m.title,
      severity: m.score <= 20 ? 'High' : 'Medium',
      reason: m.reason,
    }));
}

/** Which missing input would most improve this particular answer. */
function buildSuggestions(profile, matches) {
  const out = [];
  const neutral = (t) => matches.some((m) => m.title === t && m.score === 50);
  if (!asList(profile.naics_codes).length && neutral('NAICS Match')) {
    out.push('Add the NAICS codes you hold — it is the single biggest input to this score.');
  }
  if (!asList(profile.certifications).length && neutral('Set-Aside')) {
    out.push('Add your certifications (8(a), HUBZone, SDVOSB…) to confirm set-aside eligibility.');
  }
  if (!profile.office_lat && neutral('Distance from Office')) {
    out.push('Add your office address to score mobilisation distance.');
  }
  if (!profile.past_performance_count && neutral('Past Performance')) {
    out.push('Add one or two past contracts to score past-performance similarity.');
  }
  return out.slice(0, 3);
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * @param opportunity a shaped SAM.gov record (see samgov.shape)
 * @param profile     the workspace row plus { capabilities, past_performance }
 * @returns the full report the page renders
 */
function computeQuickScore(opportunity, profile) {
  const capabilities = profile.capabilities || [];
  const pastPerformance = profile.past_performance || [];
  const preferredDays = profile.min_bid_days || DEFAULT_PREFERRED_BID_DAYS;

  // NAICS from the profile and from individual capability entries both count.
  const companyNaics = [
    ...asList(profile.naics_codes),
    ...capabilities.flatMap((c) => asList(c.naics_codes)),
  ];

  let distance = null;
  if (profile.office_lat != null && profile.office_lng != null &&
      opportunity.place_of_performance_lat != null && opportunity.place_of_performance_lng != null) {
    distance = haversineMiles(
      profile.office_lat, profile.office_lng,
      opportunity.place_of_performance_lat, opportunity.place_of_performance_lng,
    );
  }

  const value = opportunity.solicitation_value_estimate ?? null;
  const [contractType, contractTypeCanonical] = scoreContractType(
    opportunity.solicitation_type, opportunity.title, profile.contract_types,
  );
  const [bidTime, daysRemaining] = scoreBidTime(opportunity.solicitation_due_date, preferredDays);
  const setAside = scoreSetAside(opportunity.solicitation_set_aside, profile.certifications);

  const criteria = [
    ['NAICS Match', scoreNaics(opportunity.solicitation_naics, companyNaics)],
    ['PSC Match', scorePsc(opportunity.psc_code, profile.psc_codes)],
    ['Project Magnitude', scoreMagnitude(value, profile.project_value_min, profile.project_value_max)],
    ['Distance from Office', scoreDistance(distance)],
    ['Preferred State', scoreState(opportunity.place_of_performance_state, profile.states_served)],
    ['Agency Match', scoreAgency(opportunity.agency, profile.target_agencies)],
    ['Contract Type', contractType],
    ['Set-Aside', setAside],
    ['Capability Match', scoreCapability(opportunity.title, opportunity.solicitation_naics, capabilities)],
    ['Bond Capacity', scoreBonding(value, profile.bonding_capacity)],
    ['Past Performance', scorePastPerformance(opportunity.title, opportunity.solicitation_naics, pastPerformance)],
    ['Bid Preparation Time', bidTime],
  ];

  const matches = criteria.map(([title, [score, reason]]) => ({
    title, score, status: status(score), reason,
    weight: WEIGHTS[title] || 1,
  }));

  const totalWeight = matches.reduce((sum, m) => sum + m.weight, 0);
  matches.forEach((m) => { m.share = m.weight / totalWeight; });

  let overall = Math.round(matches.reduce((sum, m) => sum + m.score * m.share, 0));
  let recommendation = recommend(overall);
  let overrideReason = null;

  // A brand-new visitor has almost nothing on file, so most criteria return the
  // neutral 50 and the average lands around 58 — which the bands would call
  // NO-GO. That verdict would be a lie: nothing about the opportunity was
  // judged, only the absence of a profile. When half or more of the criteria
  // are "not on file", say so instead of pronouncing on the bid.
  // Withholding a verdict is about how much of the DECISION is unknown, not how
  // many rows are. Counting rows, someone who had filled in NAICS, capability,
  // set-aside and state — 55% of the weight, and the four that matter most —
  // still got "NEEDS MORE INFO" because seven light criteria were blank. Weight
  // is what the score is made of, so weight is what has to be known.
  const unknowns = matches.filter((m) => m.score === 50);
  const unknownWeight = unknowns.reduce((sum, m) => sum + m.share, 0);
  const mostlyUnknown = unknownWeight >= BANDS.unknownRatio;

  // Anything that disqualifies on its own, held out of the average's reach.
  // 50 is exempt: it is an unknown, not a failing.
  const blockers = matches.filter(
    (m) => CAPS[m.title] != null && m.score !== 50 && m.score < CAPS[m.title],
  );

  if (daysRemaining != null && daysRemaining < 0) {
    overall = 0;
    recommendation = 'NO-GO';
    overrideReason = bidTime[1];
  } else if (setAside[0] === 0) {
    overall = 0;
    recommendation = 'NO-GO';
    overrideReason = setAside[1];
  } else if (blockers.length && recommendation === 'GO') {
    // Capped, not zeroed: this is "look closer", not "impossible" — the two
    // overrides above are the impossible ones. A clean GO held back by one bad
    // criterion becomes a GO that needs reviewing, which is exactly what it is.
    recommendation = 'GO - REVIEW REQUIRED';
    overrideReason = blockers.length === 1
      ? `${blockers[0].title} scores ${blockers[0].score}, too low to call this a GO on the ` +
        `strength of the others: ${blockers[0].reason}`
      : `${blockers.length} criteria are too low to call this a GO however well the rest did: ` +
        blockers.map((b) => `${b.title} (${b.score})`).join(', ') + '.';
  } else if (mostlyUnknown) {
    // The two overrides above still win: an expired deadline and an ineligible
    // set-aside are facts about the opportunity, true no matter how little the
    // visitor has told us.
    recommendation = 'NEEDS MORE INFO';
    const heaviest = unknowns.slice().sort((a, b) => b.share - a.share)
      .slice(0, 3).map((m) => m.title).join(', ');
    overrideReason =
      `${Math.round(unknownWeight * 100)}% of the score has nothing to weigh yet ` +
      `(${unknowns.length} of ${matches.length} criteria, led by ${heaviest}). ` +
      'Fill those in and re-run this — the verdict will mean something.';
  }

  const naicsCode = String(opportunity.solicitation_naics || '').trim();
  return {
    overall_score: overall,
    recommendation,
    override_reason: overrideReason,
    summary: {
      project_title: opportunity.title || 'Untitled opportunity',
      solicitation_number: opportunity.solicitation_number || 'Unknown',
      agency: opportunity.agency || 'Unknown',
      contract_type: contractTypeCanonical || opportunity.solicitation_type || 'Unknown',
      set_aside: opportunity.solicitation_set_aside || 'None — open competition',
      naics: naicsCode || 'Unknown',
      psc: opportunity.psc_code || 'Unknown',
      primary_trade: NAICS_TRADE_TITLES[naicsCode] || (naicsCode ? `NAICS ${naicsCode}` : 'Unknown'),
      location: [opportunity.place_of_performance_city, opportunity.place_of_performance_state]
        .filter(Boolean).join(', ') || 'Unknown',
      distance: distance == null ? 'Unknown' : `${Math.round(distance)} miles`,
      bid_due: opportunity.solicitation_due_date || 'Unknown',
      days_remaining: daysRemaining,
      preferred_bid_days: preferredDays,
    },
    matches,
    weighted: true,
    risks: buildRisks(matches),
    suggestions: buildSuggestions(profile, matches),
    computed_at: new Date().toISOString(),
  };
}

// The distinct set-asides a contractor can hold, in the exact spelling
// scoreSetAside compares against. Exported so the UI offers these and only
// these: free text was a silent scoring bug — someone typing "8a" does not
// match "8(a)", so they were told they could not bid 8(a) work they were
// eligible for.
const SET_ASIDE_OPTIONS = [
  { value: 'Small Business', label: 'Small Business' },
  { value: '8(a)', label: '8(a) Business Development' },
  { value: 'HUBZone', label: 'HUBZone' },
  { value: 'SDVOSB', label: 'Service-Disabled Veteran-Owned (SDVOSB)' },
  { value: 'VOSB', label: 'Veteran-Owned (VOSB)' },
  { value: 'WOSB', label: 'Woman-Owned (WOSB)' },
  { value: 'EDWOSB', label: 'Economically Disadvantaged Woman-Owned (EDWOSB)' },
  { value: 'Indian Economic Enterprise', label: 'Indian Economic Enterprise (IEE)' },
  { value: 'Indian Small Business Economic Enterprise', label: 'Indian Small Business (ISBEE)' },
  { value: 'Buy Indian', label: 'Buy Indian' },
  { value: 'Local Area Set-Aside', label: 'Local Area Set-Aside' },
];

// The contract types classifyContractType can produce. Offering exactly these
// keeps "preferred contract types" comparable with what a notice is classified
// as — the same reason the set-asides are a fixed list.
const CONTRACT_TYPE_OPTIONS = [
  { value: 'IFB', label: 'IFB — Invitation for Bid' },
  { value: 'RFP', label: 'RFP — Request for Proposal' },
  { value: 'RFQ', label: 'RFQ — Request for Quote' },
  { value: 'IDIQ', label: 'IDIQ' },
  { value: 'MATOC', label: 'MATOC' },
  { value: 'SATOC', label: 'SATOC' },
  { value: 'BPA', label: 'BPA — Blanket Purchase Agreement' },
  { value: 'T&M', label: 'T&M — Time and Materials' },
  { value: 'Sources Sought', label: 'Sources Sought' },
  { value: 'Presolicitation', label: 'Presolicitation' },
];

// States and territories, by the two-letter code SAM.gov puts in a notice's
// place of performance. Offered as a list for the same reason as the
// set-asides: scoreState compares codes, so someone typing "Virginia" would be
// told Virginia is outside the states they work in.
const STATE_OPTIONS = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
  ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
  ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'],
  ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
  ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'],
  ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
  ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
  ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'],
  ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
  ['PR', 'Puerto Rico'], ['VI', 'U.S. Virgin Islands'], ['GU', 'Guam'],
  ['AS', 'American Samoa'], ['MP', 'Northern Mariana Islands'],
].map(([value, label]) => ({ value, label: `${value} — ${label}` }));

// Every NAICS in sector 23 that this page offers, labelled. Derived from the
// trade titles above so one list cannot drift from the other.
const NAICS_OPTIONS = Object.keys(NAICS_TRADE_TITLES)
  .sort()
  .map((code) => ({ value: String(code), label: `${code} — ${NAICS_TRADE_TITLES[code]}` }));

/**
 * Is this a construction opportunity?
 *
 * Sector 23 is the whole of Construction, so the prefix is the definition
 * rather than a hand-kept list that would go stale. A contractor's own codes
 * always pass too: someone holding 561210 (facilities support) or 811310
 * (repair and maintenance) does federal construction work under those codes,
 * and hiding their own trade would be absurd.
 */
function isConstructionNaics(code, alsoAllow) {
  const naics = String(code || '').trim();
  if (!naics) return false;
  if (naics.startsWith('23')) return true;
  return (alsoAllow || []).map(String).includes(naics);
}

module.exports = {
  computeQuickScore, classifyContractType, isConstructionNaics,
  // recommend is exported so the band boundaries can be tested directly rather
  // than inferred from whole scored opportunities.
  recommend,
  BANDS, bandsSummary, WEIGHTS, CAPS,
  SET_ASIDE_CERTS, SET_ASIDE_OPTIONS, CONTRACT_TYPE_OPTIONS, STATE_OPTIONS,
  NAICS_OPTIONS,
};
