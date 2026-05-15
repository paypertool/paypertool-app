/**
 * status.ts — sanity / observability check for the PayPerTool stack.
 *
 * Run via: pnpm --filter @workspace/scripts run status
 *
 * Checks, in order:
 *  1. API server reachable (GET /api/healthz)
 *  2. Tool catalog (GET /api/tools) — what's advertised right now
 *  3. Test wallet balance on Base Sepolia (USDC + ETH)
 *  4. Required env vars on the server side (best-effort heuristic)
 *
 * Exits non-zero on any hard failure (server down, no wallet, etc).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, http, formatUnits, type Hex } from "viem";
import { baseSepolia } from "viem/chains";

const SERVER_URL = process.env["X402_SERVER_URL"] ?? "http://localhost:80";
const WALLET_PATH = resolve(process.cwd(), "../.local/x402-test-wallet.json");
const USDC_BASE_SEPOLIA =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

type WalletFile = { privateKey: Hex; address: `0x${string}` };
type ToolEntry = { id: string; method: string; path: string; price: string };
type ToolsResponse = { tools: ToolEntry[]; payTo?: string; network?: string };

function line(s = "") {
  console.log(s);
}

function header(s: string) {
  line("");
  line(`=== ${s} ===`);
}

let hardFailures = 0;

async function checkServer() {
  header("1. API server");
  try {
    const t0 = Date.now();
    const res = await fetch(`${SERVER_URL}/api/healthz`);
    const ms = Date.now() - t0;
    if (!res.ok) {
      line(`  FAIL  GET /api/healthz -> HTTP ${res.status} (${ms}ms)`);
      hardFailures++;
      return false;
    }
    const body = (await res.json()) as { status?: string };
    line(`  OK    ${SERVER_URL}/api/healthz -> ${body.status} (${ms}ms)`);
    return true;
  } catch (err) {
    line(`  FAIL  cannot reach ${SERVER_URL}: ${(err as Error).message}`);
    line(`        is the workflow 'artifacts/api-server: API Server' running?`);
    hardFailures++;
    return false;
  }
}

async function checkCatalog(): Promise<ToolsResponse | null> {
  header("2. Tool catalog");
  try {
    const res = await fetch(`${SERVER_URL}/api/tools`);
    if (!res.ok) {
      line(`  FAIL  GET /api/tools -> HTTP ${res.status}`);
      hardFailures++;
      return null;
    }
    const body = (await res.json()) as ToolsResponse;
    if (body.payTo) line(`  payTo:   ${body.payTo}`);
    if (body.network) line(`  network: ${body.network}`);
    line(`  ${body.tools.length} tool(s) advertised:`);
    for (const t of body.tools) {
      line(`    - ${t.id.padEnd(14)} ${t.method.padEnd(4)} ${t.path.padEnd(28)} ${t.price}`);
    }
    const expected = ["scrape_url", "search_web", "screenshot", "extract_data"];
    const missing = expected.filter((id) => !body.tools.some((t) => t.id === id));
    if (missing.length > 0) {
      line(`  WARN  missing from catalog: ${missing.join(", ")}`);
      if (missing.includes("search_web")) {
        line(`        -> SERPER_API_KEY env var is probably not set`);
      }
    }
    return body;
  } catch (err) {
    line(`  FAIL  ${(err as Error).message}`);
    hardFailures++;
    return null;
  }
}

async function checkWallet() {
  header("3. Test wallet (Base Sepolia)");
  if (!existsSync(WALLET_PATH)) {
    line(`  WARN  no test wallet at ${WALLET_PATH}`);
    line(`        run: pnpm --filter @workspace/scripts run pay:setup`);
    return;
  }
  const wallet = JSON.parse(readFileSync(WALLET_PATH, "utf-8")) as WalletFile;
  line(`  address: ${wallet.address}`);

  try {
    const client = createPublicClient({ chain: baseSepolia, transport: http() });
    const [eth, usdc] = await Promise.all([
      client.getBalance({ address: wallet.address }),
      client.readContract({
        address: USDC_BASE_SEPOLIA,
        abi: [
          {
            name: "balanceOf",
            type: "function",
            stateMutability: "view",
            inputs: [{ name: "account", type: "address" }],
            outputs: [{ name: "", type: "uint256" }],
          },
        ],
        functionName: "balanceOf",
        args: [wallet.address],
      }) as Promise<bigint>,
    ]);
    const usdcStr = formatUnits(usdc, 6);
    const ethStr = formatUnits(eth, 18);
    line(`  USDC:    ${usdcStr}  (= ${Math.floor(Number(usdcStr) / 0.005)} scrape calls @ $0.005)`);
    line(`  ETH:     ${ethStr}  (gasless via EIP-3009, so 0 is fine)`);
    if (usdc === 0n) {
      line(`  WARN  wallet has 0 USDC — top up at https://faucet.circle.com (Base Sepolia)`);
    }
  } catch (err) {
    line(`  WARN  could not query Base Sepolia: ${(err as Error).message}`);
  }
}

function checkServerEnv() {
  header("4. Server-side env hints");
  line(`  These are checked LOCALLY (the running server may differ if started elsewhere):`);
  const checks: Array<[string, string]> = [
    ["SERPER_API_KEY", "search_web (else tool is hidden)"],
    ["AI_INTEGRATIONS_OPENAI_BASE_URL", "extract_data via Replit AI"],
    ["AI_INTEGRATIONS_OPENAI_API_KEY", "extract_data via Replit AI"],
    ["X402_NETWORK", "defaults to base-sepolia"],
  ];
  for (const [k, why] of checks) {
    const v = process.env[k];
    const mark = v ? "set " : "MISS";
    line(`    [${mark}] ${k.padEnd(34)}  ${why}`);
  }
}

async function main() {
  line(`PayPerTool status check`);
  line(`server: ${SERVER_URL}`);

  const serverOk = await checkServer();
  if (serverOk) await checkCatalog();
  await checkWallet();
  checkServerEnv();

  line("");
  if (hardFailures === 0) {
    line(`OK — ${hardFailures} hard failures.`);
  } else {
    line(`PROBLEMS — ${hardFailures} hard failure(s). See above.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
