import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createSigner } from "x402/types";
import { decodeXPaymentResponse } from "x402/shared";
import { wrapFetchWithPayment } from "x402-fetch";
import type { Hex } from "viem";

export type PayPerToolMcpConfig = {
  privateKey: Hex;
  serverUrl: string;
  network: string;
  maxValueAtomic?: bigint;
};

type RemoteToolDescriptor = {
  id: string;
  method: "GET" | "POST";
  path: string;
  price: string;
  description: string;
  inputs: Record<string, string>;
  outputSchema: Record<string, string>;
};

type DiscoveryResponse = {
  network: string;
  payTo: string;
  tools: RemoteToolDescriptor[];
};

type SettlementInfo = {
  transaction?: string;
  network?: string;
  payer?: string;
};

type McpToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const TOOL_INPUT_SCHEMAS: Record<string, Record<string, unknown>> = {
  scrape_url: {
    type: "object",
    required: ["url"],
    properties: {
      url: {
        type: "string",
        description: "The http(s) URL of the page to fetch and convert",
      },
    },
  },
  search_web: {
    type: "object",
    required: ["query"],
    properties: {
      query: {
        type: "string",
        description: "Search query (max 500 chars)",
      },
      limit: {
        type: "number",
        description: "Max results to return (1-10, default 10)",
      },
    },
  },
  screenshot: {
    type: "object",
    required: ["url"],
    properties: {
      url: {
        type: "string",
        description: "The http(s) URL to capture",
      },
      width: {
        type: "number",
        description: "Viewport width in pixels (320-2000, default 1280)",
      },
      height: {
        type: "number",
        description: "Viewport height in pixels (240-2000, default 800)",
      },
    },
  },
  extract_data: {
    type: "object",
    required: ["url", "schema"],
    properties: {
      url: {
        type: "string",
        description: "The http(s) URL of the page to extract data from",
      },
      schema: {
        type: "object",
        description:
          "JSON Schema describing the desired output object shape. The LLM is required to produce data matching this schema.",
      },
      instructions: {
        type: "string",
        description:
          "Optional plain-English description of what to extract and how",
      },
    },
  },
  youtube_transcript: {
    type: "object",
    required: ["url"],
    properties: {
      url: {
        type: "string",
        description:
          "YouTube video URL or 11-char video id (https://youtube.com/watch?v=..., youtu.be/..., or just the id)",
      },
      lang: {
        type: "string",
        description: "Optional ISO 639-1 language code (e.g. 'en', 'ro')",
      },
    },
  },
  og_metadata: {
    type: "object",
    required: ["url"],
    properties: {
      url: {
        type: "string",
        description:
          "The http(s) URL to fetch — returns Open Graph + Twitter card meta tags (title, description, image, etc.)",
      },
    },
  },
  ens_resolve: {
    type: "object",
    required: ["name"],
    properties: {
      name: {
        type: "string",
        description: "ENS name to resolve to a 0x address (e.g. 'vitalik.eth')",
      },
    },
  },
  gas_price: {
    type: "object",
    required: ["chain"],
    properties: {
      chain: {
        type: "string",
        description:
          "One of: ethereum, base, arbitrum, optimism, polygon — returns current gas price in gwei + USD cost for a 21000-gas transfer",
      },
    },
  },
  token_info: {
    type: "object",
    required: ["address"],
    properties: {
      address: {
        type: "string",
        description:
          "EVM (0x...) or Solana token contract address. Returns price, 24h change, liquidity, FDV, market cap, top pair via Dexscreener.",
      },
    },
  },
  rugcheck: {
    type: "object",
    required: ["chain", "address"],
    properties: {
      chain: {
        type: "string",
        description:
          "One of: ethereum, bsc, base, arbitrum, optimism, polygon, avalanche, fantom",
      },
      address: {
        type: "string",
        description: "EVM token contract address (0x + 40 hex)",
      },
    },
  },
  agent_memory_set: {
    type: "object",
    required: ["namespace", "key", "value"],
    properties: {
      namespace: {
        type: "string",
        description:
          "Capability identifier — recommended: your wallet address. 1-128 chars. Anyone who knows (namespace, key) can read/overwrite.",
      },
      key: {
        type: "string",
        description: "1-256 chars. Recommended: a UUID or other long random string.",
      },
      value: {
        description:
          "Any JSON-serializable value (max 4KB serialized). Stored as-is and returned verbatim by agent_memory_get.",
      },
      ttlSeconds: {
        type: "number",
        description:
          "Seconds until the value expires. 60..7776000 (90 days). Default 2592000 (30 days).",
      },
    },
  },
  agent_memory_get: {
    type: "object",
    required: ["namespace", "key"],
    properties: {
      namespace: {
        type: "string",
        description: "Same namespace string used in agent_memory_set.",
      },
      key: {
        type: "string",
        description: "Same key string used in agent_memory_set.",
      },
    },
  },
};

function decodeSettlement(header: string | null): SettlementInfo | null {
  if (!header) return null;
  try {
    return decodeXPaymentResponse(header) as SettlementInfo;
  } catch {
    return null;
  }
}

function metaFromSettlement(s: SettlementInfo | null) {
  if (!s) return undefined;
  return {
    "x402.transaction": s.transaction,
    "x402.network": s.network,
    "x402.payer": s.payer,
  };
}

function summariseScrape(body: {
  title: string | null;
  finalUrl: string;
  contentLength: number;
  markdown: string;
}, s: SettlementInfo | null): string {
  return [
    `# ${body.title ?? "(no title)"}`,
    `Source: ${body.finalUrl}`,
    `Bytes: ${body.contentLength}`,
    s?.transaction
      ? `Settled on ${s.network} | tx: ${s.transaction}`
      : "",
    "",
    "---",
    "",
    body.markdown,
  ]
    .filter(Boolean)
    .join("\n");
}

