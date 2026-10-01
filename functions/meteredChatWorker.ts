// meteredChatWorker.ts — sandbox worker ops for the "Covenants++" metered AI chat.
// Guarded by WORKER_SECRET. Called only from the sandbox (the only Kaspa signer),
// never from the browser. Follows the adminUpdateDeployRequest precedent.
//
// Actions:
//  - register { secret, sessionId, covenantAddress, amountSompi, epochs, repliesPerEpoch, chainJson }
//      Sandbox built the per-customer sentinel-x402 chain → session becomes awaiting_fund.
//  - settle   { secret, sessionId, txId }  Check-in broadcast: treasury paid, bundle settled.
//  - abort    { secret, sessionId, reason } Mark refunded/abandoned.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// NEVER hardcode this value in a commit. Set METERED_WORKER_SECRET in the app's
// Secrets page; it is available here as an env var. The operator's sandbox exports
// the same value from a keys/ file when running worker/*.mjs.
const WORKER_SECRET = Deno.env.get('METERED_WORKER_SECRET') || '';
if (!WORKER_SECRET) throw new Error('METERED_WORKER_SECRET not set (app Secrets page)');

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const json = (obj: any, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: CORS });

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
  if (String(body?.secret || '') !== WORKER_SECRET) return json({ error: 'unauthorized' }, 401);

  const action = String(body?.action || '');
  try {
    const base44 = createClientFromRequest(req);
    const Sessions = base44.asServiceRole.entities.MeteredChatSession;

    const findSession = async (sessionId: string) => {
      const list = await Sessions.filter({ sessionId });
      return list && list.length ? list[0] : null;
    };

    if (action === 'register') {
      const { sessionId, covenantAddress, chainJson } = body;
      if (!sessionId || !covenantAddress || !chainJson) return json({ error: 'missing_fields' }, 400);
      const s = await findSession(sessionId);
      if (!s) return json({ error: 'session_not_found' }, 404);
      const epochs = Math.max(1, Number(body?.epochs || 1));
      const repliesPerEpoch = Math.max(1, Number(body?.repliesPerEpoch || 10));
      await Sessions.update(s.id, {
        status: 'awaiting_fund',
        covenantAddress: String(covenantAddress),
        amountSompi: String(body?.amountSompi || '0'),
        epochs, repliesPerEpoch,
        epochsRemaining: epochs,
        repliesRemaining: 0,
        chainJson: typeof chainJson === 'string' ? chainJson : JSON.stringify(chainJson),
      });
      return json({ ok: true, status: 'awaiting_fund', covenantAddress: String(covenantAddress) });
    }

    if (action === 'settle') {
      const s = await findSession(String(body?.sessionId || ''));
      if (!s) return json({ error: 'session_not_found' }, 404);
      // One on-chain check-in = one bundle consumed. Refill the in-bundle meter.
      const remaining = Math.max(0, Number(s.epochsRemaining ?? 0) - 1);
      const replies = remaining > 0 ? Number(s.repliesPerEpoch ?? 10) : 0;
      await Sessions.update(s.id, {
        epochsRemaining: remaining,
        repliesRemaining: replies,
        status: remaining > 0 ? 'live' : 'exhausted',
        lastSettleTx: String(body?.txId || ''),
      });
      return json({ ok: true, epochsRemaining: remaining, repliesRemaining: replies });
    }

    if (action === 'abort') {
      const s = await findSession(String(body?.sessionId || ''));
      if (!s) return json({ error: 'session_not_found' }, 404);
      await Sessions.update(s.id, { status: 'refunded' });
      return json({ ok: true, status: 'refunded', reason: String(body?.reason || '') });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
