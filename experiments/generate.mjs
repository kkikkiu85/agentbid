// Deterministic synthetic data generator. Seeded, so the committed JSON in
// /data regenerates byte-for-byte:  node experiments/generate.mjs
//
// Supply is built as a cross-product of destination x style x price tier so the
// market is not accidentally starved; demand is drawn so that every persona has
// at least some affordable inventory. A market where nothing matches would make
// every strategy look equally bad and prove nothing.
import { writeFileSync } from 'node:fs';
import { FEATURES, MONTHS } from '../engine/schema.js';

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261126);
const pick = a => a[Math.floor(rnd() * a.length)];
const sample = (a, n) => { const c = [...a], o = []; while (o.length < n && c.length) o.push(c.splice(Math.floor(rnd() * c.length), 1)[0]); return o; };
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// Advertisers sell what their brand plausibly sells, so a "luxury" house does
// not turn up with a 600,000 KRW backpacker trip.
const ADVERTISERS_BY_STYLE = {
  luxury:      [['adv-lumen', 'Lumen Luxury Travel'], ['adv-kestrel', 'Kestrel Journeys']],
  backpacker:  [['adv-bitgil', 'Bitgil Tour'], ['adv-orbit', 'Orbit Holidays']],
  package:     [['adv-hanil', 'Hanil Travel'], ['adv-pivot', 'Pivot Getaways'], ['adv-bitgil', 'Bitgil Tour']],
  independent: [['adv-nomadly', 'Nomadly'], ['adv-sakura', 'Sakura Stay'], ['adv-maru', 'Maru Trip'], ['adv-onda', 'Onda Travel']]
};

const DESTS = ['JP', 'JP', 'JP', 'TW', 'VN', 'TH', 'ES', 'IT', 'US'];  // JP x3 = demo market has deeper supply
const STYLES4 = ['independent', 'package', 'luxury', 'backpacker'];
const TIER = {
  backpacker:  [450, 780],
  independent: [760, 1650],
  package:     [640, 1450],
  luxury:      [1900, 3200]
};
const PRODUCT_WORDS = ['Free & Easy', 'City Break', 'Signature', 'Essential', 'Deep Dive', 'Winter Escape', 'Smart Saver', 'Premier', 'Local Routes', 'Slow Trip'];

const offers = [];
let n = 0;
for (const dest of DESTS) {
  for (const style of STYLES4) {
    for (let tier = 0; tier < 3; tier++) {
      const [lo, hi] = TIER[style];
      const step = (hi - lo) / 3;
      const price = between(Math.round(lo + step * tier), Math.round(lo + step * (tier + 1)));
      const roster = ADVERTISERS_BY_STYLE[style];
      const [advId, advName] = roster[n % roster.length];
      const featPool = FEATURES.filter(f => f !== 'group_tour');
      const feats = sample(featPool, between(3, 6));
      if (style === 'luxury') { for (const f of ['private_transfer', 'refundable']) if (!feats.includes(f)) feats.push(f); }
      if (style === 'package' && rnd() < 0.5) feats.push('group_tour');
      if (dest === 'JP' && rnd() < 0.5 && !feats.includes('onsen')) feats.push('onsen');
      // Real catalogues are messy: a 'package' product is often also sold as
      // independent. That overlap is what lets an offer pass the marketplace's
      // blind eligibility check and still fail the user's private filter.
      const styles = [style];
      if (rnd() < 0.45) styles.push(pick(STYLES4.filter(s => s !== style)));

      offers.push({
        id: `off-${String(++n).padStart(2, '0')}`,
        advertiserId: advId,
        advertiser: advName,
        product: `${dest} ${pick(PRODUCT_WORDS)} ${between(3, 6)}D`,
        category: 'travel',
        destinations: [dest],
        months: (rnd() < 0.6 ? [...MONTHS] : sample(MONTHS, 2)).sort(),
        styles,
        partyMin: 1,
        partyMax: style === 'luxury' ? between(2, 4) : between(4, 6),
        priceKRW: price * 1000,
        features: [...new Set(feats)].sort(),
        maxCpcKRW: style === 'luxury' ? between(900, 1700) : style === 'backpacker' ? between(170, 430) : between(330, 950),
        dailyBudgetKRW: between(20, 90) * 1000
      });
    }
  }
}

// --- Demand ---------------------------------------------------------------
const DEST_KO = { JP: '일본', TW: '대만', VN: '베트남', TH: '태국', ES: '스페인', IT: '이탈리아', US: '미국' };
const STYLE_KO = { independent: '자유여행으로', package: '패키지로', luxury: '호캉스 위주로', backpacker: '가성비로' };
const MONTH_KO = { '2026-12': '12월', '2027-01': '1월', '2027-02': '2월' };
const BUDGET_RANGE = { backpacker: [60, 100], independent: [90, 200], package: [80, 180], luxury: [210, 340] };
const DEST_DEMAND = ['JP','JP','JP','TW','TW','VN','VN','TH','TH','ES','IT','US'];

const personas = Array.from({ length: 40 }, (_, i) => {
  const destination = DEST_DEMAND[(i * 7 + 2) % DEST_DEMAND.length];
  const month = pick(MONTHS);
  const travelStyle = pick(['independent', 'independent', 'package', 'luxury', 'backpacker']);
  const [bl, bh] = BUDGET_RANGE[travelStyle];
  const budgetKRW = between(bl, bh) * 10000;
  const featPool = FEATURES.filter(f => f !== 'group_tour');
  const mustHave = sample(featPool, between(1, 3)).sort();
  const niceToHave = sample(featPool.filter(f => !mustHave.includes(f)), between(1, 3)).sort();
  const latentTaste = Object.fromEntries(sample(featPool, 3).map(f => [f, +(rnd() * 0.5 - 0.2).toFixed(2)]));
  const partySize = between(1, 4);
  return {
    id: `P${String(i + 1).padStart(2, '0')}`,
    destination, month, travelStyle, partySize, budgetKRW,
    mustHave, niceToHave,
    dealbreakers: travelStyle === 'independent' ? ['group_tour'] : (rnd() < 0.3 ? ['group_tour'] : []),
    latentTaste,
    raw: `${MONTH_KO[month]}에 ${DEST_KO[destination]} ${STYLE_KO[travelStyle]} 가려고 해. ${partySize}명이고 예산은 ${budgetKRW / 10000}만원 정도야.`,
    private: { historyTurns: between(8, 60), rejected: sample(offers.map(o => o.product), between(0, 2)) }
  };
});

writeFileSync(new URL('../data/offers.json', import.meta.url), JSON.stringify(offers, null, 2));
writeFileSync(new URL('../data/personas.json', import.meta.url), JSON.stringify(personas, null, 2));
console.log(`offers=${offers.length} personas=${personas.length} JP-offers=${offers.filter(o => o.destinations.includes('JP')).length}`);

// Also emit a JS module of the catalogue so serverless functions can import it
// as code (guaranteed to be bundled) instead of reading a file at runtime.
writeFileSync(new URL('../api/_catalog.js', import.meta.url),
  '// GENERATED by experiments/generate.mjs — do not edit by hand.\n' +
  'export const OFFERS = ' + JSON.stringify(offers, null, 2) + ';\n');
console.log('api/_catalog.js written');