function summariseSearch(
  body: {
    query: string;
    provider: string;
    results: Array<{ title: string; url: string; snippet: string }>;
  },
  s: SettlementInfo | null,
): string {
  const lines: string[] = [
    `# Search results for: ${body.query}`,
    `Provider: ${body.provider} | ${body.results.length} results`,
  ];
  if (s?.transaction) {
    lines.push(`Settled on ${s.network} | tx: ${s.transaction}`);
  }
  lines.push("");
  body.results.forEach((r, i) => {
    lines.push(`## ${i + 1}. ${r.title}`);
    lines.push(r.url);
    if (r.snippet) lines.push(r.snippet);
    lines.push("");
  });
  return lines.join("\n");
}

function summariseScreenshot(
  body: {
    url: string;
    width: number;
    height: number;
    contentType: string;
    byteLength: number;
  },
  s: SettlementInfo | null,
): string {
  return [
    `# Screenshot of ${body.url}`,
    `Size: ${body.width}x${body.height} | ${body.byteLength} bytes (${body.contentType})`,
    s?.transaction
      ? `Settled on ${s.network} | tx: ${s.transaction}`
      : "",
    "",
    "(Image returned as base64 in the imageBase64 field of the structured tool result.)",
  ]
    .filter(Boolean)
    .join("\n");
}

function summariseExtract(
  body: {
    finalUrl: string;
    data: Record<string, unknown>;
    model: string;
    promptTokens: number;
    completionTokens: number;
  },
  s: SettlementInfo | null,
): string {
  return [
    `# Extracted data from ${body.finalUrl}`,
    `Model: ${body.model} | tokens: ${body.promptTokens} in / ${body.completionTokens} out`,
    s?.transaction
      ? `Settled on ${s.network} | tx: ${s.transaction}`
      : "",
    "",
    "```json",
    JSON.stringify(body.data, null, 2),
    "```",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function createPayPerToolServer(config: PayPerToolMcpConfig) {
  const signer = await createSigner(config.network, config.privateKey);
  const fetchWithPay = wrapFetchWithPayment(
    fetch,
    signer,
    config.maxValueAtomic,
  );

  const server = new Server(
    { name: "paypertool", version: "0.1.1" },
    { capabilities: { tools: {} } },
  );

  let cachedDiscovery: DiscoveryResponse | null = null;
  async function discover(): Promise<DiscoveryResponse> {
    if (cachedDiscovery) return cachedDiscovery;
    const res = await fetch(`${config.serverUrl}/api/tools`);
    if (!res.ok) {
      throw new Error(
        `discovery failed: ${res.status} ${res.statusText}`,
      );
    }
    cachedDiscovery = (await res.json()) as DiscoveryResponse;
    return cachedDiscovery;
  }

  async function buildToolList(): Promise<McpToolDef[]> {
    let discovery: DiscoveryResponse;
    try {
      discovery = await discover();
    } catch {
      return [];
    }
    return discovery.tools
      .map((t) => {
        const schema = TOOL_INPUT_SCHEMAS[t.id];
        if (!schema) return null;
        return {
          name: t.id,
          description: `${t.description} Costs ${t.price} in USDC on ${discovery.network} per call. Payment is automatic via x402; no human approval needed at call time.`,
          inputSchema: schema,
        } as McpToolDef;
      })
      .filter((t): t is McpToolDef => t !== null);
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: await buildToolList() };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    let discovery: DiscoveryResponse;
    try {
      discovery = await discover();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [
          { type: "text", text: `Failed to reach PayPerTool server: ${msg}` },
        ],
      };
    }

    const tool = discovery.tools.find((t) => t.id === name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
      };
    }

    try {
      const res = await fetchWithPay(
        `${config.serverUrl}${tool.path}`,
        {
          method: tool.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args ?? {}),
        },
      );

      const settlement = decodeSettlement(res.headers.get("x-payment-response"));

      if (!res.ok) {
        const text = await res.text();
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `${name} failed (HTTP ${res.status}): ${text}`,
            },
          ],
          _meta: metaFromSettlement(settlement),
        };
      }

      const body = (await res.json()) as Record<string, unknown>;

      let textSummary: string;
      const meta = metaFromSettlement(settlement);

      switch (name) {
        case "scrape_url":
          textSummary = summariseScrape(
            body as never,
            settlement,
          );
          break;
        case "search_web":
          textSummary = summariseSearch(body as never, settlement);
          break;
        case "screenshot":
          textSummary = summariseScreenshot(body as never, settlement);
          break;
        case "extract_data":
          textSummary = summariseExtract(body as never, settlement);
          break;
        default:
          textSummary = JSON.stringify(body, null, 2);
      }

      // For screenshot, also return the raw image as an MCP image content
      // block so MCP-aware UIs can render it inline.
      if (name === "screenshot") {
        const image = body["imageBase64"];
        const mime =
          (body["contentType"] as string | undefined) || "image/png";
        if (typeof image === "string") {
          return {
            content: [
              { type: "text", text: textSummary },
              { type: "image", data: image, mimeType: mime },
            ],
            _meta: meta,
          };
        }
      }

      return {
        content: [{ type: "text", text: textSummary }],
        _meta: meta,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: `${name} internal error: ${msg}` }],
      };
    }
  });

  return server;
}

export async function runStdioServer(config: PayPerToolMcpConfig) {
  const server = await createPayPerToolServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
