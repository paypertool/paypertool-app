import type { Address } from "viem";
import type { Network, RoutesConfig } from "x402-express";
import { isExtractEnabled } from "./extract";
import { isSearchEnabled } from "./search";
import { isAgentMemoryEnabled } from "./agent-memory";

export const PAY_TO_ADDRESS =
  "0xF99d7a5ACe9D89c7b01799981823d2264C7380e5" as Address;

export const X402_NETWORK: Network =
  (process.env["X402_NETWORK"] as Network | undefined) ?? "base-sepolia";

export type ToolDescriptor = {
  id: string;
  method: "GET" | "POST";
  path: string;
  price: string;
  description: string;
  inputs: Record<string, string>;
  outputSchema: Record<string, string>;
};

const ALL_TOOLS: ToolDescriptor[] = [
  {
    id: "scrape_url",
    method: "POST",
    path: "/api/tools/scrape",
    price: "$0.005",
    description:
      "Fetch a public URL and return clean markdown plus the page title.",
    inputs: {
      url: "string (http(s) URL)",
    },
    outputSchema: {
      url: "string",
      finalUrl: "string",
      status: "number",
      title: "string|null",
      markdown: "string",
      contentLength: "number",
      fetchedAt: "ISO 8601 string",
    },
  },
  {
    id: "search_web",
    method: "POST",
    path: "/api/tools/search",
    price: "$0.01",
    description:
      "Search the public web (Google results via Serper.dev) and return up to 10 results (title, url, snippet).",
    inputs: {
      query: "string (search query, max 500 chars)",
      limit: "number (optional, 1-10, default 10)",
    },
    outputSchema: {
      query: "string",
      provider: "string",
      results: "array of { title, url, snippet }",
      fetchedAt: "ISO 8601 string",
    },
  },
  {
    id: "screenshot",
    method: "POST",
    path: "/api/tools/screenshot",
    price: "$0.005",
    description:
      "Capture a screenshot of a public URL and return it as a base64-encoded image (PNG or JPEG depending on backend).",
    inputs: {
      url: "string (http(s) URL)",
      width: "number (optional, 320-2000, default 1280)",
      height: "number (optional, 240-2000, default 800)",
    },
    outputSchema: {
      url: "string",
      width: "number",
      height: "number",
      contentType: "string (image/png or image/jpeg)",
      imageBase64: "string (base64-encoded image)",
      byteLength: "number",
      provider: "string",
      fetchedAt: "ISO 8601 string",
    },
  },
  {
    id: "extract_data",
    method: "POST",
    path: "/api/tools/extract",
    price: "$0.02",
    description:
      "Fetch a URL and extract structured JSON from the page contents matching a caller-supplied JSON schema. Uses an LLM under the hood.",
    inputs: {
      url: "string (http(s) URL)",
      schema: "object (JSON Schema describing desired output)",
      instructions: "string (optional, extraction goal in plain English)",
    },
    outputSchema: {
      url: "string",
      finalUrl: "string",
      schema: "object (echo of input schema)",
      data: "object (extracted, conforms to schema)",
      model: "string",
      promptTokens: "number",
      completionTokens: "number",
      fetchedAt: "ISO 8601 string",
    },
  },
  {
    id: "youtube_transcript",
    method: "POST",
    path: "/api/tools/youtube-transcript",
    price: "$0.01",
    description:
      "Fetch the auto/manual caption transcript for a YouTube video without an API key. Returns segments with timestamps plus the full concatenated text.",
    inputs: {
      videoUrl: "string (YouTube watch/short/embed URL or 11-char video ID)",
      language: "string (optional, ISO language code like 'en' or 'ro')",
    },
    outputSchema: {
      videoId: "string",
      videoUrl: "string",
      language: "string|null",
      segments: "array of { text, startSec, durationSec }",
      fullText: "string",
      totalSeconds: "number",
      fetchedAt: "ISO 8601 string",
    },
  },
  {
    id: "og_metadata",
    method: "POST",
    path: "/api/tools/og-metadata",
    price: "$0.002",
    description:
      "Fetch a URL and return its Open Graph and Twitter card metadata: title, description, image, site name, type, canonical, favicon.",
    inputs: {
      url: "string (http(s) URL)",
    },
    outputSchema: {
      url: "string",
      finalUrl: "string",
      title: "string|null",
      description: "string|null",
      image: "string|null (absolute URL)",
      siteName: "string|null",
      type: "string|null",
      locale: "string|null",
      canonical: "string|null",
      favicon: "string|null",
      og: "object (raw og:* values, key without prefix)",
      twitter: "object (raw twitter:* values, key without prefix)",
      fetchedAt: "ISO 8601 string",
    },
  },
  {
    id: "ens_resolve",
    method: "POST",
    path: "/api/tools/ens-resolve",
    price: "$0.002",
    description:
      "Resolve an ENS name to an Ethereum address (forward) OR an Ethereum address to its primary ENS name (reverse). Includes ENS avatar when available.",
    inputs: {
      input: "string (ENS name like 'vitalik.eth' OR 0x EVM address)",
    },
    outputSchema: {
      input: "string",
      type: "'name' | 'address'",
      name: "string|null (normalized ENS name)",
      address: "string|null (0x EVM address)",
      avatar: "string|null (avatar URL if set)",
      fetchedAt: "ISO 8601 string",
    },
  },
  {
    id: "gas_price",
    method: "POST",
    path: "/api/tools/gas-price",
    price: "$0.002",
    description:
      "Current gas price for a major EVM chain (ethereum, base, arbitrum, optimism, polygon). Includes USD cost of a standard 21k-gas transfer using live native-token price.",
    inputs: {
      chain:
        "string (one of: ethereum, base, arbitrum, optimism, polygon)",
    },
    outputSchema: {
      chain: "string",
      chainId: "number",
      blockNumber: "string (decimal)",
      baseFeePerGasGwei: "string|null",
      gasPriceGwei: "string",
      nativeSymbol: "string (ETH or POL)",
      nativePriceUsd: "number|null",
      transferGasLimit: "number (21000)",
      transferCostNative: "string (in native units)",
      transferCostUsd: "number|null",
      fetchedAt: "ISO 8601 string",
    },
  },
  {
    id: "rugcheck",
    method: "POST",
    path: "/api/tools/rugcheck",
    price: "$0.02",
    description:
      "Token risk score for an EVM token contract via GoPlus security data. Returns a 0-100 score, risk level, and a list of severity-ranked flags (honeypot, mint, hidden owner, LP locked %, top-holder concentration, taxes, etc.). 8 chains supported.",
    inputs: {
      chain:
        "string (one of: ethereum, bsc, base, arbitrum, optimism, polygon, avalanche, fantom)",
      address: "string (0x EVM token contract address)",
    },
    outputSchema: {
      chain: "string",
      chainId: "string",
      address: "string",
      name: "string|null",
      symbol: "string|null",
      totalSupply: "string|null",
      holderCount: "number|null",
      riskScore: "number (0-100)",
      riskLevel: "'low' | 'medium' | 'high' | 'critical'",
      flags:
        "array of { code, severity: 'critical'|'high'|'medium'|'low'|'info', message }",
      taxes: "{ buy: number|null, sell: number|null }",
      ownership:
        "{ owner, creator, ownerPercent, creatorPercent }",
      liquidity: "{ lpHolderCount, lpLockedPercent }",
      raw: "object (full GoPlus payload)",
      source: "'goplus'",
      fetchedAt: "ISO 8601 string",
    },
  },
  {
    id: "agent_memory_set",
    method: "POST",
    path: "/api/tools/memory-set",
    price: "$0.001",
    description:
      "Persistent KV store for stateless agents — store any JSON value (<=4KB) under (namespace, key) for up to 90 days. There is NO authentication: anyone who guesses both namespace and key can read or overwrite. Use your wallet address + a long random key.",
    inputs: {
      namespace: "string (1-128 chars, recommended: your wallet address)",
      key: "string (1-256 chars, recommended: a UUID or similar)",
      value: "any JSON-serializable value (<= 4KB serialized)",
      ttlSeconds:
        "number (optional, 60..7776000, default 2592000 = 30 days)",
    },
    outputSchema: {
      namespace: "string",
      key: "string",
      bytes: "number (serialized size)",
      expiresAt: "ISO 8601 string",
      createdAt: "ISO 8601 string",
      updatedAt: "ISO 8601 string",
      fetchedAt: "ISO 8601 string",
    },
  },
  {
    id: "agent_memory_get",
    method: "POST",
    path: "/api/tools/memory-get",
    price: "$0.0005",
    description:
      "Retrieve a previously-stored value from agent memory. 404 if not set or expired.",
    inputs: {
      namespace: "string",
      key: "string",
    },
    outputSchema: {
      namespace: "string",
      key: "string",
      value: "any (the stored JSON value)",
      createdAt: "ISO 8601 string",
      updatedAt: "ISO 8601 string",
      expiresAt: "ISO 8601 string",
      fetchedAt: "ISO 8601 string",
    },
  },
  {
    id: "token_info",
    method: "POST",
    path: "/api/tools/token-info",
    price: "$0.005",
    description:
      "Token info for any EVM or Solana token contract via Dexscreener. Returns price, 24h change, liquidity, FDV, market cap, volume, and the top trading pair.",
    inputs: {
      address: "string (EVM 0x...40-hex OR Solana base58 address)",
    },
    outputSchema: {
      address: "string",
      chain: "string",
      chainId: "string|null",
      name: "string|null",
      symbol: "string|null",
      priceUsd: "number|null",
      priceChange24hPct: "number|null",
      liquidityUsd: "number|null",
      fdvUsd: "number|null",
      marketCapUsd: "number|null",
      volume24hUsd: "number|null",
      topPair: "object|null { dex, pairAddress, baseToken, quoteToken, url }",
      pairCount: "number",
      fetchedAt: "ISO 8601 string",
    },
  },
];

function isToolEnabled(tool: ToolDescriptor): boolean {
  if (tool.id === "search_web") return isSearchEnabled();
  if (tool.id === "extract_data") return isExtractEnabled();
  if (tool.id === "agent_memory_set" || tool.id === "agent_memory_get") {
    return isAgentMemoryEnabled();
  }
  return true;
}

export const TOOLS: ToolDescriptor[] = ALL_TOOLS.filter(isToolEnabled);

export const x402Routes: RoutesConfig = Object.fromEntries(
  TOOLS.map((tool) => [
    `${tool.method} ${tool.path}`,
    {
      price: tool.price,
      network: X402_NETWORK,
      config: {
        description: tool.description,
      },
    },
  ]),
);
