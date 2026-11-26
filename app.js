// AgentBid — demo wiring. All scoring lives in /engine so the browser demo and
// the Node experiment run the identical code.
import { FIELD_CATALOG, SESSION_TTL_MS, bandOf, CLIENT_FIT_FLOOR } from './engine/schema.js';
import { extractIntent } from './engine/intent.js';
import { buildEgress, entropyReport, withheld, PRESETS, ALL_FIELDS } from './engine/disclosure.js';
import { runAuction } from './engine/auction.js';
import { clientFit, serverFit, isEligible } from './engine/evaluate.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const won = n => n.toLocaleString('en-US');

const EXAMPLES = [
  '12월에 일본 자유여행 가고 싶어. 2명이고 예산은 120만원 정도, 환불 가능하고 도보로 많이 걷는 일정이 좋아',
  '1월에 베트남 다낭 가성비로. 3명, 예산 80만원, 직항이면 좋겠고 채식 식당 정보도 필요해',
  '2월에 이탈리아 호캉스 위주로 2명, 예산 300만원. 전용 차량 픽업 꼭 있어야 해',
  '12월 태국 패키지 4명 예산 110만원, 아이 동반이라 아이 친화적이어야 하고 영어 지원 필요'
];

const state = {
  intent: null,
  granted: new Set(PRESETS.balanced),
  offers: [],
  bidOverrides: {},
  session: null,
  response: null,
  backend: 'unknown',
  log: [],
  ttlTimer: null,
  lastOrganicHash: null
};

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
(async function boot() {
  $('#prompt').value = EXAMPLES[0];
  $('#examples').innerHTML = EXAMPLES.map((e, i) =>
    `<button data-i="${i}">${esc(e.slice(0, 26))}…</button>`).join('');
  $('#examples').addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    $('#prompt').value = EXAMPLES[+b.dataset.i];
    doExtract();
  });

  state.offers = await fetch('./data/offers.json').then(r => r.json()).catch(() => []);
  renderFields();
  renderPresets();
  doExtract();
  loadChart();

  $('#btn-extract').addEventListener('click', doExtract);
  $('#btn-open').addEventListener('click', openSession);
  $('#btn-new').addEventListener('click', () => {
    const next = EXAMPLES[(EXAMPLES.indexOf($('#prompt').value) + 1 + EXAMPLES.length) % EXAMPLES.length];
    $('#prompt').value = next === $('#prompt').value ? EXAMPLES[1] : next;
    doExtract(); openSession();
    $('#pane-audit').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
})();

// ---------------------------------------------------------------------------
// 1 — intent
// ---------------------------------------------------------------------------
function doExtract() {
  const raw = $('#prompt').value.trim();
  if (!raw) return;
  state.intent = extractIntent(raw, { rejected: ['Orbit Holidays — JP Smart Saver 5D'] });
  const it = state.intent;
  $('#intent-source').textContent = `extracted by: ${it.source} · nothing in this panel has left the device`;
  $('#intent-kv').innerHTML = [
    ['category', it.category], ['destination', it.destination], ['month', it.month],
    ['travel_style', it.travelStyle], ['party_size', it.partySize],
    ['budget (exact)', won(it.budgetKRW) + ' KRW'],
    ['budget band', bandOf(it.budgetKRW)],
    ['must_have', it.mustHave.join(', ') || '—'],
    ['dealbreakers', it.dealbreakers.join(', ') || '—']
  ].map(([k, v]) => `<dt>${esc(k)}</dt><dd${/exact|dealbreak/.test(k) ? ' class="mint"' : ''}>${esc(v)}</dd>`).join('');
  $('#private-list').innerHTML = [
    `<b>${esc(raw.slice(0, 44))}…</b> — the original sentence, verbatim`,
    `<b>${it.private.historyTurns} turns</b> of conversation and long-term memory`,
    `<b>${won(it.budgetKRW)} KRW</b> exact reservation price, unless you tick it below`,
    `<b>${esc(it.private.rejected[0] || '—')}</b> previously rejected, so your agent will not resurface it`,
    `<b>no identifier</b> — no cookie, device ID or account is ever constructed`
  ].map(li => `<li>${li}</li>`).join('');
  refreshGate();
  resetSession();
}

// ---------------------------------------------------------------------------
// 2 — gateway
// ---------------------------------------------------------------------------
function renderPresets() {
  $('#presets').innerHTML = Object.keys(PRESETS)
    .map(k => `<button data-p="${k}" aria-pressed="false">${k}</button>`).join('');
  $('#presets').addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    state.granted = new Set(PRESETS[b.dataset.p]);
    renderFields(); refreshGate();
  });
}

