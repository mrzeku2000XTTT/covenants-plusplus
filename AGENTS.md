# Base44 Dev Environment

## What this repo is

Covenants++ — a Kaspa metered AI chat prototype. Three independent pieces:

- **`docs/index.html`** — Guest PWA (static HTML, served on port 3000). Key management
  is in-browser (localStorage). Imports the Kaspa WASM SDK from `../vendor/kaspa/kaspa.js`
  (not vendored in this repo — key generation/import will error without it; the page
  itself renders fine).
- **`worker/`** — Node.js + Python CLI tools the operator runs to build per-customer
  covenant chains, check in bundles, and process refunds. Not a server.
- **`functions/`** — Base44 backend functions (TypeScript, deployed to a Base44 app,
  not run locally).

## Running the preview

```bash
docker compose -f docker-compose.base44.yml up -d
```

Serves `docs/` on port 3000 via Python's built-in HTTP server. No build step —
the PWA is static HTML. Refresh the preview to see edits to `docs/index.html`.

## Worker build verification

The worker needs both Node.js and Python 3 (both present in the `node:22` image):

```bash
docker compose -f docker-compose.base44.yml exec web sh -c 'cd /app/worker && npm install --frozen-lockfile'
docker compose -f docker-compose.base44.yml exec web sh -c 'cd /app/worker && python3 build_chain.py --help'
```

`build_chain.py` imports from `../core/` (xmss_lib, full_2layer_test, kvm). The import
paths were fixed to use `os.path.dirname(__file__)` instead of the old hardcoded
`/app/xmss-reference/onchain_link` path from the pre-vendored repo layout.

Note: `core/full_2layer_test.py` has module-level demo code that runs a full 2-layer
XMSS verification on import. This executes every time `build_chain.py` imports it
and prints test output before the script's own output.

## Secrets

- `METERED_WORKER_SECRET` — guards the `meteredChatWorker` backend function. Only
  needed for worker `--register` and `settle` actions. Not required for the PWA preview.
