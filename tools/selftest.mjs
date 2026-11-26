// Invariant tests for the claims we make on stage. Run: npm test
import { readFileSync } from 'node:fs';
import { extractIntent } from '../engine/intent.js';
import { buildEgress, PRESETS, ALL_FIELDS } from '../engine/disclosure.js';
import { runAuction } from '../engine/auction.js';
import { clientFit, isEligible, serverFit, CLIENT_FIT_FLOOR } from '../engine/evaluate.js';

const offers = JSON.parse(readFileSync(new URL('../data/offers.json', import.meta.url)));
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? (pass++, console.log(`  ok   ${name}`)) : (fail++, console.log(`  FAIL ${name} ${extra}`)); };

const intent = extractIntent('12월에 일본 자유여행 2명, 예산 120만원, 환불 가능하고 도보 일정 선호');

console.log('\n1. the gateway cannot leak a field it was not granted');
for (let trial = 0; trial < 400; trial++) {
  const granted = ALL_FIELDS.filter(() => Math.random() < 0.5);
  const payload = buildEgress(intent, granted);
  const flat = JSON.stringify(payload);
  const grantedSet = new Set([...granted, 'category']);
  const leaks = [];
  if (!grantedSet.has('budgetExact') && flat.includes(String(intent.budgetKRW))) leaks.push('budgetExact');
  if (!grantedSet.has('destination') && /"destination"/.test(flat)) leaks.push('destination');
  if (!grantedSet.has('mustHave') && /"must_have"/.test(flat)) leaks.push('mustHave');
  if (!grantedSet.has('budgetBand') && /"budget_band"/.test(flat)) leaks.push('budgetBand');
  if (flat.includes(intent.raw)) leaks.push('rawPrompt');
  if (/latentTaste|historyTurns|rejected|dealbreak/.test(flat)) leaks.push('privateContext');
  if (leaks.length) { ok(`trial ${trial}`, false, leaks.join(',')); break; }
}
ok('400 randomised disclosure sets leaked nothing ungranted', fail === 0);

console.log('\n2. sessions are unlinkable by construction');
const ids = new Set(Array.from({ length: 2000 }, () => buildEgress(intent, PRESETS.balanced).session.id));
ok('2000 sessions produced 2000 distinct ids', ids.size === 2000, `got ${ids.size}`);
ok('no id embeds a user or device identifier', [...ids].every(i => /^abs_[a-z0-9]{18}$/.test(i)));

console.log('\n3. bids move paid slots and cannot move the independent ranking');
const disclosed = buildEgress(intent, PRESETS.balanced).intent;
const organicOf = os => os.filter(o => isEligible(o, disclosed))
  .map(o => ({ id: o.id, fit: clientFit(o, intent) }))
  .filter(x => x.fit >= CLIENT_FIT_FLOOR)
  .sort((a, b) => b.fit - a.fit || a.id.localeCompare(b.id)).slice(0, 3).map(x => x.id).join('|');

const baseOrganic = organicOf(offers);
const baseSponsored = runAuction(offers, disclosed).winners.map(w => w.offer.id).join('|');
let sponsoredMoved = 0, organicMoved = 0;
for (let t = 0; t < 200; t++) {
  const perturbed = offers.map(o => ({ ...o, maxCpcKRW: Math.max(120, Math.round(o.maxCpcKRW * (0.2 + Math.random() * 4))) }));
  if (runAuction(perturbed, disclosed).winners.map(w => w.offer.id).join('|') !== baseSponsored) sponsoredMoved++;
  if (organicOf(perturbed) !== baseOrganic) organicMoved++;
}
ok(`paid slots responded to bids (${sponsoredMoved}/200 perturbations changed them)`, sponsoredMoved > 50);
ok('independent ranking never moved under any bid perturbation', organicMoved === 0, `moved ${organicMoved}/200`);

console.log('\n4. the client is the last filter');
const over = offers.filter(o => o.priceKRW > intent.budgetKRW);
ok('every offer above the real budget scores 0 on the client', over.every(o => clientFit(o, intent) === 0), `${over.length} checked`);
const deal = offers.filter(o => o.features.includes('group_tour'));
ok('every offer containing an undisclosed dealbreaker scores 0', deal.every(o => clientFit(o, intent) === 0), `${deal.length} checked`);
ok('the marketplace can still rank those offers highly (it does not know)', deal.some(o => serverFit(o, disclosed) > 0.5));

console.log('\n5. second price never exceeds the bid');
const w = runAuction(offers, disclosed).winners;
ok('clearing price <= bid for every winner', w.every(x => x.clearingPriceKRW <= x.bid));

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
