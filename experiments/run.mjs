// AgentBid — strategy comparison on synthetic data.
//
//   A. General targeting  — advertiser knows the category only.
//   B. Keyword / explicit — advertiser knows what the user literally typed.
//   C. AgentBid           — advertiser knows a consented, minimal, structured
//                           intent; the user's agent re-ranks and filters with
//                           private context the advertiser never receives.
//
// Everything is graded by trueFit(), an oracle containing latent taste that no
// strategy — including ours — can read.
//
//   node experiments/run.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { buildEgress, entropyReport, PRESETS } from '../engine/disclosure.js';
import { runAuction } from '../engine/auction.js';
import { clientFit, trueFit, hiddenRequirementCoverage, CLIENT_FIT_FLOOR } from '../engine/evaluate.js';

const offers = JSON.parse(readFileSync(new URL('../data/offers.json', import.meta.url)));
const personas = JSON.parse(readFileSync(new URL('../data/personas.json', import.meta.url)));
const PRESENT = 3;      // slots shown to the human
const RETURNED = 6;     // offers the marketplace hands back to the client

const asIntent = p => ({ ...p, category: 'travel' });

const STRATEGIES = {
  A_general:  { label: 'A. General targeting',    fields: ['category'], clientFilter: false },
  B_keyword:  { label: 'B. Keyword / explicit',   fields: ['category', 'destination', 'month', 'travelStyle'], clientFilter: false },
  C_agentbid: { label: 'C. AgentBid',             fields: PRESETS.balanced, clientFilter: true }
};

function runOne(persona, strat) {
  const intent = asIntent(persona);
  const egress = buildEgress(intent, strat.fields);
  const auction = runAuction(offers, egress.intent);
  const returned = [...auction.winners, ...auction.runnersUp].slice(0, RETURNED);
  const sponsoredIds = new Set(auction.winners.map(w => w.offer.id));

  let presented;
  let droppedByClient = 0;
  if (strat.clientFilter) {
    const scored = returned
      .map(r => ({ ...r, clientFit: +clientFit(r.offer, intent).toFixed(4) }))
      .sort((a, b) => b.clientFit - a.clientFit);
    const kept = scored.filter(r => r.clientFit >= CLIENT_FIT_FLOOR);
    droppedByClient = auction.winners.filter(w =>
      (scored.find(s => s.offer.id === w.offer.id)?.clientFit ?? 0) < CLIENT_FIT_FLOOR).length;
    presented = kept.slice(0, PRESENT);
  } else {
    presented = returned.slice(0, PRESENT);
  }

  const graded = presented.map(r => ({
    id: r.offer.id,
    sponsored: sponsoredIds.has(r.offer.id),
    trueFit: +trueFit(r.offer, persona).toFixed(4),
    hiddenReq: +hiddenRequirementCoverage(r.offer, persona).toFixed(4)
  }));

  return {
    bits: entropyReport(strat.fields, intent).bits,
    anonymitySet: entropyReport(strat.fields, intent).anonymitySetRegion,
    presentedCount: graded.length,
    top1: graded[0]?.trueFit ?? 0,
    top1Hidden: graded[0]?.hiddenReq ?? 0,
    top1Usable: (graded[0]?.trueFit ?? 0) > 0 ? 1 : 0,
    meanTrueFit: graded.length ? graded.reduce((s, g) => s + g.trueFit, 0) / graded.length : 0,
    irrelevant: graded.filter(g => g.trueFit < 0.5).length,
    unusable: graded.filter(g => g.trueFit === 0).length,
    slots: graded.length,
    auctionCandidates: auction.candidates,
    droppedByClient,
    sponsoredRevenueKRW: auction.winners.reduce((s, w) => s + w.clearingPriceKRW, 0)
  };
}

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const pct = x => +(x * 100).toFixed(1);

