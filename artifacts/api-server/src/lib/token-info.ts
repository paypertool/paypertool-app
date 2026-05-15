export type TokenInfoResult = {
  address: string;
  chain: string;
  chainId: string | null;
  name: string | null;
  symbol: string | null;
  priceUsd: number | null;
  priceChange24hPct: number | null;
  liquidityUsd: number | null;
  fdvUsd: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  topPair: {
    dex: string;
    pairAddress: string;
    baseToken: { address: string; symbol: string; name: string };
    quoteToken: { address: string; symbol: string; name: string };
    url: string;
  } | null;
  pairCount: number;
  fetchedAt: string;
};

export class TokenInfoError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TokenInfoError";
  }
}

const FETCH_TIMEOUT_MS = 8_000;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

type DexscreenerPair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  url?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  fdv?: number;
  marketCap?: number;
};

type DexscreenerResponse = {
  pairs?: DexscreenerPair[] | null;
};

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function getTokenInfo(
  rawAddress: string,
): Promise<TokenInfoResult> {
  const address = rawAddress.trim();
  if (!address) {
    throw new TokenInfoError("Missing 'address'", 400);
  }
  // Dexscreener supports EVM and Solana; we accept anything matching common
  // shapes, but require either an EVM address or a base58-ish string >= 32 chars.
  const isEvm = ADDRESS_REGEX.test(address);
  const isSol = !isEvm && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  if (!isEvm && !isSol) {
    throw new TokenInfoError(
      "Address must be an EVM address (0x...40 hex) or a Solana base58 address",
      400,
    );
  }

  let res: Response;
  try {
    res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    throw new TokenInfoError(`Dexscreener fetch failed: ${msg}`, 502);
  }
  if (!res.ok) {
    throw new TokenInfoError(
      `Dexscreener returned HTTP ${res.status}`,
      res.status === 404 ? 404 : 502,
    );
  }
  let data: DexscreenerResponse;
  try {
    data = (await res.json()) as DexscreenerResponse;
  } catch {
    throw new TokenInfoError("Dexscreener returned invalid JSON", 502);
  }

  const pairs = Array.isArray(data.pairs) ? data.pairs : [];
  if (pairs.length === 0) {
    throw new TokenInfoError(
      `No DEX pairs found for token ${address}`,
      404,
    );
  }

  const ranked = pairs
    .map((p) => ({ p, liq: num(p.liquidity?.usd) ?? 0 }))
    .sort((a, b) => b.liq - a.liq);
  const best = ranked[0].p;

  const lowerAddr = address.toLowerCase();
  const baseAddr = best.baseToken?.address?.toLowerCase() ?? "";
  const isBaseToken = baseAddr === lowerAddr;
  const tokenSide = isBaseToken ? best.baseToken : best.quoteToken;

  const topPair =
    best.dexId && best.pairAddress && best.baseToken && best.quoteToken
      ? {
          dex: best.dexId,
          pairAddress: best.pairAddress,
          baseToken: {
            address: best.baseToken.address ?? "",
            symbol: best.baseToken.symbol ?? "",
            name: best.baseToken.name ?? "",
          },
          quoteToken: {
            address: best.quoteToken.address ?? "",
            symbol: best.quoteToken.symbol ?? "",
            name: best.quoteToken.name ?? "",
          },
          url: best.url ?? "",
        }
      : null;

  return {
    address,
    chain: best.chainId ?? "unknown",
    chainId: best.chainId ?? null,
    name: tokenSide?.name ?? null,
    symbol: tokenSide?.symbol ?? null,
    priceUsd: num(best.priceUsd),
    priceChange24hPct: num(best.priceChange?.h24),
    liquidityUsd: num(best.liquidity?.usd),
    fdvUsd: num(best.fdv),
    marketCapUsd: num(best.marketCap),
    volume24hUsd: num(best.volume?.h24),
    topPair,
    pairCount: pairs.length,
    fetchedAt: new Date().toISOString(),
  };
}
