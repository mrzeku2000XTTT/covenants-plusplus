# AGENTS.md — Base44 dev environment notes

## Architecture (full stack, runs locally)
- **`docs/index.html`** — static PWA frontend, served by nginx on port 3000. Calls the local API at the relative path `/api/functions/meteredChat` (single origin).
- **`server/`** — Node + Express + TypeScript backend (the app's API). Owns session state and metering in an encrypted SQLite (SQLCipher) database. Routes: `POST /functions/meteredChat` (init/status/funded/reply) and `POST /functions/meteredChatWorker` (register/settle/abort, secret-guarded).
- **`functions/*.ts`** — Base44 serverless functions (Deno). `meteredChatWorker.ts` adds an `llm` action the local backend uses to reach Base44's LLM.
- **`worker/*.mjs`** — Node operator scripts for Kaspa chain build/check-in (run manually).
- **`vendor/kaspa/`** — vendored Kaspa WASM SDK (browser ESM), see below.

## Request flow
Browser → nginx (port 3000) → `/api/*` proxied to the `api` service (port 8080). Single origin, so no CORS.

## AI replies ("use base44")
Base44's `InvokeLLM` is only reachable from inside a Base44 function. `server/src/llm.ts` calls the deployed functions over HTTP:
1. **Preferred** — the `llm` action on `meteredChatWorker` (secret-guarded, unmetered).
2. **Fallback** (until that action is deployed) — a Base44 session the backend provisions and drives to `live`, then uses `meteredChat.reply` as the completion channel; re-provisioned when its meter runs out.

Either way the model runs on Base44; the local backend owns the real meter.

## Database
SQLCipher (`better-sqlite3-multiple-ciphers`) at `/data/sessions.db`, whole-file encrypted with `DB_ENCRYPTION_KEY` (a local-infra credential generated here, wired via compose `environment:` — not a platform secret). Data lives in the `api-data` volume. To confirm encryption: the file must NOT begin with `SQLite format 3`.

## Vendored Kaspa WASM SDK
`vendor/kaspa/kaspa.js` + `vendor/kaspa/kaspa_bg.wasm` are the browser ESM build of the Kaspa WASM SDK (they were missing from the import). Source:
- `https://github.com/kaspanet/rusty-kaspa/releases/download/v2.1.0/kaspa-wasm32-sdk-v2.1.0.zip` → `web/kaspa/`
- The npm `kaspa-wasm` package is stale (0.13.0, 2023, Node-only) and does NOT contain `createInputSignature` / `SighashType` — do not use it.

The frontend uses `import('../vendor/kaspa/kaspa.js')` then `await mod.default()` (wasm-bindgen `--target web` init). nginx serves `.wasm` as `application/wasm`.

## Key details / gotchas
- nginx runs as `user root` (sandbox root dir is mode 700, so the default `nginx` user can't read bind-mounted files).
- Healthchecks must use `127.0.0.1`, not `localhost` (IPv6 resolution fails in the container).
- After editing `nginx.base44.conf`, restart `web` — nginx loads config only at startup.
- The `api` service installs deps on startup (`npm install`) and runs `tsx watch` for live reload.
- `web` waits for `api` to be healthy (`depends_on: condition: service_healthy`).
