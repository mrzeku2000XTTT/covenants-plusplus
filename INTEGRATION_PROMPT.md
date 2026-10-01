# Covenants++ Integration Prompt

Hand this prompt to any app's AI builder agent to run Covenants++ in its own app
(your own LLM, this repo's metering and covenant logic). Version: 2026-10-01 (rev2: SDK-first wiring, worker-URL notes).

---

You are integrating "Covenants++" — Kaspa metered AI chat where every reply bundle is
prepaid on-chain through a per-customer sentinel-x402 covenant chain (CLTV hops,
permissionless refunds, non-custodial). Reference implementation: this repo
(clone it first, pull fresh — a leaked worker secret was rotated recently, old
copies are stale). Use YOUR OWN LLM for the chat; keep the repo's metering and
covenant logic intact.

ROLES (read this first — it explains the whole architecture):
- Guest: signs ONLY the funding tx from their own in-browser wallet. Non-custodial.
- Backend (Deno functions): relay/construction only. NEVER holds keys, NEVER signs,
  NEVER calls meteredChatWorker from the browser.
- Worker (a sandbox with the Kaspa WASM SDK): builds the chain, and signs+broadcasts
  the bundle check-ins. YOUR sandbox does this — clone the repo there, npm install.
  Deno cannot load kaspa-wasm; the sandbox is the only runtime that can sign.

BUILD ORDER:

1. ENTITY — "MeteredChatSession": sessionId, address, network, status, covenantAddress,
   amountSompi (string), epochs, repliesPerEpoch, repliesRemaining, epochsRemaining,
   fundingTxId, chainJson, history (string), lastSettleTx.

2. FUNCTIONS — deploy both from repo functions/ into YOUR app:
   - meteredChat.ts (public: init/status/funded/reply). ONE edit allowed: in reply,
     replace InvokeLLM with your own LLM. Metering stays untouched: decrement
     repliesRemaining only on a successful reply; LLM failure = no decrement.
   - meteredChatWorker.ts (operator-only: register/settle/abort). Reads
     METERED_WORKER_SECRET from env — generate a FRESH secret, set it in your app's
     Secrets page, never commit it. Expect a "missing secret" prompt on deploy until set.

3. WIRING — if the frontend lives inside your Base44 app, call meteredChat through
   the app's own SDK client (same-origin, survives custom domains) — not a hardcoded
   cross-origin URL. Only an EXTERNAL frontend (e.g. the repo's static GitHub-Pages
   PWA) needs the absolute URL:
   https://base44.app/api/apps/<your_app_id>/functions/meteredChat.

4. WORKER — in your sandbox, export before every worker run:
     METERED_REGISTER_URL=https://base44.app/api/apps/<your_app_id>/functions/meteredChatWorker
     METERED_WORKER_SECRET=<same fresh secret>
   The api/apps/<app_id>/functions/<name> form is canonical and works from any
   sandbox regardless of the app's domain (verified by direct POST). If your app
   has a custom domain, https://<your-domain>/functions/meteredChatWorker routes
   to the same function and also works — but a domain-less app can ONLY use the
   api/apps form, so default to it.
   Commands:
     node worker/build_chain.mjs --session=<id> --customer=<kaspa:|kaspatest: addr> \
       --epochs=3 --replies=10 --register
     node worker/checkin.mjs --session=<id>    (bundle exhausted: pay treasury, relock)
     node worker/refund.mjs --session=<id>
   build_chain.mjs auto-detects network from the address prefix. Treasury key:
   generate your own, SAVE IT TO A FILE FIRST, adjust the keys/ path constant.
   A lost key = lost KAS. No recovery.

5. AUTOMATIONS — two entity-triggered workflows:
   a. MeteredChatSession create, status == "awaiting_covenant" → agent step runs
      build_chain and confirms REGISTER returns ok.
   b. repliesRemaining == 0 with epochsRemaining > 0 → agent step runs checkin.mjs.

6. STATE MACHINE — awaiting_covenant → awaiting_fund → live → exhausted | refunded.
   "Minting covenant" until register lands is designed, not a bug.

CHECK-IN SIGNING IS PLUGGABLE (do not invent your own):
- Default: sandbox auto-sign via checkin.mjs (the heartbeat — settles while you sleep).
- Manual/air-gapped mode (ask the operator before building): checkin.mjs --qr emits the
  unsigned spend as a KSPT v0x01 QR; the provider scans it with KasSigner, gets back a
  signed v0x03, backend broadcasts. Provider key never leaves the phone. NOTE: KasSigner
  currently signs Schnorr only — XMSS signing support or a "simple mode" (plain
  Schnorr provider sig) must be spec'd before this mode is real. Until then,
  sandbox auto-sign is the only working mode.

HARD RULES (violations have cost real KAS):
- Keys saved to a persistent file BEFORE any script runs. Never generated inline.
- Outputs >= 0.1 KAS or KIP-0009 storage-mass rejects the tx.
- Dry-run every mainnet spend locally before broadcasting.
- Only the sandbox signs; custody never leaves the guest.
