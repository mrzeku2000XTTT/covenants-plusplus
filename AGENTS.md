# AGENTS.md — Base44 dev environment notes

## Project overview
Covenants++ is a metered AI chat app on Kaspa. It has three parts:
- **`docs/index.html`** — static PWA frontend (the guest UI). Calls the Base44 cloud API directly at `https://base44.app/api/apps/.../functions/meteredChat`. No local backend needed.
- **`functions/*.ts`** — Base44 serverless functions (Deno + `@base44/sdk`). Deployed on Base44 cloud, not run locally.
- **`worker/*.mjs`** — Node.js operator scripts for Kaspa chain building/check-in. No `package.json` exists; these are run manually by the operator.

## Running in the sandbox
The preview serves `docs/index.html` via nginx on port 3000. The repo root is bind-mounted so that `../vendor/kaspa/kaspa.js` (imported lazily by the frontend) resolves to `/vendor/kaspa/kaspa.js`. The `vendor/` directory is **not present** in the repo — the Kaspa WASM SDK import will 404, but it's lazy-loaded inside try/catch only when the user generates/imports a key, so the page renders fine.

## Key details
- nginx runs as `user root` (sandbox root dir is mode 700, so the default `nginx` user can't read bind-mounted files).
- Healthcheck must use `127.0.0.1` not `localhost` (IPv6 resolution issue in the container).
- The frontend's API endpoint is hardcoded to the Base44 cloud — no local API service is needed.
- No external credentials are required for the frontend to render.