const summary = {};
for (const [key, strat] of Object.entries(STRATEGIES)) {
  const rows = personas.map(p => runOne(p, strat));
  const slots = rows.reduce((s, r) => s + r.slots, 0);
  summary[key] = {
    label: strat.label,
    bitsDisclosed: +mean(rows.map(r => r.bits)).toFixed(2),
    anonymitySet: Math.round(mean(rows.map(r => r.anonymitySet))),
    top1TrueFit: +mean(rows.map(r => r.top1)).toFixed(3),
    meanTrueFit: +mean(rows.map(r => r.meanTrueFit)).toFixed(3),
    top1UsablePct: pct(mean(rows.map(r => r.top1Usable))),
    fillRatePct: pct(mean(rows.map(r => r.slots / PRESENT))),
    irrelevantSharePct: pct(rows.reduce((s, r) => s + r.irrelevant, 0) / slots),
    unusableSharePct: pct(rows.reduce((s, r) => s + r.unusable, 0) / slots),
    eligibleCandidatesAvg: +mean(rows.map(r => r.auctionCandidates)).toFixed(1),
    paidSlotsDroppedPreClickAvg: +mean(rows.map(r => r.droppedByClient)).toFixed(2)
  };
}

// --- Disclosure sweep: relevance per bit -----------------------------------
const LEVELS = [
  { name: 'L0 category only',        fields: ['category'] },
  { name: 'L1 + destination',        fields: ['category', 'destination'] },
  { name: 'L2 + month, style',       fields: ['category', 'destination', 'month', 'travelStyle'] },
  { name: 'L3 + party, budget band', fields: PRESETS.balanced },
  { name: 'L4 + hard requirements',  fields: PRESETS.open },
  { name: 'L5 + exact budget',       fields: PRESETS.reckless }
];

// Two arms. `withAgent` lets the user's agent re-rank and filter the returned
// offers with private context; `serverOnly` trusts the marketplace ranking, as
// a conventional ad platform would. If the two diverge, client-side evaluation
// and data disclosure are substitutes — which is the architectural claim.
const sweep = LEVELS.map(level => {
  const a = personas.map(p => runOne(p, { fields: level.fields, clientFilter: true }));
  const b = personas.map(p => runOne(p, { fields: level.fields, clientFilter: false }));
  return {
    level: level.name,
    bits: +mean(a.map(r => r.bits)).toFixed(2),
    anonymitySet: Math.round(mean(a.map(r => r.anonymitySet))),
    top1WithAgent: +mean(a.map(r => r.top1)).toFixed(3),
    top1ServerOnly: +mean(b.map(r => r.top1)).toFixed(3),
    filledSlotsPct: pct(mean(a.map(r => r.slots / PRESENT)))
  };
});
for (let i = 1; i < sweep.length; i++) {
  const db = sweep[i].bits - sweep[i - 1].bits;
  sweep[i].marginalFitPerBit_withAgent = db > 0 ? +((sweep[i].top1WithAgent - sweep[i - 1].top1WithAgent) / db).toFixed(4) : null;
  sweep[i].marginalFitPerBit_serverOnly = db > 0 ? +((sweep[i].top1ServerOnly - sweep[i - 1].top1ServerOnly) / db).toFixed(4) : null;
}

const out = {
  meta: {
    generated: new Date().toISOString(),
    personas: personas.length,
    offers: offers.length,
    presentedSlots: PRESENT,
    returnedToClient: RETURNED,
    clientFitFloor: CLIENT_FIT_FLOOR,
    disclaimer: 'Synthetic data. Graded by an oracle utility function, not by observed human behaviour. Not a measurement of real CTR, CVR, CPA or incrementality.'
  },
  strategies: summary,
  disclosureSweep: sweep
};

writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2));

