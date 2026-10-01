// meteredChatWorker.ts — operator/worker ops for the "Covenants++" metered AI chat.
// Secret-guarded; never called from the browser.
//
// Actions: register / settle / abort

import { Router, type Request, type Response } from 'express';
import { findSession, updateSession } from '../db';

export const meteredChatWorker = Router();

const WORKER_SECRET = process.env.WORKER_SECRET || '';
const ok = (res: Response, obj: unknown, status = 200) => res.status(status).json(obj);

meteredChatWorker.post('/', (req: Request, res: Response) => {
  const body: any = req.body || {};
  if (String(body?.secret || '') !== WORKER_SECRET) return ok(res, { error: 'unauthorized' }, 401);

  const action = String(body?.action || '');
  try {
    if (action === 'register') {
      const { sessionId, covenantAddress, chainJson } = body;
      if (!sessionId || !covenantAddress || !chainJson) return ok(res, { error: 'missing_fields' }, 400);
      const s = findSession(sessionId);
      if (!s) return ok(res, { error: 'session_not_found' }, 404);
      const epochs = Math.max(1, Number(body?.epochs || 1));
      const repliesPerEpoch = Math.max(1, Number(body?.repliesPerEpoch || 10));
      updateSession(s.sessionId, {
        status: 'awaiting_fund',
        covenantAddress: String(covenantAddress),
        amountSompi: String(body?.amountSompi || '0'),
        epochs, repliesPerEpoch,
        epochsRemaining: epochs,
        repliesRemaining: 0,
        chainJson: typeof chainJson === 'string' ? chainJson : JSON.stringify(chainJson),
      });
      return ok(res, { ok: true, status: 'awaiting_fund', covenantAddress: String(covenantAddress) });
    }

    if (action === 'settle') {
      const s = findSession(String(body?.sessionId || ''));
      if (!s) return ok(res, { error: 'session_not_found' }, 404);
      // One on-chain check-in = one bundle consumed. Refill the in-bundle meter.
      const remaining = Math.max(0, Number(s.epochsRemaining ?? 0) - 1);
      const replies = remaining > 0 ? Number(s.repliesPerEpoch ?? 10) : 0;
      updateSession(s.sessionId, {
        epochsRemaining: remaining,
        repliesRemaining: replies,
        status: remaining > 0 ? 'live' : 'exhausted',
        lastSettleTx: String(body?.txId || ''),
      });
      return ok(res, { ok: true, epochsRemaining: remaining, repliesRemaining: replies });
    }

    if (action === 'abort') {
      const s = findSession(String(body?.sessionId || ''));
      if (!s) return ok(res, { error: 'session_not_found' }, 404);
      updateSession(s.sessionId, { status: 'refunded' });
      return ok(res, { ok: true, status: 'refunded', reason: String(body?.reason || '') });
    }

    return ok(res, { error: 'unknown_action' }, 400);
  } catch (e: any) {
    return ok(res, { error: String(e?.message || e) }, 500);
  }
});
