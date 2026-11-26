// POST /api/marketplace/match
//
// The marketplace side. It receives ONLY the consented payload the gateway
// built; there is no cookie, no header-based identity and nothing persisted.
// Note what is absent: no user table, no profile lookup, no join key.
import { OFFERS } from '../_catalog.js';
import { runAuction } from '../../engine/auction.js';
import { isEligible, serverFit } from '../../engine/evaluate.js';

const ALLOWED = new Set(['category', 'destination', 'month', 'travel_style', 'party_size', 'budget_band', 'must_have', 'budget_krw']);

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body?.intent || !body?.session?.id) { res.status(400).json({ error: 'expected { session, intent }' }); return; }

  // Server-side re-validation: an unexpected field is rejected, not ignored.
  const unexpected = Object.keys(body.intent).filter(k => !ALLOWED.has(k));
  if (unexpected.length) { res.status(422).json({ error: 'field not permitted in an intent payload', unexpected }); return; }

  if (Date.parse(body.session.expires_at) < Date.now()) { res.status(410).json({ error: 'session expired' }); return; }

  const disclosed = body.intent;
  const auction = runAuction(OFFERS, disclosed);
  const feed = OFFERS.filter(o => isEligible(o, disclosed))
    .map(o => ({ offer: o, serverFit: +serverFit(o, disclosed).toFixed(4) }));

  res.setHeader('cache-control', 'no-store');
  res.status(200).json({
    session_id: body.session.id,
    expires_at: body.session.expires_at,
    sponsored: auction.winners,
    feed,
    rejected: auction.rejected.length,
    note: 'Sponsored slots are sold. The feed is not. The client ranks the feed itself.',
    retained_by_marketplace: 'nothing — this handler holds no state between requests'
  });
}
