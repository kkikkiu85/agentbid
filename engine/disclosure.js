// AgentBid — Privacy Gateway.
// The only module allowed to construct an outbound marketplace request.
// Everything it does not explicitly copy, never leaves the client.

import { FIELD_CATALOG, FIELD_BITS, POP_REGION, POP_WORLD, SESSION_TTL_MS, bandOf } from './schema.js';

export const ALL_FIELDS = FIELD_CATALOG.map(f => f.key);

export const PRESETS = {
  minimal:  ['category', 'destination'],
  balanced: ['category', 'destination', 'month', 'travelStyle', 'partySize', 'budgetBand'],
  open:     ['category', 'destination', 'month', 'travelStyle', 'partySize', 'budgetBand', 'mustHave'],
  reckless: ALL_FIELDS
};

function randomId(len = 18) {
  const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  const bytes = (typeof crypto !== 'undefined' && crypto.getRandomValues)
    ? crypto.getRandomValues(new Uint8Array(len))
    : Array.from({ length: len }, () => Math.floor(Math.random() * 256));
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/**
 * Build the outbound payload. Strict allow-list: a field absent from
 * `granted` is not coarsened, not hashed, not nulled — it is simply not
 * constructed. There is no code path that serialises `intent.private`.
 */
export function buildEgress(intent, granted, now = Date.now()) {
  const allow = new Set(granted.filter(k => ALL_FIELDS.includes(k)));
  allow.add('category'); // routing minimum

  const disclosed = {};
  if (allow.has('category'))    disclosed.category = intent.category;
  if (allow.has('destination')) disclosed.destination = intent.destination;
  if (allow.has('month'))       disclosed.month = intent.month;
  if (allow.has('travelStyle')) disclosed.travel_style = intent.travelStyle;
  if (allow.has('partySize'))   disclosed.party_size = intent.partySize;
  if (allow.has('budgetBand'))  disclosed.budget_band = bandOf(intent.budgetKRW);
  if (allow.has('mustHave'))    disclosed.must_have = [...intent.mustHave];
  if (allow.has('budgetExact')) disclosed.budget_krw = intent.budgetKRW;

  return {
    session: {
      id: 'abs_' + randomId(),         // fresh per request, never reused
      issued_at: new Date(now).toISOString(),
      expires_at: new Date(now + SESSION_TTL_MS).toISOString(),
      ttl_ms: SESSION_TTL_MS
    },
    intent: disclosed,
    protocol: { name: 'agentbid-intent', version: '0.3', adcp_profile: 'context-match-only' }
  };
}

/** Fields the client is holding back on this request. */
export function withheld(intent, granted) {
  const allow = new Set([...granted, 'category']);
  const out = [];
  for (const f of FIELD_CATALOG) {
    if (allow.has(f.key)) continue;
    out.push({ key: f.key, label: f.label, value: previewValue(intent, f.key) });
  }
  out.push({ key: 'rawPrompt', label: 'Original prompt text', value: intent.raw });
  out.push({ key: 'history', label: 'Conversation + long-term memory', value: `${intent.private.historyTurns} turns retained locally` });
  out.push({ key: 'rejected', label: 'Previously rejected options', value: intent.private.rejected.join(', ') || '—' });
  out.push({ key: 'identity', label: 'Any stable user or device identifier', value: 'never constructed' });
  return out;
}

function previewValue(intent, key) {
  switch (key) {
    case 'destination': return intent.destination;
    case 'month': return intent.month;
    case 'travelStyle': return intent.travelStyle;
    case 'partySize': return String(intent.partySize);
    case 'budgetBand': return bandOf(intent.budgetKRW);
    case 'mustHave': return intent.mustHave.join(', ') || '—';
    case 'budgetExact': return intent.budgetKRW.toLocaleString('ko-KR') + ' KRW';
    default: return '—';
  }
}

/**
 * Information cost of a disclosure set, in bits, plus the resulting
 * anonymity-set estimate. This is an *estimate under a uniform prior*, not a
 * k-anonymity proof over an observed population.
 */
export function entropyReport(granted, intent) {
  const allow = new Set([...granted, 'category']);
  let bits = 0;
  const parts = [];
  for (const f of FIELD_CATALOG) {
    if (!allow.has(f.key)) continue;
    let b = FIELD_BITS[f.key];
    if (f.key === 'mustHave') b = Math.max(0, intent.mustHave.length) * 1.0; // 1 bit per revealed requirement
    bits += b;
    parts.push({ key: f.key, label: f.label, bits: +b.toFixed(2) });
  }
  const anonRegion = Math.max(1, POP_REGION / Math.pow(2, bits));
  return {
    bits: +bits.toFixed(2),
    parts,
    budgetOfUniqueness: +Math.log2(POP_WORLD).toFixed(1),  // ~33
    anonymitySetRegion: Math.round(anonRegion),
    uniqueInRegion: anonRegion <= 1.0
  };
}
