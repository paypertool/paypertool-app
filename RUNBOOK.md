# PayPerTool — runbook

Companion to `replit.md` (state) and `ARCHITECTURE.md` (shape).
This file = how to run, deploy, debug, and avoid known traps.

All commands from repo root.

---

## Dev

- `restart_workflow artifacts/api-server: API Server`
- `restart_workflow artifacts/web: web`
- `pnpm --filter @workspace/scripts run status` — sanity check
- `pnpm --filter @workspace/scripts run mcp:test-all` — full E2E with
  **real testnet payments** (against the local api-server unless
  `X402_SERVER_URL` is set)
- `X402_SERVER_URL=https://web-production-a4921.up.railway.app pnpm --filter @workspace/scripts run mcp:test-all`
  — same E2E against Railway prod
- `pnpm --filter @workspace/scripts run pay:scrape <url>` — single paid call
- `pnpm --filter @workspace/scripts run pay:setup` — print test wallet
  address + faucet instructions

---

## Build / verify

- `pnpm run typecheck` — canonical full check across all packages
- `pnpm run build:prod` — web build → api-server build (Railway uses this)
- `pnpm run start:prod` — `WEB_DIST=… start api-server` (Railway uses this)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate Zod + RQ hooks
- `pnpm --filter @workspace/db run push` — push Drizzle schema to `DATABASE_URL`
- **Verify with `typecheck`, not `build`** (build needs workflow env).
- **Never run `pnpm dev` from the root.** Use `restart_workflow` per
  artifact.

---

## Env vars on the api-server

| var                               | required for                                 |
| --------------------------------- | -------------------------------------------- |
| `SERPER_API_KEY`                  | `search_web` (else hidden from catalog)      |
| `OPENAI_API_KEY`                  | `extract_data` (Railway). Falls back to `AI_INTEGRATIONS_OPENAI_API_KEY` in Replit dev. |
| `OPENAI_BASE_URL` (optional)      | defaults to `api.openai.com/v1`              |
| `EXTRACT_MODEL` (optional)        | defaults to `gpt-5-nano-2025-08-07` (Replit dev) / `llama-3.3-70b-versatile` (prod) |
| `DATABASE_URL`                    | `agent_memory_set` + `agent_memory_get` (else both hidden) |
| `X402_NETWORK` (optional)         | defaults to `base-sepolia`. Currently `base` in prod. |
| `WEB_DIST` (prod only)            | path to web's static dir; enables single-service serving |
| `PORT`                            | auto-set by Railway; required by Express     |
| `MAINNET_RPC_URL` etc (optional)  | per-chain overrides for `gas_price`, `ens_resolve` |

## Env vars on the web (build-time, optional)

| var                  | required for                                                  |
| -------------------- | ------------------------------------------------------------- |
| `VITE_API_BASE_URL`  | OPTIONAL. Empty = same-origin. Only set if web + api ever split onto different hosts. |

---

## Provisioning Postgres on Railway (one-time)

1. Railway dashboard → project → "+ New" → Database → PostgreSQL.
2. Railway auto-injects `DATABASE_URL` into the api-server service.
3. From local: `DATABASE_URL=<railway-pg-url> pnpm --filter @workspace/db run push`
   to create the `agent_memory` table.
4. Restart the Railway service. `/api/tools` will now include the two
   memory tools.

---

## Pushing from Replit (sandbox blocks `git push`)

`git push` is blocked even from Project Tasks. The working pattern: edit
file → use the GitHub Git Data API to create a blob, tree
(`base_tree: <current tree sha>` so only changed paths matter), commit
with `parent = <current main sha>`, then `PATCH refs/heads/main`.

- Token: `GH_TOKEN` env var (or `/tmp/.ghtok` if persisted in session).
- Repo: `ttcarter38-max/paypertool`.
- Worked examples: `HISTORY.md` session 5 part 4.

Railway auto-redeploys on push to `main` (~60s).

---

## Mainnet checklist (status)

