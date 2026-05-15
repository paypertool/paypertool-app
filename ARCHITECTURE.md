# PayPerTool — architecture

Companion to `replit.md` (current state) and `RUNBOOK.md` (commands).
This file = how the system is shaped and why.

---

## Stack

pnpm workspaces · Node 24 · TS 5.9 · Express 5 + `x402-express` ·
React + Vite + Tailwind v4 (landing) · `viem` (EIP-712/EIP-3009) ·
PostgreSQL + Drizzle (used by `agent_memory`) · esbuild (api-server) ·
`@modelcontextprotocol/sdk` over stdio.

---

## Where things live

```
artifacts/
  api-server/                       # the resource server
    src/
      index.ts                      # entry: starts express on PORT
      app.ts                        # cors, json, x402 paywall, /api routes,
                                    # static web from WEB_DIST + SPA fallback
      routes/{health,tools}.ts      # GET /api/healthz + /api/tools + paid POSTs
      lib/
        x402-config.ts              # *** SOURCE OF TRUTH *** for catalog,
                                    # prices, payTo, x402Routes, gating
        scrape|search|screenshot|extract.ts  # web utility backends
        youtube-transcript|og-metadata.ts    # more web utility
        ens-resolve|gas-price|token-info|rugcheck.ts  # crypto backends
        agent-memory.ts             # Postgres-backed KV (set/get)
        url-guard.ts                # SHARED SSRF guard — assertSafeUrl + safeFetch
        logger.ts                   # pino singleton
    build.mjs                       # esbuild → dist/index.mjs

  web/                              # landing page (single Home.tsx)
    index.html                      # SEO/OG meta
    src/pages/Home.tsx              # entire Web3 landing
    vite.config.ts                  # PORT/BASE_PATH optional at build time

  mockup-sandbox/                   # Canvas dev sandbox (NOT prod). Holds
                                    # rejected Terminal/Editorial variants.

lib/
  db/                               # Drizzle: agent_memory schema +
                                    # lazy getDb()/getPool()/isDatabaseConfigured()
  paypertool-mcp/                   # buyer-side MCP server
    src/{cli,index}.ts              # discovers /api/tools, signs with viem,
                                    # exposes each tool to MCP clients

scripts/ (@workspace/scripts)
  src/status.ts                     # sanity check
  src/x402-pay.ts                   # pay:setup, pay:scrape
  src/mcp-test-all.ts               # full E2E with real testnet payments

.local/                             # GITIGNORED — DO NOT COMMIT
  x402-test-wallet.json             # test buyer key

# Deploy
railway.json, nixpacks.toml, Procfile, .nvmrc, README.md
```

---

## Tool catalog

Source of truth: `artifacts/api-server/src/lib/x402-config.ts`.
Both `x402Routes` (paywall) and `TOOLS` (`GET /api/tools` discovery)
derive from one array. Add new tools there first.

### Web utility tools

| id                  | path                                | price   | backend                          | gating env                 |
| ------------------- | ----------------------------------- | ------- | -------------------------------- | -------------------------- |
| `scrape_url`        | `POST /api/tools/scrape`            | $0.005  | fetch + Turndown                 | none                       |
| `search_web`        | `POST /api/tools/search`            | $0.01   | Serper.dev                       | `SERPER_API_KEY`           |
| `screenshot`        | `POST /api/tools/screenshot`        | $0.005  | WordPress mShots                 | none                       |
| `extract_data`      | `POST /api/tools/extract`           | $0.02   | Groq Llama 3.3 70B (OpenAI-compat) | `OPENAI_API_KEY` (or AI Integrations in dev) |
| `youtube_transcript`| `POST /api/tools/youtube-transcript`| $0.01   | `youtube-transcript` npm pkg     | none                       |
| `og_metadata`       | `POST /api/tools/og-metadata`       | $0.002  | fetch + meta-tag regex           | none                       |

### Crypto / on-chain tools

| id            | path                          | price   | backend                              | gating env                 |
| ------------- | ----------------------------- | ------- | ------------------------------------ | -------------------------- |
| `ens_resolve` | `POST /api/tools/ens-resolve` | $0.002  | viem on Ethereum mainnet (llamarpc)  | none (`MAINNET_RPC_URL` opt) |
| `gas_price`   | `POST /api/tools/gas-price`   | $0.002  | viem (5 chains) + CoinGecko free     | none (`{CHAIN}_RPC_URL` opt) |
| `token_info`  | `POST /api/tools/token-info`  | $0.005  | Dexscreener public API (EVM + Solana)| none                       |
| `rugcheck`    | `POST /api/tools/rugcheck`    | $0.02   | GoPlus Token Security (free, 8 chains) | none                     |

### Agent infrastructure (novel — only x402 makes this viable)