function renderFields() {
  const tb = $('#fields-table tbody');
  tb.innerHTML = FIELD_CATALOG.map(f => {
    const on = f.required || state.granted.has(f.key);
    return `<tr class="${on ? 'on' : ''}${f.required ? ' locked' : ''}">
      <td><label><input type="checkbox" data-k="${f.key}" ${on ? 'checked' : ''} ${f.required ? 'disabled' : ''}></label></td>
      <td><span class="fname">${esc(f.label)}</span><span class="fnote">${esc(f.note)}</span></td>
      <td class="num">${(f.key === 'mustHave' ? (state.intent?.mustHave.length || 0) : Math.log2(f.cardinality)).toFixed(2)}</td>
    </tr>`;
  }).join('');
  tb.querySelectorAll('input').forEach(el => el.addEventListener('change', () => {
    el.checked ? state.granted.add(el.dataset.k) : state.granted.delete(el.dataset.k);
    renderFields(); refreshGate();
  }));
  for (const b of $('#presets').querySelectorAll('button')) {
    const want = PRESETS[b.dataset.p];
    const same = want.length === [...state.granted].filter(k => ALL_FIELDS.includes(k)).length
      && want.every(k => state.granted.has(k));
    b.setAttribute('aria-pressed', String(same));
  }
}

function refreshGate() {
  if (!state.intent) return;
  const granted = [...state.granted];
  const rep = entropyReport(granted, state.intent);
  const egress = buildEgress(state.intent, granted);

  $('#bits-readout').textContent = `${rep.bits.toFixed(2)} / 33 bits`;
  $('#bits-bar').style.width = Math.min(100, (rep.bits / 33) * 100) + '%';
  $('#anon-readout').textContent = rep.uniqueInRegion
    ? '1 in 1 — effectively unique'
    : `1 in ${won(rep.anonymitySetRegion)}`;

  const preview = { ...egress, session: { ...egress.session, id: egress.session.id.slice(0, 8) + '… (minted on send)' } };
  $('#egress-json').innerHTML = highlight(JSON.stringify(preview, null, 2));

  const w = withheld(state.intent, granted);
  $('#withheld-summary').textContent = `${w.length} items — ` + w.slice(0, 4).map(x => x.label.toLowerCase()).join(', ') + (w.length > 4 ? ', …' : '');
}

function highlight(json) {
  return esc(json)
    .replace(/&quot;([^&]*?)&quot;(\s*:)/g, '<span class="k">"$1"</span>$2')
    .replace(/:\s&quot;(.*?)&quot;/g, ': <span class="s">"$1"</span>')
    .replace(/:\s(-?\d[\d.]*)/g, ': <span class="n">$1</span>');
}

// ---------------------------------------------------------------------------
// 3 — marketplace
// ---------------------------------------------------------------------------
async function openSession() {
  if (!state.intent) return;
  const egress = buildEgress(state.intent, [...state.granted]);
  state.session = egress.session;
  state.bidOverrides = {};

  let data, via;
  try {
    const res = await fetch('./api/marketplace/match', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(egress)
    });
    if (!res.ok) throw new Error('status ' + res.status);
    data = await res.json(); via = 'POST /api/marketplace/match';
  } catch {
    data = matchLocally(egress); via = 'in-page simulation';
  }
  state.backend = via;
  state.response = data;

  const bytes = new TextEncoder().encode(JSON.stringify(egress)).length;
  pushLog(`<b>${egress.session.id}</b> opened · ${bytes} bytes sent · ${Object.keys(egress.intent).length} fields · via <em>${via}</em>`);

  setChip('#chip-session', egress.session.id.slice(0, 14) + '…', true);
  setChip('#chip-backend', via.includes('api') ? '/api (real request)' : 'in-page', true);
  startTtl();
  renderMarket();
  renderBidControls();
  renderResults();
}

/** Identical logic to api/marketplace/match.js — used when no server is present. */
function matchLocally(egress) {
  const offers = state.offers.map(o => ({ ...o, maxCpcKRW: state.bidOverrides[o.id] ?? o.maxCpcKRW }));
  const auction = runAuction(offers, egress.intent);
  const feed = offers.filter(o => isEligible(o, egress.intent))
    .map(o => ({ offer: o, serverFit: +serverFit(o, egress.intent).toFixed(4) }));
  return {
    session_id: egress.session.id,
    expires_at: egress.session.expires_at,
    sponsored: auction.winners,
    feed,                        // unpaid product feed — bids cannot reorder this
    rejected: auction.rejected.length,
    note: 'Sponsored slots are sold. The feed is not. The client ranks the feed itself.'
  };
}

