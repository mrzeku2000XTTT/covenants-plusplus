# AGENTS.md — Base44 dev environment notes

## Project overview
Covenants++ is a metered AI chat app on Kaspa. It has three parts:
- **`docs/index.html`** — static PWA frontend (the guest UI). Calls the Base44 cloud API directly at `https://base44.app/api/apps/.../functions/meteredChat`. No local backend needed.
- **`functions/*.ts`** — Base44 serverless functions (Deno + `@base44/sdk`). Deployed on Base44 cloud, not run locally.
- **`worker/*.mjs`** — Node.js operator scripts for Kaspa chain building/check-in. No `package.json` exists; these are run manually by the operator.

## Running in the sandbox
The preview serves `docs/index.html` via nginx on port 3000. The repo root is bind-mounted so that `../vendor/kaspa/kaspa.js` (imported lazily by the frontend) resolves to `/vendor/kaspa/kaspa.js`.

## Vendored Kaspa WASM SDK
`vendor/kaspa/kaspa.js` + `vendor/kaspa/kaspa_bg.wasm` are the browser ESM build of the Kaspa WASM SDK, vendored from the official release (they were missing from the import). Source:
- `https://github.com/kaspanet/rusty-kaspa/releases/download/v2.1.0/kaspa-wasm32-sdk-v2.1.0.zip` → `web/kaspa/`
- The npm `kaspa-wasm` package is stale (0.13.0, 2023, Node-only) and does NOT contain `createInputSignature` / `SighashType` — do not use it.

The frontend uses `import('../vendor/kaspa/kaspa.js')` then `await mod.default()` (wasm-bindgen `--target web` init). nginx serves `.wasm` as `application/wasm` (from the stock `mime.types`).

## Key details
- nginx runs as `user root` (sandbox root dir is mode 700, so the default `nginx` user can't read bind-mounted files).
- Healthcheck must use `127.0.0.1` not `localhost` (IPv6 resolution issue in the container).
- The frontend's API endpoint is hardcoded to the Base44 cloud — no local API service is needed.
- No external credentials are required for the frontend to render.
