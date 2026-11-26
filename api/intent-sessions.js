// POST /api/intent-sessions
// Registers an ephemeral intent session. Deliberately stateless in the
// prototype: it validates and echoes a TTL rather than storing a record,
// because a stored session is a join key waiting to happen.
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const id = body?.session?.id;
  if (!id || !/^abs_[a-z0-9]{10,}$/.test(id)) { res.status(400).json({ error: 'malformed session id' }); return; }
  res.setHeader('cache-control', 'no-store');
  res.status(201).json({
    session_id: id,
    expires_at: body.session.expires_at,
    accepted_fields: Object.keys(body.intent || {}),
    persisted: false
  });
}