function rerun() {
  const egress = { session: state.session, intent: buildEgress(state.intent, [...state.granted]).intent };
  state.response = matchLocally(egress);
  renderMarket(); renderResults();
}

function renderMarket() {
  const r = state.response; if (!r) return;
  const spon = r.sponsored;
  $('#market-status').innerHTML = `session <b style="font-family:var(--mono)">${esc(r.session_id)}</b> · `
    + `${r.feed.length} offers eligible on the disclosed fields · ${r.rejected} advertisers dropped out · `
    + `marketplace holds <b>no</b> user identifier`;

  const pool = [...spon, ...r.feed.filter(f => !spon.some(s => s.offer.id === f.offer.id))
    .map(f => ({ ...f, bid: f.offer.maxCpcKRW, adRank: +(f.offer.maxCpcKRW * f.serverFit).toFixed(2) }))]
    .sort((a, b) => b.adRank - a.adRank).slice(0, 7);

  $('#auction-table tbody').innerHTML = pool.map(p => {
    const winner = spon.find(s => s.offer.id === p.offer.id);
    return `<tr class="${winner ? 'win' : ''}">
      <td><span class="pname">${esc(p.offer.product)}</span><span class="padv">${esc(p.offer.advertiser)}${winner ? ` · slot ${winner.slot}` : ''}</span></td>
      <td class="num">${won(p.bid)}</td>
      <td class="num">${p.serverFit.toFixed(3)}</td>
      <td class="num">${won(Math.round(p.adRank))}</td>
      <td class="num">${winner ? won(winner.clearingPriceKRW) : '—'}</td>
    </tr>`;
  }).join('');
  $('#eligibility-note').textContent =
    'Charged on a human click only, at the generalised-second-price rate. A paid slot your agent refuses to surface is never billed.';
}

function renderBidControls() {
  const r = state.response; if (!r) return;
  const rows = r.feed.slice().sort((a, b) => b.serverFit - a.serverFit).slice(0, 5);
  $('#bid-controls').innerHTML = rows.map(f => {
    const cur = state.bidOverrides[f.offer.id] ?? f.offer.maxCpcKRW;
    return `<div class="bidrow">
      <div><div class="who"><b>${esc(f.offer.advertiser)}</b> · ${esc(f.offer.product)}</div>
      <input type="range" min="120" max="2000" step="10" value="${cur}" data-id="${f.offer.id}"></div>
      <div class="val" id="val-${f.offer.id}">${won(cur)} KRW</div>
    </div>`;
  }).join('');
  $('#bid-controls').querySelectorAll('input').forEach(el => el.addEventListener('input', () => {
    state.bidOverrides[el.dataset.id] = +el.value;
    $('#val-' + el.dataset.id).textContent = won(+el.value) + ' KRW';
    rerun();
  }));
}

