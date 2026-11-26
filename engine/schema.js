// AgentBid — shared vocabulary, disclosure field catalog, entropy model.
// Pure ESM: runs unchanged in the browser and in Node.

export const FEATURES = [
  'refundable', 'walkable_itinerary', 'late_checkout', 'english_support',
  'direct_flight', 'onsen', 'ski', 'kid_friendly', 'vegetarian_option',
  'private_transfer', 'group_tour'
];

export const DESTINATIONS = ['JP', 'TW', 'VN', 'TH', 'ES', 'IT', 'US'];
export const MONTHS = ['2026-12', '2027-01', '2027-02'];
export const STYLES = ['independent', 'package', 'luxury', 'backpacker'];

export const BUDGET_BANDS = [
  { key: '<0.6M', min: 0, max: 600000 },
  { key: '0.6-1.0M', min: 600000, max: 1000000 },
  { key: '1.0-1.5M', min: 1000000, max: 1500000 },
  { key: '1.5-2.5M', min: 1500000, max: 2500000 },
  { key: '>2.5M', min: 2500000, max: Infinity }
];

export function bandOf(budgetKRW) {
  return (BUDGET_BANDS.find(b => budgetKRW >= b.min && budgetKRW < b.max) || BUDGET_BANDS[4]).key;
}

// ---------------------------------------------------------------------------
// Disclosure field catalog.
//
// `bits` is the information cost of revealing the field, measured as log2 of
// the number of distinguishable values. This is a deliberate simplification:
// it assumes a uniform prior over values and independence between fields. Real
// entropy would be lower for correlated fields (month + ski) and higher for
// rare values. We state this limitation rather than hide it.
// ---------------------------------------------------------------------------
export const FIELD_CATALOG = [
  { key: 'category',    label: 'Product category',      cardinality: 12, required: true,
    note: 'Minimum needed to route the request to any advertiser at all.' },
  { key: 'destination', label: 'Destination country',   cardinality: 40,
    note: 'Lets advertisers who do not sell this route drop out immediately.' },
  { key: 'month',       label: 'Travel month',          cardinality: 12,
    note: 'Seasonal inventory and pricing.' },
  { key: 'travelStyle', label: 'Travel style',          cardinality: 4,
    note: 'Independent vs package vs luxury vs backpacker.' },
  { key: 'partySize',   label: 'Party size',            cardinality: 6,
    note: 'Room configuration and per-person pricing.' },
  { key: 'budgetBand',  label: 'Budget band (coarse)',  cardinality: 5,
    note: 'A range, not a number. Advertisers can price without learning your ceiling.' },
  { key: 'mustHave',    label: 'Hard requirements',     cardinality: 32,
    note: 'e.g. refundable, walkable. High relevance value, and the most identifying field.' },
  { key: 'budgetExact', label: 'Exact budget',          cardinality: 100,
    note: 'Reveals your reservation price to every bidder. Rarely worth it.' }
];

export const FIELD_BITS = Object.fromEntries(
  FIELD_CATALOG.map(f => [f.key, Math.log2(f.cardinality)])
);

// Reference populations for the anonymity-set estimate.
export const POP_REGION = 50_000_000;   // Korea-scale
export const POP_WORLD  = 8_000_000_000; // ~2^33 — Narayanan's "33 bits" reference

export const SESSION_TTL_MS = 15 * 60 * 1000;
export const SPONSORED_SLOTS = 2;
export const CLIENT_FIT_FLOOR = 0.45; // below this the user's agent refuses to surface a paid offer
