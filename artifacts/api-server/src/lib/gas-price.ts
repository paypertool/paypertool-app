import {
  createPublicClient,
  formatGwei,
  formatEther,
  http,
  type Chain,
} from "viem";
import {
  mainnet,
  base,
  arbitrum,
  optimism,
  polygon,
} from "viem/chains";

export type GasPriceResult = {
  chain: string;
  chainId: number;
  blockNumber: string;
  baseFeePerGasGwei: string | null;
  gasPriceGwei: string;
  nativeSymbol: string;
  nativePriceUsd: number | null;
  transferGasLimit: number;
  transferCostNative: string;
  transferCostUsd: number | null;
  fetchedAt: string;
};

export class GasPriceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GasPriceError";
  }
}

const RPC_TIMEOUT_MS = 8_000;
const TRANSFER_GAS_LIMIT = 21_000;

type ChainSpec = {
  chain: Chain;
  envVar: string;
  defaultRpc: string;
  nativeSymbol: string;
  coingeckoId: string;
};

const CHAINS: Record<string, ChainSpec> = {
  ethereum: {
    chain: mainnet,
    envVar: "MAINNET_RPC_URL",
    defaultRpc: "https://eth.llamarpc.com",
    nativeSymbol: "ETH",
    coingeckoId: "ethereum",
  },
  base: {
    chain: base,
    envVar: "BASE_RPC_URL",
    defaultRpc: "https://mainnet.base.org",
    nativeSymbol: "ETH",
    coingeckoId: "ethereum",
  },
  arbitrum: {
    chain: arbitrum,
    envVar: "ARBITRUM_RPC_URL",
    defaultRpc: "https://arb1.arbitrum.io/rpc",
    nativeSymbol: "ETH",
    coingeckoId: "ethereum",
  },
  optimism: {
    chain: optimism,
    envVar: "OPTIMISM_RPC_URL",
    defaultRpc: "https://mainnet.optimism.io",
    nativeSymbol: "ETH",
    coingeckoId: "ethereum",
  },
  polygon: {
    chain: polygon,
    envVar: "POLYGON_RPC_URL",
    defaultRpc: "https://polygon-rpc.com",
    nativeSymbol: "POL",
    coingeckoId: "matic-network",
  },
};

const SUPPORTED = Object.keys(CHAINS);

const clientCache: Record<string, ReturnType<typeof createPublicClient>> = {};
function getClient(spec: ChainSpec) {
  const key = spec.chain.id.toString();
  if (clientCache[key]) return clientCache[key];
  const rpcUrl = process.env[spec.envVar] ?? spec.defaultRpc;
  clientCache[key] = createPublicClient({
    chain: spec.chain,
    transport: http(rpcUrl, { timeout: RPC_TIMEOUT_MS }),
  });
  return clientCache[key];
}

let priceCache: { ts: number; prices: Record<string, number> } | null = null;
const PRICE_CACHE_MS = 60_000;

async function getNativePriceUsd(coingeckoId: string): Promise<number | null> {
  const now = Date.now();
  if (priceCache && now - priceCache.ts < PRICE_CACHE_MS) {
    return priceCache.prices[coingeckoId] ?? null;
  }
  const ids = Array.from(
    new Set(Object.values(CHAINS).map((c) => c.coingeckoId)),
  ).join(",");
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, { usd?: number }>;
    const prices: Record<string, number> = {};
    for (const [k, v] of Object.entries(data)) {
      if (typeof v?.usd === "number") prices[k] = v.usd;
    }
    priceCache = { ts: now, prices };
    return prices[coingeckoId] ?? null;
  } catch {
    return null;
  }
}

export async function getGasPrice(rawChain: string): Promise<GasPriceResult> {
  const chainKey = rawChain.trim().toLowerCase();
  if (!chainKey) {
    throw new GasPriceError(
      `Missing 'chain'. Supported: ${SUPPORTED.join(", ")}`,
      400,
    );
  }
  const spec = CHAINS[chainKey];
  if (!spec) {
    throw new GasPriceError(
      `Unsupported chain '${rawChain}'. Supported: ${SUPPORTED.join(", ")}`,
      400,
    );
  }

  const client = getClient(spec);
  let blockNumber: bigint;
  let block;
  let gasPrice: bigint;
  try {
    [blockNumber, block, gasPrice] = await Promise.all([
      client.getBlockNumber(),
      client.getBlock(),
      client.getGasPrice(),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "RPC call failed";
    throw new GasPriceError(`RPC call failed: ${msg}`, 502);
  }

  const baseFee = block.baseFeePerGas ?? null;
  const transferCostWei = gasPrice * BigInt(TRANSFER_GAS_LIMIT);
  const transferCostNative = formatEther(transferCostWei);

  const nativePriceUsd = await getNativePriceUsd(spec.coingeckoId);
  const transferCostUsd =
    nativePriceUsd !== null
      ? Number(transferCostNative) * nativePriceUsd
      : null;

  return {
    chain: chainKey,
    chainId: spec.chain.id,
    blockNumber: blockNumber.toString(),
    baseFeePerGasGwei: baseFee !== null ? formatGwei(baseFee) : null,
    gasPriceGwei: formatGwei(gasPrice),
    nativeSymbol: spec.nativeSymbol,
    nativePriceUsd,
    transferGasLimit: TRANSFER_GAS_LIMIT,
    transferCostNative,
    transferCostUsd,
    fetchedAt: new Date().toISOString(),
  };
}

export const GAS_PRICE_SUPPORTED_CHAINS = SUPPORTED;
