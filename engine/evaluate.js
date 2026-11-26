// AgentBid — the three scoring functions, and the reason there are three.
//
//   serverFit : what the MARKETPLACE can compute. Disclosed fields only.
//   clientFit : what the USER'S AGENT computes. Full private context.
//   trueFit   : the ORACLE. Includes latent taste the agent never learns.
//
// We rank with clientFit and grade with trueFit, so the system is never
// scored by the same function it optimises. That is the difference between an
// experiment and a circular argument.

import { BUDGET_BANDS, CLIENT_FIT_FLOOR } from './schema.js';

const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

function coverage(need, have) {
  if (!need || need.length === 0) return 1;
  return need.filter(f => have.includes(f)).length / need.length;
}

/** Hard contradictions visible from the DISCLOSED payload only. */
export function isEligible(offer, disclosed) {
  if (disclosed.category && offer.category !== disclosed.category) return false;
  if (disclosed.destination && !offer.destinations.includes(disclosed.destination)) return false;
  if (disclosed.month && !offer.months.includes(disclosed.month)) return false;
  if (disclosed.travel_style && !offer.styles.includes(disclosed.travel_style)) return false;
  if (disclosed.party_size != null &&
      (disclosed.party_size < offer.partyMin || disclosed.party_size > offer.partyMax)) return false;
  if (disclosed.budget_band) {
    const band = BUDGET_BANDS.find(b => b.key === disclosed.budget_band);
    if (band && offer.priceKRW > band.max) return false;
  }
  if (disclosed.budget_krw != null && offer.priceKRW > disclosed.budget_krw) return false;
  return true;
}

/** Blind relevance. Anything undisclosed contributes a neutral 0.5. */
export function serverFit(offer, disclosed) {
  const must = disclosed.must_have ? coverage(disclosed.must_have, offer.features) : 0.5;
  let headroom = 0.5;
  if (disclosed.budget_krw != null) {
    headroom = clamp((disclosed.budget_krw - offer.priceKRW) / (0.30 * disclosed.budget_krw));
  } else if (disclosed.budget_band) {
    const band = BUDGET_BANDS.find(b => b.key === disclosed.budget_band);
    if (band && Number.isFinite(band.max)) headroom = clamp((band.max - offer.priceKRW) / (0.30 * band.max));
  }
  const breadth = clamp(offer.features.length / 8);
  const styleFit = disclosed.travel_style
    ? (offer.styles.includes(disclosed.travel_style) ? 1 : 0.4)
    : 0.5;
  return clamp(0.38 * must + 0.27 * headroom + 0.17 * breadth + 0.18 * styleFit, 0.01, 1);
}

/** Private relevance, computed on the user's side. Never sent anywhere. */
export function clientFit(offer, intent) {
  if (!offer.destinations.includes(intent.destination)) return 0;
  if (!offer.months.includes(intent.month)) return 0;
  if (intent.partySize < offer.partyMin || intent.partySize > offer.partyMax) return 0;
  if (offer.priceKRW > intent.budgetKRW) return 0;
  if ((intent.dealbreakers || []).some(d => offer.features.includes(d))) return 0;

  const must = coverage(intent.mustHave, offer.features);
  const nice = coverage(intent.niceToHave, offer.features);
  const headroom = clamp((intent.budgetKRW - offer.priceKRW) / (0.30 * intent.budgetKRW));
  const breadth = clamp(offer.features.length / 8);
  const styleFit = offer.styles.includes(intent.travelStyle) ? 1 : 0.4;
  // latent taste is unreadable from here, so it enters as a neutral 0.5
  return clamp(0.34 * must + 0.14 * nice + 0.15 * headroom + 0.08 * breadth + 0.14 * styleFit + 0.15 * 0.5);
}

/** Oracle. Only the evaluation harness may call this. */
export function trueFit(offer, persona) {
  if (!offer.destinations.includes(persona.destination)) return 0;
  if (!offer.months.includes(persona.month)) return 0;
  if (persona.partySize < offer.partyMin || persona.partySize > offer.partyMax) return 0;
  if (offer.priceKRW > persona.budgetKRW) return 0;
  if ((persona.dealbreakers || []).some(d => offer.features.includes(d))) return 0;

  const must = coverage(persona.mustHave, offer.features);
  const nice = coverage(persona.niceToHave, offer.features);
  const headroom = clamp((persona.budgetKRW - offer.priceKRW) / (0.30 * persona.budgetKRW));
  const breadth = clamp(offer.features.length / 8);

  const styleFit = offer.styles.includes(persona.travelStyle) ? 1 : 0.4;

  const taste = persona.latentTaste || {};
  const keys = Object.keys(taste);
  let acc = 0;
  for (const tag of keys) if (offer.features.includes(tag)) acc += taste[tag];
  const latent = keys.length ? clamp(0.5 + acc) : 0.5;

  return clamp(0.34 * must + 0.14 * nice + 0.15 * headroom + 0.08 * breadth + 0.14 * styleFit + 0.15 * latent);
}

/** Share of the persona's hidden hard requirements an offer actually meets. */
export function hiddenRequirementCoverage(offer, persona) {
  return coverage(persona.mustHave, offer.features);
}

export { CLIENT_FIT_FLOOR, clamp };