// ---------------------------------------------------------------------------
// 4 — client-side decision
// ---------------------------------------------------------------------------
function renderResults() {
  const r = state.response; if (!r) return;
  const it = state.intent;

  const scored = r.feed.map(f => ({ ...f, fit: +clientFit(f.offer, it).toFixed(4) }));
  const organic = scored.filter(s => s.fit >= CLIENT_FIT_FLOOR).sort((a, b) => b.fit - a.fit).slice(0, 3);

  const sponsored = r.sponsored.map(w => ({ ...w, fit: +clientFit(w.offer, it).toFixed(4) }));
  const shownSponsored = sponsored.filter(s => s.fit >= CLIENT_FIT_FLOOR);
  const blocked = sponsored.filter(s => s.fit < CLIENT_FIT_FLOOR);

  const card = (x, i, isSpon) => {
    const o = x.offer;
    const hits = o.features.filter(f => it.mustHave.includes(f) || it.niceToHave.includes(f));
    const why = [];
    if (it.mustHave.length) why.push(`${hits.filter(h => it.mustHave.includes(h)).length}/${it.mustHave.length} hard requirements met`);
    why.push(`${won(it.budgetKRW - o.priceKRW)} KRW under your real budget`);
    if (o.styles.includes(it.travelStyle)) why.push(`matches ${it.travelStyle}`);
    return `<article class="card ${isSpon ? 'sponsored' : ''}">
      <span class="rank">${isSpon ? 'slot ' + x.slot : '#' + (i + 1)}</span>
      <div class="badges">${isSpon
        ? `<span class="tag amber">sponsored</span><span class="tag indigo">bid ${won(x.bid)} · pays ${won(x.clearingPriceKRW)}</span>`
        : `<span class="tag mint">independent</span>`}</div>
      <h4>${esc(o.product)}</h4>
      <div class="adv">${esc(o.advertiser)}</div>
      <div class="price">${won(o.priceKRW)} KRW</div>
      <div class="feats">${o.features.map(f => `<span class="${hits.includes(f) ? 'hit' : ''}">${esc(f)}</span>`).join('')}</div>
      <p class="why">${esc(why.join(' · '))}</p>
      <div class="bar"><i style="width:${Math.round(x.fit * 100)}%"></i></div>
      <p class="hint">private fit ${x.fit.toFixed(3)} — computed on your device from context the advertiser never saw</p>
    </article>`;
  };

  $('#offers').innerHTML =
    `<div style="grid-column:1/-1"><h3 style="margin-top:0">Paid placement <span class="tag amber">advertisers bought these slots</span></h3></div>`
    + (shownSponsored.length ? shownSponsored.map((x, i) => card(x, i, true)).join('')
       : `<p class="hint" style="grid-column:1/-1">Both paid slots were refused by your agent on this request.</p>`)
    + `<div style="grid-column:1/-1"><h3>Independent ranking <span class="tag mint">bids cannot move this list</span></h3></div>`
    + organic.map((x, i) => card(x, i, false)).join('');

  const organicHash = hash(organic.map(o => o.offer.id).join('|'));
  const sponsoredHash = hash(sponsored.map(o => o.offer.id + ':' + o.clearingPriceKRW).join('|'));
  const changed = state.lastOrganicHash && state.lastOrganicHash !== organicHash;
  state.lastOrganicHash = organicHash;
  $('#organic-hash').textContent = organicHash;
  $('#organic-hash').style.color = changed ? 'var(--red)' : 'var(--mint)';
  $('#sponsored-hash').textContent = sponsoredHash;
  $('#sponsored-hash').style.color = 'var(--amber)';

  $('#dropped').innerHTML = `<h3>Refused by your agent <small>paid, eligible, and still not shown</small></h3>`
    + (blocked.length
      ? `<ul>${blocked.map(b => `<li><b>${esc(b.offer.advertiser)} — ${esc(b.offer.product)}</b>: private fit ${b.fit.toFixed(3)} is below your floor of ${CLIENT_FIT_FLOOR}. `
        + `${b.offer.priceKRW > it.budgetKRW ? 'Over your real budget, which the marketplace never received. ' : ''}`
        + `${(it.dealbreakers || []).some(d => b.offer.features.includes(d)) ? 'Contains a dealbreaker you never disclosed. ' : ''}`
        + `Not rendered, not clicked, not billed.</li>`).join('')}</ul>`
      : `<p class="hint">Nothing refused on this request — every paid slot also cleared your private floor.</p>`);
}

function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 8);
}

// ---------------------------------------------------------------------------
// session lifecycle + audit
// ---------------------------------------------------------------------------
function setChip(sel, text, live) {
  const el = $(sel); el.querySelector('.v').textContent = text;
  el.classList.toggle('live', !!live); el.classList.toggle('dead', !live);
}
function resetSession() {
  clearInterval(state.ttlTimer); state.session = null; state.response = null; state.lastOrganicHash = null;
  setChip('#chip-session', 'none', false); setChip('#chip-ttl', '—', false); setChip('#chip-backend', '—', false);
  $('#market-status').textContent = 'Waiting for a consented intent.';
  $('#auction-table tbody').innerHTML = '<tr class="empty"><td colspan="5">—</td></tr>';
  $('#bid-controls').innerHTML = ''; $('#offers').innerHTML = ''; $('#dropped').innerHTML = '';
  $('#organic-hash').textContent = '—'; $('#sponsored-hash').textContent = '—';
}
function startTtl() {
  clearInterval(state.ttlTimer);
  const end = Date.parse(state.session.expires_at);
  const tick = () => {
    const left = end - Date.now();
    if (left <= 0) {
      setChip('#chip-ttl', 'expired', false);
      pushLog(`<b>${state.session.id}</b> expired — ephemeral data discarded`);
      clearInterval(state.ttlTimer); return;
    }
    const m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
    setChip('#chip-ttl', `${m}m ${String(s).padStart(2, '0')}s`, true);
  };
  tick(); state.ttlTimer = setInterval(tick, 1000);
}
function pushLog(html) {
  state.log.unshift(html);
  $('#egress-log').innerHTML = state.log.slice(0, 8).map(l => `<li>${l}</li>`).join('');
}

