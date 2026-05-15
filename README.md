# PayPerTool

x402-protocol payment service that sells AI-agent tools per HTTP call in
USDC on Base. No signup, no API keys, no subscriptions — buyers (MCP
clients, LangChain agents, autonomous agents) hold a hot wallet and pay
$0.005-$0.02 per call.

## Tools

| tool          | path                          | price  |
| ------------- | ----------------------------- | ------ |
| `scrape_url`  | `POST /api/tools/scrape`      | $0.005 |
| `search_web`  | `POST /api/tools/search`      | $0.01  |
| `screenshot`  | `POST /api/tools/screenshot`  | $0.005 |
| `extract_data`| `POST /api/tools/extract`     | $0.02  |

`GET /api/tools` returns the live catalog (input/output shapes, prices,
network). The MCP wrapper at `lib/paypertool-mcp/` consumes this and
exposes each tool to MCP clients.

## Stack

pnpm monorepo · Node 24 · TypeScript · Express 5 + `x402-express` ·
React + Vite landing · `viem` for EIP-3009 signing · USDC on Base
(Sepolia for now, mainnet later).

## Deploy

Single Node service: api-server bundles the routes and serves the web
landing as static files when `WEB_DIST` is set.

- **Build**: `pnpm run build:prod`
- **Start**: `pnpm run start:prod`
- Health: `GET /api/healthz`
- Required env: `SERPER_API_KEY`, `OPENAI_API_KEY`, `PORT` (Railway sets
  it). Optional: `X402_NETWORK` (default `base-sepolia`).

`railway.json` and `nixpacks.toml` are configured for one-click deploy.

## Source of truth

`replit.md` is the project brain. Read it before making changes — it
documents architecture decisions, the current session state, gotchas,
and the deploy plan.