| id                  | path                          | price    | backend                          | gating env       |
| ------------------- | ----------------------------- | -------- | -------------------------------- | ---------------- |
| `agent_memory_set`  | `POST /api/tools/memory-set`  | $0.001   | Postgres (Drizzle, lazy-init)    | `DATABASE_URL`   |
| `agent_memory_get`  | `POST /api/tools/memory-get`  | $0.0005  | Postgres (Drizzle, lazy-init)    | `DATABASE_URL`   |

---

## Architecture decisions (non-obvious)

- **Single source of truth: `lib/x402-config.ts`.** Tools, prices, paths,
  discovery descriptors live in one array. Both `x402Routes` (paywall) and
  `TOOLS` (`GET /api/tools`) derive from it. Paywall and catalog cannot
  drift apart.

- **Dynamic gating, not feature flags.** `isToolEnabled()` removes a tool
  from both paywall and catalog when its env var (or `DATABASE_URL` for
  memory tools) is missing. Buyers physically cannot pay for a
  non-functional tool. The MCP wrapper and the landing both query
  `/api/tools` at startup, so dropping `SERPER_API_KEY` makes
  `search_web` disappear everywhere automatically.

- **Settlement = success only.** `x402-express` settles on-chain only on
  2xx. We weaponize this: every tool throws a typed `*Error` with `status`
  4xx/5xx on bad input/empty results/upstream failure. Buyer never charged
  for useless responses. Examples: `search_web` → 404 on zero results;
  `screenshot` → 504 if mShots only delivers placeholder after 8 polls;
  `agent_memory_get` → 404 if key missing or expired.

- **Shared SSRF guard.** `lib/url-guard.ts` exposes:
  - `safeParseUrl(url)` — sync literal-IP + protocol check.
  - `assertSafeUrl(url)` — `safeParseUrl` + `dns.lookup({all:true})` →
    rejects if ANY resolved IP (v4 or v6) is in private/reserved ranges.
    Defeats DNS rebinding.
  - `safeFetch(url, init)` — wraps `fetch` with `redirect: "manual"`,
    re-runs `assertSafeUrl` on every `Location` hop (max 5), strips
    `Authorization` + `Cookie` on cross-origin redirects.

  Tool migration: `scrape` / `og_metadata` use `safeFetch`; `screenshot`
  uses `assertSafeUrl` then fetches the fixed mShots host; `extract` is
  covered transitively (calls `scrapeUrl`). Mainnet-safe.

- **Gasless buyers via EIP-3009.** Buyer needs USDC only, never ETH.
  Facilitator pays gas. This makes $0.0005-$0.001 micropayments viable
  (and is what makes `agent_memory` economically possible at all).

- **MCP wrapper is dumb on purpose.** Discovers from `/api/tools`, wraps
  each in an MCP tool with the buyer's wallet, forwards. New server tool
  needs only an entry in `TOOL_INPUT_SCHEMAS` in
  `lib/paypertool-mcp/src/index.ts` (default switch case JSON-stringifies
  the response — no per-tool summariser required).

- **Single Node service in production.** api-server serves `WEB_DIST`
  (resolved from CWD) as static + SPA fallback for non-`/api` GETs. Dev
  keeps web as a separate Vite workflow for HMR; Railway runs
  `pnpm run start:prod` which sets `WEB_DIST=artifacts/web/dist/public`.
  Same-origin → no CORS, no `VITE_API_BASE_URL` plumbing.

- **`agent_memory` is x402-native by design.** No API key, no signup, no
  rate limit — the $0.001 paywall + bounded TTL + bounded value size
  collectively are the abuse control. Auth is capability-based:
  knowledge of `(namespace, key)` is the only credential. This is only
  viable BECAUSE micropayments are atomic on x402.

- **DB is lazy-initialized.** `lib/db` exports `getDb()`/`getPool()` not a
  top-level `db` constant, so api-server boots cleanly without
  `DATABASE_URL`. Memory tools auto-disappear from catalog and routes are
  not registered.

- **Deploy target is Railway, not Replit.** Replit = dev sandbox. Railway
  = prod (stable URL, custom domain for x402 directories, low-traffic
  cost predictability, GitHub-driven CI).

---

## `agent_memory` auth model

Capability-based. There is **NO** signature check. Knowledge of
`(namespace, key)` grants read+write.

Recommendation to buyers (documented loud and clear in the catalog
description): `namespace = your wallet address`, `key = a UUID`.

Limits:
- namespace 1-128 chars
- key 1-256 chars
- value ≤4KB serialized JSON
- TTL 60s-90d (default 30d)

This is fine because (a) value is small, (b) TTL is bounded, (c) the
only way to even reach the endpoint is to pay $0.001.

---

## LLM provider swap pattern

Works for any OpenAI-compatible provider. `extract.ts` reads three env
vars: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `EXTRACT_MODEL`. To swap
providers, set those 3 vars in Railway — no code change.

Currently in prod: Groq (`api.groq.com/openai/v1`,
`llama-3.3-70b-versatile`).
