# @paypertool/mcp

MCP server that lets AI agents discover and pay for **PayPerTool** tools per HTTP call in USDC on Base via the [x402 protocol](https://x402.org). No signup, no API keys, no subscriptions — your agent holds a hot wallet and pays $0.0005-$0.02 per call.

> **Hot wallet warning.** This package needs a private key on disk to sign EIP-3009 USDC authorizations. Treat the wallet as a small, refillable spending account. Never use a key that holds significant funds. For production agents, prefer a managed signer (CDP Wallet, Privy, Turnkey) over plaintext config.

---

## Install (Claude Desktop)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "paypertool": {
      "command": "npx",
      "args": ["-y", "@paypertool/mcp"],
      "env": {
        "PAYPERTOOL_PRIVATE_KEY": "0x...",
        "PAYPERTOOL_BASE_URL": "https://web-production-a4921.up.railway.app",
        "PAYPERTOOL_NETWORK": "base"
      }
    }
  }
}
```

Restart Claude. The full PayPerTool catalog (`scrape_url`, `search_web`, `screenshot`, `extract_data`, `youtube_transcript`, `og_metadata`, `ens_resolve`, `gas_price`, `token_info`, `rugcheck`, `agent_memory_set`, `agent_memory_get`) appears as native tools.

Works with any MCP-compatible client (Cursor, Cline, Continue, custom agents).

---

## Funding the wallet

Send a small amount of native USDC on Base to the wallet address that corresponds to your `PAYPERTOOL_PRIVATE_KEY`. **No ETH needed** — the x402 facilitator pays gas. EIP-3009 is gasless for the buyer.

- Base mainnet USDC contract: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Topping up $1-$5 covers hundreds of calls.

For testing without real money, set `PAYPERTOOL_NETWORK=base-sepolia` and use the Base Sepolia faucet ([faucet.circle.com](https://faucet.circle.com)).

---

## Environment variables

| var                       | required | default                                              |
| ------------------------- | -------- | ---------------------------------------------------- |
| `PAYPERTOOL_PRIVATE_KEY`  | yes      | —                                                    |
| `PAYPERTOOL_BASE_URL`     | no       | `https://web-production-a4921.up.railway.app`        |
| `PAYPERTOOL_SERVER_URL`   | no       | (alias for `PAYPERTOOL_BASE_URL`)                    |
| `PAYPERTOOL_NETWORK`      | no       | `base` (use `base-sepolia` for testing)              |

---

## How it works (the HTTP exchange)

```
1. Agent: POST /api/tools/scrape  { "url": "https://example.com" }
2. Server: 402 Payment Required + payment requirements (USDC amount, payTo, network)
3. Agent: signs EIP-3009 transferWithAuthorization with its hot wallet
4. Agent: POST /api/tools/scrape with X-PAYMENT header
5. Facilitator: verifies + settles on Base (gasless for buyer)
6. Server: 200 OK + result + X-PAYMENT-RESPONSE (settlement tx hash)
```

The MCP server handles steps 3 + 4 + 6 transparently. The agent just calls the tool.

---

## Links

- Website: https://web-production-a4921.up.railway.app
- Source: https://github.com/ttcarter38-max/paypertool
- x402 protocol: https://x402.org
- MCP spec: https://modelcontextprotocol.io

## License

MIT