const md = [];
md.push('# Experiment results (synthetic)\n');
md.push(`> ${out.meta.personas} synthetic buyers · ${out.meta.offers} advertiser offers · ${PRESENT} slots shown · regenerate with \`node experiments/run.mjs\`\n`);
md.push('**' + out.meta.disclaimer + '**\n');
md.push('## 1. Strategy comparison\n');
md.push('| Strategy | Bits disclosed | Anonymity set | Top-1 true fit | Top-1 actually usable | Unusable offers shown | Paid slots dropped pre-click |');
md.push('|---|---:|---:|---:|---:|---:|---:|');
for (const s of Object.values(summary)) {
  md.push(`| ${s.label} | ${s.bitsDisclosed} | 1 in ${s.anonymitySet.toLocaleString('en-US')} | ${s.top1TrueFit} | ${s.top1UsablePct}% | ${s.unusableSharePct}% | ${s.paidSlotsDroppedPreClickAvg} |`);
}
md.push('\n## 2. Disclosure sweep — relevance per bit\n');
md.push('| Disclosure level | Bits | Anonymity set | Top-1 fit — agent re-ranks | Top-1 fit — marketplace ranks | Fit per extra bit (agent) |');
md.push('|---|---:|---:|---:|---:|---:|');
for (const s of sweep) {
  md.push(`| ${s.level} | ${s.bits} | 1 in ${s.anonymitySet.toLocaleString('en-US')} | ${s.top1WithAgent} | ${s.top1ServerOnly} | ${s.marginalFitPerBit_withAgent ?? '—'} |`);
}
md.push('\nReference point: about 33 bits uniquely identifies one person on Earth.\n');
const full = sweep[sweep.length - 1];
const maxAgent = Math.max(...sweep.map(s => s.top1WithAgent));
// The knee: the cheapest disclosure level that already buys 90% of everything
// disclosure can buy. Found, not assumed.
const knee = sweep.find(s => s.top1WithAgent >= 0.9 * maxAgent) || sweep[1];
md.push(`**Knee of the curve.** At ${knee.bits} bits the user's agent already reaches ` +
  `${knee.top1WithAgent} of the ${full.top1WithAgent} achievable at ${full.bits} bits ` +
  `(${pct(knee.top1WithAgent / full.top1WithAgent)}% of attainable relevance), while the anonymity-set ` +
  `estimate falls from 1 in ${knee.anonymitySet.toLocaleString('en-US')} to 1 in ${full.anonymitySet.toLocaleString('en-US')}. ` +
  `Where the agent does the final ranking, extra disclosure buys little; where the marketplace ranks ` +
  `alone it buys more. On this synthetic market the two are substitutes.\n`);

// Equivalence point: how much disclosure does a marketplace-only ranker need to
// match what the agent reaches at the knee?
const target = knee.top1WithAgent;
const eq = sweep.find(s => s.top1ServerOnly >= target);
if (eq) {
  md.push(`**Equivalence point.** A marketplace ranking alone does not reach ${target} until ` +
    `${eq.bits} bits are disclosed (${eq.level}, anonymity set 1 in ${eq.anonymitySet.toLocaleString('en-US')}). ` +
    `The user's agent reaches it at ${knee.bits} bits. On this synthetic market, moving the final ranking to ` +
    `the client is worth about ${+(eq.bits - knee.bits).toFixed(2)} bits of privacy at equal relevance.\n`);
  out.equivalence = { targetFit: target, agentBits: knee.bits, marketplaceBits: eq.bits, bitsSaved: +(eq.bits - knee.bits).toFixed(2), neverCatchesUp: false };
} else {
  md.push(`**Equivalence point: none.** A marketplace ranking alone never reaches ${target} on this market — ` +
    `not even at ${full.bits} bits, where the anonymity-set estimate is 1 in ${full.anonymitySet.toLocaleString('en-US')} ` +
    `and the buyer is effectively identified. It tops out at ${full.top1ServerOnly}. The user's agent reaches ` +
    `${target} at ${knee.bits} bits. Buying identity is not a substitute for letting the buyer's own agent decide.\n`);
  out.equivalence = { targetFit: target, agentBits: knee.bits, marketplaceBits: null, marketplaceBestFit: full.top1ServerOnly, marketplaceBestBits: full.bits, neverCatchesUp: true };
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2));
writeFileSync(new URL('./RESULTS.md', import.meta.url), md.join('\n'));

console.log(md.join('\n'));
