// meteredChat.ts — public API for the "Covenants++" metered AI chat.
// Same request/response contract as the Base44 function (functions/meteredChat.ts),
// but backed by the local encrypted session store.
//
// Actions: init / status / funded / reply

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { createSession, findLatestByAddress, findSession, updateSession } from '../db';
import { PERSONA, REST, networkOf } from '../persona';
import { invokeLLM } from '../llm';

export const meteredChat = Router();

const ok = (res: Response, obj: unknown, status = 200) => res.status(status).json(obj);

meteredChat.post('/', async (req: Request, res: Response) => {
  const body: any = req.body || {};
  const action = String(body?.action || '');

  try {
    if (action === 'init') {
      const address = String(body?.address || '').trim();
      const network = networkOf(address);
      if (!network) return ok(res, { error: 'connect your Scorpion wallet first (kaspa: or kaspatest: address)' }, 400);

      // Silent session restore: reuse the newest session for this address if one exists.
      const existing = findLatestByAddress(address);
      if (existing) {
        return ok(res, {
          ok: true, sessionId: existing.sessionId, status: existing.status,
          network: existing.network || network, covenantAddress: existing.covenantAddress || null,
          amountSompi: existing.amountSompi || null, epochs: existing.epochs || 0,
          repliesPerEpoch: existing.repliesPerEpoch || 0, repliesRemaining: existing.repliesRemaining || 0,
          epochsRemaining: existing.epochsRemaining || 0, restored: true,
        });
      }

      const sessionId = 'mc_' + randomUUID().replace(/-/g, '').slice(0, 18);
      createSession({ sessionId, address, network, status: 'awaiting_covenant' });
      return ok(res, { ok: true, sessionId, status: 'awaiting_covenant', network, restored: false });
    }

    if (action === 'status') {
      const s = findSession(String(body?.sessionId || ''));
      if (!s) return ok(res, { error: 'session not found' }, 404);
      return ok(res, {
        ok: true, sessionId: s.sessionId, status: s.status,
        network: s.network || networkOf(s.address) || 'mainnet',
        covenantAddress: s.covenantAddress || null, amountSompi: s.amountSompi || null,
        epochs: s.epochs || 0, repliesPerEpoch: s.repliesPerEpoch || 0,
        repliesRemaining: s.repliesRemaining || 0, epochsRemaining: s.epochsRemaining || 0,
        fundingTxId: s.fundingTxId || null,
      });
    }

    if (action === 'funded') {
      const sessionId = String(body?.sessionId || '');
      const fundingTxId = String(body?.fundingTxId || '');
      const s = findSession(sessionId);
      if (!s) return ok(res, { error: 'session not found' }, 404);
      if (s.status !== 'awaiting_fund') return ok(res, { error: 'session not awaiting funding', status: s.status }, 409);

      const network = (s.network || networkOf(s.address) || 'mainnet') as 'mainnet' | 'testnet';
      const restBase = REST[network];

      // Verify on L1: tx exists and carries an output of the quoted amount to the covenant.
      let verified = false;
      try {
        const r = await fetch(`${restBase}/transactions/${fundingTxId}`);
        if (r.ok) {
          const tx: any = await r.json();
          const outputs = tx?.transaction?.outputs || [];
          verified = outputs.some((o: any) => String(o.amount || '') === String(s.amountSompi || ''));
        }
      } catch { /* indexer unreachable — record txId for later audit */ }

      const replies = Number(s.repliesPerEpoch || 0);
      const epochs = Number(s.epochs || 0);
      updateSession(s.sessionId, {
        status: 'live', fundingTxId,
        repliesRemaining: replies,                 // first bundle activates on funding
        epochsRemaining: Math.max(0, epochs - 1),  // still locked as future hops
      });
      return ok(res, {
        ok: true, verified, status: 'live',
        repliesRemaining: replies, epochsRemaining: Math.max(0, epochs - 1),
      });
    }

    if (action === 'reply') {
      const sessionId = String(body?.sessionId || '');
      const message = String(body?.message || '').trim().slice(0, 2000);
      if (!message) return ok(res, { error: 'missing message' }, 400);
      const s = findSession(sessionId);
      if (!s) return ok(res, { error: 'session not found' }, 404);
      if (s.status !== 'live') return ok(res, { error: 'session not live', status: s.status }, 409);
      const remaining = Number(s.repliesRemaining || 0);
      const epochsRemaining = Number(s.epochsRemaining || 0);
      if (remaining <= 0) {
        return ok(res, { error: 'bundle exhausted', needsCheckin: true, epochsRemaining }, 402);
      }

      let history: any[] = [];
      try { history = JSON.parse(s.history || '[]'); } catch { /* corrupt history — start fresh */ }
      history.push({ role: 'user', content: message });
      const convo = history.slice(-7)
        .map((t) => `${t.role === 'user' ? 'User' : 'You'}: ${t.content}`).join('\n');

      let replyText = '';
      try {
        replyText = (await invokeLLM(
          `${PERSONA}\n\nConversation so far:\n${convo}\n\nReply to the user's latest message.`,
        )).trim();
      } catch (e: any) {
        // LLM hiccup = credit preserved (only successful replies consume credit)
        return ok(res, {
          ok: true,
          reply: `The AI brain hiccuped (${String(e?.message || e).slice(0, 80)}). No credit consumed — try again.`,
          creditConsumed: false, repliesRemaining: remaining, epochsRemaining,
        });
      }
      if (!replyText) replyText = '(empty reply — credit preserved)';

      history.push({ role: 'assistant', content: replyText });
      const newRemaining = remaining - 1;
      updateSession(s.sessionId, {
        repliesRemaining: newRemaining,
        history: JSON.stringify(history.slice(-20)),
        status: newRemaining === 0 && epochsRemaining <= 0 ? 'exhausted' : 'live',
      });
      return ok(res, {
        ok: true, reply: replyText, creditConsumed: true,
        repliesRemaining: newRemaining, epochsRemaining,
        needsCheckin: newRemaining === 0 && epochsRemaining > 0,
      });
    }

    return ok(res, { error: 'unknown action' }, 400);
  } catch (e: any) {
    return ok(res, { error: String(e?.message || e) }, 500);
  }
});
