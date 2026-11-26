// AgentBid — sponsored-slot auction.
// Generalised second price over (bid x blind relevance). The marketplace never
// sees private context, so this ranking is deliberately weaker than the
// client's. It decides PAID SLOTS ONLY and is kept out of the organic list.

import { SPONSORED_SLOTS } from './schema.js';
import { isEligible, serverFit } from './evaluate.js';

export const RESERVE_KRW = 120;

export function runAuction(offers, disclosed, { slots = SPONSORED_SLOTS } = {}) {
  const eligible = [];
  const rejected = [];

  for (const o of offers) {
    if (!isEligible(o, disclosed)) { rejected.push({ id: o.id, reason: 'targeting mismatch on disclosed fields' }); continue; }
    if ((o.dailyBudgetKRW ?? 0) < RESERVE_KRW) { rejected.push({ id: o.id, reason: 'budget exhausted' }); continue; }
    const fit = serverFit(o, disclosed);
    eligible.push({ offer: o, serverFit: +fit.toFixed(4), bid: o.maxCpcKRW, adRank: +(o.maxCpcKRW * fit).toFixed(2) });
  }

  eligible.sort((a, b) => b.adRank - a.adRank || a.offer.id.localeCompare(b.offer.id));

  const winners = eligible.slice(0, slots).map((e, i) => {
    const next = eligible[i + 1];
    const raw = next ? next.adRank / Math.max(e.serverFit, 1e-6) : RESERVE_KRW;
    const price = Math.max(RESERVE_KRW, Math.min(e.bid, Math.ceil(raw)));
    return { ...e, slot: i + 1, clearingPriceKRW: price, pricingRule: 'generalised second price (charged on human click only)' };
  });

  return {
    candidates: eligible.length,
    rejected,
    winners,
    runnersUp: eligible.slice(slots, slots + 4)
  };
}