1. ~~Harden SSRF in `lib/url-guard.ts`~~ ✅ DONE (session 7).
2. ~~Decide facilitator~~ ✅ public x402.org (default — free,
   Coinbase-maintained).
3. ~~Update `PAY_TO_ADDRESS`~~ ✅ kept user's MetaMask `0xD541...2Ff7`
   for low-volume launch.
4. ~~Set `X402_NETWORK=base` in Railway~~ ✅ DONE (session 7 part 2).
5. ⏳ Smoke test: 1 paid call on mainnet ($0.005) once the test wallet
   has USDC on Base mainnet.

---

## Gotchas

- **Search backend requires `SERPER_API_KEY`.** DuckDuckGo HTML scraping
  is blocked from server IPs. Free tier: 2500 queries from
  https://serper.dev/, then $0.001/query (90% margin at $0.01/call).

- **x402 settlement on 2xx only.** Throw 4xx/5xx to avoid charging buyers
  for empty/failed results.

- **OpenAI is wired through Replit AI Integrations in dev.** On Railway,
  use a real `OPENAI_API_KEY`. Same SDK, just point at the real provider.

- **Screenshot backend (mShots) returns JPEG**, despite URL pattern
  suggesting PNG. Route returns the actual `contentType`.

- **NEVER push package.json changes without `pnpm-lock.yaml`.** Railway
  runs `pnpm install --frozen-lockfile` (strict). Any specifier mismatch
  between manifest and lockfile = build fails with
  `ERR_PNPM_OUTDATED_LOCKFILE`. Workflow:
  1. Edit `package.json` (any package in monorepo).
  2. Run `pnpm install --lockfile-only` (regenerates lockfile only, fast).
  3. Verify clean with `pnpm install --frozen-lockfile`.
  4. Commit BOTH files in same push.
  Local `pnpm install --frozen-lockfile` may pass spuriously if your
  lockfile was already updated from a prior non-frozen install — always
  verify the file you're about to commit matches `pnpm-lock.yaml` on
  GitHub before pushing. Bit me twice in session 7 part 3
  (commits d1330a8, 278cadf both failed Railway build).

- **mShots returns a placeholder while generating.** Detected by byte
  size + fingerprint. After 8 polls (~8s) we throw 504.

- **`replacement transaction underpriced` on settlement is a facilitator
  problem, not ours.** Public x402.org facilitator has one wallet for
  everyone — concurrent payments can transient-fail. Buyer pays nothing.
  Client must retry. On mainnet consider self-hosting if rate >5%.

- **Test wallet private key must never leave `.local/`.** `.local/` is
  gitignored. Verify before pushing.

- **`VITE_API_BASE_URL` is build-time, not runtime.** Vite inlines it.

- **`agent_memory` collisions.** No auth — anyone who guesses both
  namespace and key reads/overwrites. Document this loudly to buyers.
  The catalog description already does.

- **MCP wrapper requires a `TOOL_INPUT_SCHEMAS` entry per tool.** Tools
  without one are filtered out at `buildToolList()` even though
  `/api/tools` returns them. When adding a new tool to `x402-config.ts`,
  also add its input schema to `lib/paypertool-mcp/src/index.ts`. The
  dispatch default case JSON-stringifies the response, so no
  per-tool summariser is needed.

---

## External pointers

- x402: https://x402.org · https://github.com/coinbase/x402
- Coinbase facilitator: https://docs.cdp.coinbase.com/x402/welcome
- Base mainnet USDC (native): `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Base Sepolia USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Base Sepolia faucet: https://faucet.circle.com
- Receiver wallet on basescan (mainnet):
  https://basescan.org/address/0xD54173d0708d16bBe17A8a1156e66460aE872Ff7
- Receiver wallet on basescan (sepolia):
  https://sepolia.basescan.org/address/0xD54173d0708d16bBe17A8a1156e66460aE872Ff7
- GoPlus Token Security API (rugcheck backend): https://docs.gopluslabs.io/