// ---------------------------------------------------------------------------
// frontier chart
// ---------------------------------------------------------------------------
async function loadChart() {
  let d; try { d = await fetch('./experiments/results.json').then(r => r.json()); } catch { return; }
  const pts = d.disclosureSweep;
  const W = 480, H = 230, P = { l: 38, r: 12, t: 14, b: 34 };
  const xs = pts.map(p => p.bits), maxX = Math.max(...xs, 33);
  const x = v => P.l + (v / maxX) * (W - P.l - P.r);
  const y = v => H - P.b - v * (H - P.t - P.b);
  const line = key => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.bits).toFixed(1)},${y(p[key]).toFixed(1)}`).join('');
  const dots = (key, col) => pts.map(p => `<circle cx="${x(p.bits).toFixed(1)}" cy="${y(p[key]).toFixed(1)}" r="3" fill="${col}"/>`).join('');

  $('#chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Relevance against bits disclosed">
    ${[0, .25, .5, .75, 1].map(g => `<line x1="${P.l}" y1="${y(g)}" x2="${W - P.r}" y2="${y(g)}" stroke="#1a2027"/>
      <text x="${P.l - 7}" y="${y(g) + 3.5}" fill="#68727f" font-size="9" text-anchor="end" font-family="ui-monospace">${g.toFixed(2)}</text>`).join('')}
    <line x1="${x(33)}" y1="${P.t}" x2="${x(33)}" y2="${H - P.b}" stroke="#f4766c" stroke-dasharray="3 3" opacity=".7"/>
    <text x="${x(33) - 4}" y="${P.t + 9}" fill="#f4766c" font-size="9" text-anchor="end" font-family="ui-monospace">33 bits = unique person</text>
    <path d="${line('top1WithAgent')}" fill="none" stroke="#5eead4" stroke-width="2"/>
    <path d="${line('top1ServerOnly')}" fill="none" stroke="#f5b544" stroke-width="2" stroke-dasharray="5 3"/>
    ${dots('top1WithAgent', '#5eead4')}${dots('top1ServerOnly', '#f5b544')}
    ${pts.map(p => `<text x="${x(p.bits)}" y="${H - 18}" fill="#68727f" font-size="8.5" text-anchor="middle" font-family="ui-monospace">${p.bits}</text>`).join('')}
    <text x="${(W) / 2}" y="${H - 4}" fill="#68727f" font-size="9" text-anchor="middle">bits of personal information disclosed to advertisers</text>
    <g font-size="9" font-family="ui-monospace">
      <rect x="${P.l + 6}" y="${P.t}" width="9" height="2.5" fill="#5eead4"/><text x="${P.l + 20}" y="${P.t + 4}" fill="#9aa5b4">your agent ranks</text>
      <rect x="${P.l + 6}" y="${P.t + 13}" width="9" height="2.5" fill="#f5b544"/><text x="${P.l + 20}" y="${P.t + 17}" fill="#9aa5b4">marketplace ranks</text>
    </g>
  </svg>`;

  const e = d.equivalence;
  if (!e) return;
  $('#chart-note').innerHTML = e.neverCatchesUp
    ? `Your agent reaches a match quality of <b style="color:var(--mint)">${e.targetFit}</b> at <b style="color:var(--mint)">${e.agentBits} bits</b>. `
      + `A marketplace ranking alone never gets there — at <b style="color:var(--amber)">${e.marketplaceBestBits} bits</b>, `
      + `where the buyer is effectively identified, it still tops out at <b style="color:var(--amber)">${e.marketplaceBestFit}</b>. `
      + `On this synthetic market, buying identity is not a substitute for letting the buyer's own agent decide.`
    : `Same match quality (${e.targetFit}): your agent needs <b style="color:var(--mint)">${e.agentBits} bits</b>, `
      + `a marketplace ranking alone needs <b style="color:var(--amber)">${e.marketplaceBits} bits</b> — `
      + `<b>${e.bitsSaved} bits</b> of privacy bought by moving the final ranking to the client.`;
}
