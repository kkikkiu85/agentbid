// AgentBid — intent extraction.
// A deterministic parser is the default so the demo never depends on a network
// call. `extractWithModel` is the seam where a confidential-inference provider
// (Nesa EE / HSS-EE) or any local LLM plugs in; the output contract is identical.

import { DESTINATIONS, MONTHS, STYLES, FEATURES } from './schema.js';

const DEST_WORDS = {
  JP: ['일본', 'japan', '도쿄', 'tokyo', '오사카', 'osaka', '교토', 'kyoto', '삿포로', 'sapporo'],
  TW: ['대만', '대만', '타이완', 'taiwan', '타이베이', 'taipei'],
  VN: ['베트남', 'vietnam', '다낭', 'danang', '하노이', 'hanoi'],
  TH: ['태국', 'thailand', '방콕', 'bangkok', '치앙마이', 'chiang mai'],
  ES: ['스페인', 'spain', '바르셀로나', 'barcelona', '마드리드', 'madrid'],
  IT: ['이탈리아', 'italy', '로마', 'rome', '피렌체', 'florence'],
  US: ['미국', 'usa', '뉴욕', 'new york', 'la', 'hawaii', '하와이']
};

const STYLE_WORDS = {
  independent: ['자유여행', '자유 여행', 'independent', '혼자', '알아서'],
  package: ['패키지', 'package', '단체'],
  luxury: ['호캉스', '럭셔리', 'luxury', '고급'],
  backpacker: ['배낭', 'backpack', '저렴', '가성비']
};

const FEATURE_WORDS = {
  refundable: ['환불', 'refund', '취소'],
  walkable_itinerary: ['도보', '걸어', 'walkable', '많이 걷'],
  late_checkout: ['레이트', 'late checkout', '늦게 체크아웃'],
  english_support: ['영어', 'english'],
  direct_flight: ['직항', 'direct flight', 'nonstop'],
  onsen: ['온천', 'onsen'],
  ski: ['스키', 'ski', '보드', 'snowboard'],
  kid_friendly: ['아이', '아기', '유아', 'kid', 'child'],
  vegetarian_option: ['채식', '비건', 'vegetarian', 'vegan'],
  private_transfer: ['픽업', '전용 차량', 'private transfer'],
  group_tour: ['단체 투어', 'group tour']
};

const MONTH_WORDS = { '2026-12': ['12월', 'december', 'dec'], '2027-01': ['1월', 'january', 'jan'], '2027-02': ['2월', 'february', 'feb'] };

function firstMatch(text, table, fallback) {
  const low = text.toLowerCase();
  for (const [key, words] of Object.entries(table)) {
    if (words.some(w => low.includes(w.toLowerCase()))) return key;
  }
  return fallback;
}

function parseBudget(text) {
  // "120만", "120만원", "1,200,000원", "150만 원"
  const man = text.match(/([0-9]{2,4})\s*만/);
  if (man) return parseInt(man[1], 10) * 10000;
  const won = text.match(/([0-9][0-9,]{5,})\s*원?/);
  if (won) return parseInt(won[1].replace(/,/g, ''), 10);
  return 1000000;
}

/**
 * Deterministic extraction. Returns the FULL intent object, which stays on the
 * client. Only `engine/disclosure.js` may derive an outbound payload from it.
 */
export function extractIntent(raw, opts = {}) {
  const partyMatch = raw.match(/([0-9])\s*(명|인|people|pax)/);
  const mustHave = Object.entries(FEATURE_WORDS)
    .filter(([k, ws]) => k !== 'group_tour' && ws.some(w => raw.toLowerCase().includes(w.toLowerCase())))
    .map(([k]) => k);

  return {
    raw,
    source: opts.source || 'local-deterministic-parser',
    category: 'travel',
    destination: firstMatch(raw, DEST_WORDS, 'JP'),
    month: firstMatch(raw, MONTH_WORDS, MONTHS[0]),
    travelStyle: firstMatch(raw, STYLE_WORDS, 'independent'),
    partySize: partyMatch ? parseInt(partyMatch[1], 10) : 2,
    budgetKRW: parseBudget(raw),
    mustHave,
    niceToHave: opts.niceToHave || [],
    dealbreakers: opts.dealbreakers || ['group_tour'],
    private: {
      historyTurns: opts.historyTurns ?? 34,
      rejected: opts.rejected || [],
      latentTaste: opts.latentTaste || {}
    }
  };
}

/**
 * Seam for confidential inference. A provider that can run this step without
 * seeing plaintext (Nesa EE) changes WHO can read the prompt; it does not
 * change what the gateway is allowed to disclose afterwards. The two layers
 * are independent, which is the whole point.
 */
export async function extractWithModel(raw, { endpoint, apiKey, fetchImpl = globalThis.fetch } = {}) {
  if (!endpoint) return extractIntent(raw, { source: 'local-deterministic-parser (no model configured)' });
  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ prompt: raw, schema: 'agentbid-intent@0.3' })
    });
    if (!res.ok) throw new Error('model ' + res.status);
    const json = await res.json();
    return { ...extractIntent(raw), ...json, source: 'confidential-inference endpoint' };
  } catch {
    return extractIntent(raw, { source: 'local-deterministic-parser (model unreachable, fell back)' });
  }
}
