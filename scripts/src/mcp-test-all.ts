import { resolve } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const WALLET_PATH = resolve(
  process.cwd(),
  "../.local/x402-test-wallet.json",
);
const SERVER_URL = process.env["X402_SERVER_URL"] ?? "http://localhost:80";
const MCP_ENTRY = resolve(
  process.cwd(),
  "../lib/paypertool-mcp/src/cli.ts",
);
const OUT_DIR = resolve(process.cwd(), "../.local/mcp-test-output");

type CallSpec = {
  name: string;
  arguments: Record<string, unknown>;
  label: string;
};

const TEST_NAMESPACE = "paypertool-e2e";
const TEST_KEY = `e2e-${Date.now()}`;
const TEST_VALUE = {
  hello: "world",
  ts: new Date().toISOString(),
  nonce: Math.random().toString(36).slice(2),
};

const ALL_CALLS: CallSpec[] = [
  {
    name: "agent_memory_set",
    label: `memory_set ns=${TEST_NAMESPACE} key=${TEST_KEY}`,
    arguments: {
      namespace: TEST_NAMESPACE,
      key: TEST_KEY,
      value: TEST_VALUE,
      ttlSeconds: 3600,
    },
  },
  {
    name: "agent_memory_get",
    label: `memory_get ns=${TEST_NAMESPACE} key=${TEST_KEY}`,
    arguments: {
      namespace: TEST_NAMESPACE,
      key: TEST_KEY,
    },
  },
  {
    name: "rugcheck",
    label: "rugcheck USDC on base",
    arguments: {
      chain: "base",
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    },
  },
  {
    name: "scrape_url",
    label: "scrape https://example.com",
    arguments: { url: "https://example.com" },
  },
  {
    name: "search_web",
    label: "search 'x402 protocol coinbase'",
    arguments: { query: "x402 protocol coinbase", limit: 5 },
  },
  {
    name: "screenshot",
    label: "screenshot https://example.com",
    arguments: { url: "https://example.com", width: 1024, height: 768 },
  },
  {
    name: "extract_data",
    label: "extract product info from example.com",
    arguments: {
      url: "https://example.com",
      instructions:
        "Extract the page title and the main paragraph as a 1-2 sentence summary.",
      schema: {
        type: "object",
        required: ["title", "summary", "hasLink"],
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          hasLink: { type: "boolean" },
          linkText: { type: ["string", "null"] },
        },
      },
    },
  },
];

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: string; [k: string]: unknown };

async function main() {
  const wallet = JSON.parse(readFileSync(WALLET_PATH, "utf-8")) as {
    privateKey: string;
    address: string;
  };

  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`[test] payer wallet: ${wallet.address}`);
  console.log(`[test] resource server: ${SERVER_URL}`);
  console.log(`[test] spawning MCP server...`);

  const transport = new StdioClientTransport({
    command: "pnpm",
    args: ["exec", "tsx", MCP_ENTRY],
    env: {
      ...process.env,
      PAYPERTOOL_PRIVATE_KEY: wallet.privateKey,
      PAYPERTOOL_SERVER_URL: SERVER_URL,
      PAYPERTOOL_NETWORK: "base-sepolia",
    },
  });

  const client = new Client({ name: "mcp-test-all", version: "0.0.1" });
  await client.connect(transport);
  console.log("[test] connected\n");

  const tools = await client.listTools();
  const advertised = new Set(tools.tools.map((t) => t.name));
  console.log(`[test] MCP advertises ${tools.tools.length} tools:`);
  for (const t of tools.tools) {
    console.log(`  - ${t.name}`);
  }
  console.log("");

  const CALLS = ALL_CALLS.filter((c) => {
    if (advertised.has(c.name)) return true;
    console.log(`[test] skipping ${c.name} (not advertised by server)`);
    return false;
  });

  const txs: Array<{ tool: string; tx: string | undefined }> = [];

  for (const call of CALLS) {
    console.log(`\n========== ${call.label} ==========`);
    const t0 = Date.now();
    let result;
    try {
      result = await client.callTool({
        name: call.name,
        arguments: call.arguments,
      });
    } catch (err) {
      console.error(`[test] ${call.name} threw:`, err);
      continue;
    }
    const elapsed = Date.now() - t0;
    console.log(`[test] returned in ${elapsed}ms`);

    if (result.isError) {
      console.error(`[test] ${call.name} reported error:`);
      for (const c of result.content as ContentBlock[]) {
        if (c.type === "text") console.error("  ", (c as { text: string }).text);
      }
      continue;
    }

    const content = result.content as ContentBlock[];
    for (const block of content) {
      if (block.type === "text") {
        const text = (block as { text: string }).text;
        console.log(text.slice(0, 600));
        if (text.length > 600) console.log(`... (${text.length - 600} more chars)`);
      } else if (block.type === "image") {
        const img = block as { data: string; mimeType: string };
        const ext = img.mimeType.split("/")[1] ?? "png";
        const outPath = `${OUT_DIR}/${call.name}.${ext}`;
        writeFileSync(outPath, Buffer.from(img.data, "base64"));
        console.log(
          `[test] image saved to ${outPath} (${Buffer.from(img.data, "base64").byteLength} bytes)`,
        );
      }
    }

    const meta = (result as { _meta?: Record<string, unknown> })._meta;
    if (meta) {
      const tx = meta["x402.transaction"];
      console.log(`[test] tx: ${tx}`);
      if (typeof tx === "string") {
        txs.push({ tool: call.name, tx });
      }
    }
  }

  await client.close();

  console.log("\n========== SUMMARY ==========");
  console.log(`Total paid calls: ${txs.length}`);
  for (const { tool, tx } of txs) {
    console.log(
      `  ${tool.padEnd(15)} https://sepolia.basescan.org/tx/${tx}`,
    );
  }
}

main().catch((err) => {
  console.error("[test] fatal:", err);
  process.exit(1);
});
