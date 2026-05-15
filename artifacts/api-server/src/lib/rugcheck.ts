export type RugcheckFlag = {
  code: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  message: string;
};

export type RugcheckResult = {
  chain: string;
  chainId: string;
  address: string;
  name: string | null;
  symbol: string | null;
  totalSupply: string | null;
  holderCount: number | null;
  riskScore: number; // 0-100
  riskLevel: "low" | "medium" | "high" | "critical";
  flags: RugcheckFlag[];
  taxes: {
    buy: number | null;
    sell: number | null;
  };
  ownership: {
    owner: string | null;
    creator: string | null;
    ownerPercent: number | null;
    creatorPercent: number | null;
  };
  liquidity: {
    lpHolderCount: number | null;
    lpLockedPercent: number | null;
  };
  raw: unknown;
  source: "goplus";
  fetchedAt: string;
};

export class RugcheckError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RugcheckError";
  }
}

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const FETCH_TIMEOUT_MS = 10_000;

const CHAINS: Record<string, string> = {
  ethereum: "1",
  bsc: "56",
  base: "8453",
  arbitrum: "42161",
  optimism: "10",
  polygon: "137",
  avalanche: "43114",
  fantom: "250",
};

const SUPPORTED = Object.keys(CHAINS);

type GoPlusToken = {
  token_name?: string;
  token_symbol?: string;
  total_supply?: string;
  holder_count?: string;
  is_open_source?: string;
  is_proxy?: string;
  is_mintable?: string;
  owner_change_balance?: string;
  can_take_back_ownership?: string;
  hidden_owner?: string;
  selfdestruct?: string;
  external_call?: string;
  is_in_dex?: string;
  buy_tax?: string;
  sell_tax?: string;
  cannot_buy?: string;
  cannot_sell_all?: string;
  slippage_modifiable?: string;
  is_honeypot?: string;
  transfer_pausable?: string;
  trading_cooldown?: string;
  is_anti_whale?: string;
  anti_whale_modifiable?: string;
  is_blacklisted?: string;
  is_whitelisted?: string;
  is_in_cex?: { listed?: string };
  lp_holder_count?: string;
  lp_total_supply?: string;
  lp_holders?: Array<{
    address?: string;
    balance?: string;
    percent?: string;
    is_locked?: number;
  }>;
  holders?: Array<{
    address?: string;
    percent?: string;
  }>;
  creator_address?: string;
  creator_balance?: string;
  creator_percent?: string;
  owner_address?: string;
  owner_balance?: string;
  owner_percent?: string;
};

function num(s: string | undefined | null): number | null {
  if (s === undefined || s === null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function bool(s: string | undefined | null): boolean | null {
  if (s === undefined || s === null || s === "") return null;
  return s === "1";
}

function isZeroOwner(addr: string | undefined | null): boolean {
  if (!addr) return true;
  const lower = addr.toLowerCase();
  return (
    lower === "0x0000000000000000000000000000000000000000" ||
    lower === "0x000000000000000000000000000000000000dead"
  );
}

function computeRisk(t: GoPlusToken): {
  score: number;
  flags: RugcheckFlag[];
} {
  const flags: RugcheckFlag[] = [];
  let score = 0;
  const add = (
    code: string,
    severity: RugcheckFlag["severity"],
    message: string,
    weight: number,
  ) => {
    flags.push({ code, severity, message });
    score += weight;
  };

  if (bool(t.is_honeypot) === true) {
    add("honeypot", "critical", "Token is a honeypot (cannot sell)", 100);
  }
  if (bool(t.cannot_sell_all) === true) {
    add(
      "cannot_sell_all",
      "critical",
      "Holders cannot sell their entire balance",
      80,
    );
  }
  if (bool(t.cannot_buy) === true) {
    add("cannot_buy", "critical", "Token cannot currently be bought", 60);
  }
  if (bool(t.selfdestruct) === true) {
    add("selfdestruct", "critical", "Contract has selfdestruct", 50);
  }
  if (bool(t.owner_change_balance) === true) {
    add(
      "owner_change_balance",
      "critical",
      "Owner can arbitrarily change holder balances",
      60,
    );
  }
  if (bool(t.hidden_owner) === true) {
    add("hidden_owner", "high", "Contract has a hidden owner", 30);
  }
  if (bool(t.can_take_back_ownership) === true) {
    add(
      "can_take_back_ownership",
      "high",
      "Renounced ownership can be taken back",
      30,
    );
  }
  if (bool(t.is_open_source) === false) {
    add(
      "not_open_source",
      "high",
      "Contract source is not verified on the explorer",
      30,
    );
  }
  if (bool(t.is_proxy) === true) {
    add(
      "proxy",
      "medium",
      "Contract is a proxy (logic can be swapped by owner)",
      15,
    );
  }
  if (
    bool(t.is_mintable) === true &&
    !isZeroOwner(t.owner_address)
  ) {
    add(
      "mintable_with_owner",
      "high",
      "Token is mintable and owner is not renounced",
      30,
    );
  }
  if (bool(t.transfer_pausable) === true) {
    add("transfer_pausable", "high", "Transfers can be paused by owner", 20);
  }
  if (bool(t.slippage_modifiable) === true) {
    add(
      "slippage_modifiable",
      "medium",
      "Slippage / fees can be modified by owner",
      10,
    );
  }
  if (bool(t.trading_cooldown) === true) {
    add("trading_cooldown", "medium", "Trading cooldown enabled", 5);
  }
  if (bool(t.is_blacklisted) === true) {
    add("blacklist", "high", "Owner can blacklist addresses", 20);
  }

  const buyTax = num(t.buy_tax);
  const sellTax = num(t.sell_tax);
  if (buyTax !== null && buyTax > 0.1) {
    add(
      "high_buy_tax",
      buyTax > 0.25 ? "critical" : "high",
      `Buy tax is ${(buyTax * 100).toFixed(1)}%`,
      Math.min(40, Math.floor(buyTax * 100)),
    );
  }
  if (sellTax !== null && sellTax > 0.1) {
    add(
      "high_sell_tax",
      sellTax > 0.25 ? "critical" : "high",
      `Sell tax is ${(sellTax * 100).toFixed(1)}%`,
      Math.min(50, Math.floor(sellTax * 150)),
    );
  }

  const ownerPct = num(t.owner_percent);
  const creatorPct = num(t.creator_percent);
  if (ownerPct !== null && ownerPct > 0.2) {
    add(
      "owner_concentration",
      ownerPct > 0.5 ? "high" : "medium",
      `Owner holds ${(ownerPct * 100).toFixed(1)}% of supply`,
      Math.floor(ownerPct * 30),
    );
  }
  if (creatorPct !== null && creatorPct > 0.2) {
    add(
      "creator_concentration",
      creatorPct > 0.5 ? "high" : "medium",
      `Creator holds ${(creatorPct * 100).toFixed(1)}% of supply`,
      Math.floor(creatorPct * 30),
    );
  }

  let lpLockedPercent: number | null = null;
  if (t.lp_holders && t.lp_holders.length > 0) {
    let lockedSum = 0;
    let total = 0;
    for (const h of t.lp_holders) {
      const p = num(h.percent);
      if (p === null) continue;
      total += p;
      if (h.is_locked === 1) lockedSum += p;
    }
    lpLockedPercent = total > 0 ? lockedSum / total : 0;
    if (lpLockedPercent === 0 && total > 0) {
      add("lp_unlocked", "critical", "Liquidity is not locked at all", 40);
    } else if (lpLockedPercent !== null && lpLockedPercent < 0.5) {
      add(
        "lp_partially_locked",
        "high",
        `Only ${(lpLockedPercent * 100).toFixed(0)}% of LP is locked`,
        25,
      );
    }
  }

  if (t.holders && t.holders.length > 0) {
    const top10 = t.holders
      .slice(0, 10)
      .map((h) => num(h.percent) ?? 0)
      .reduce((a, b) => a + b, 0);
    if (top10 > 0.7) {
      add(
        "top10_concentration",
        top10 > 0.9 ? "high" : "medium",
        `Top 10 holders own ${(top10 * 100).toFixed(0)}% of supply`,
        Math.floor((top10 - 0.5) * 30),
      );
    }
  }

  const holderCount = num(t.holder_count);
  if (holderCount !== null && holderCount < 50) {
    add(
      "low_holders",
      "medium",
      `Only ${holderCount} holders so far`,
      10,
    );
  }

  if (bool(t.is_in_dex) === false) {
    add("not_in_dex", "info", "Token is not listed on any DEX yet", 0);
  }

  if (flags.length === 0) {
    flags.push({
      code: "no_flags",
      severity: "info",
      message: "No risk flags detected by the GoPlus heuristics",
    });
  }

  score = Math.min(100, score);
  return { score, flags };
}

function levelOf(score: number): RugcheckResult["riskLevel"] {
  if (score >= 80) return "critical";
  if (score >= 50) return "high";
  if (score >= 20) return "medium";
  return "low";
}

export async function rugcheck(
  rawChain: string,
  rawAddress: string,
): Promise<RugcheckResult> {
  const chainKey = rawChain.trim().toLowerCase();
  const chainId = CHAINS[chainKey];
  if (!chainId) {
    throw new RugcheckError(
      `Unsupported chain '${rawChain}'. Supported: ${SUPPORTED.join(", ")}`,
      400,
    );
  }
  const address = rawAddress.trim();
  if (!ADDRESS_REGEX.test(address)) {
    throw new RugcheckError(
      "Address must be a 0x-prefixed 40-hex EVM address",
      400,
    );
  }

  let res: Response;
  try {
    res = await fetch(
      `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${encodeURIComponent(address)}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    throw new RugcheckError(`GoPlus fetch failed: ${msg}`, 502);
  }
  if (!res.ok) {
    throw new RugcheckError(`GoPlus returned HTTP ${res.status}`, 502);
  }

  let data;
  try {
    data = (await res.json()) as {
      code?: number;
      message?: string;
      result?: Record<string, GoPlusToken>;
    };
  } catch {
    throw new RugcheckError("GoPlus returned invalid JSON", 502);
  }
  if (data.code !== 1 || !data.result) {
    throw new RugcheckError(
      `GoPlus error: ${data.message ?? "unknown"} (code ${data.code ?? "?"})`,
      502,
    );
  }
  const lookupKey = address.toLowerCase();
  let token = data.result[lookupKey] ?? data.result[address];
  if (!token) {
    for (const [k, v] of Object.entries(data.result)) {
      if (k.toLowerCase() === lookupKey) {
        token = v;
        break;
      }
    }
  }
  if (!token || Object.keys(token).length === 0) {
    throw new RugcheckError(
      `No token data for ${address} on chain ${chainKey} (token may be too new or unindexed)`,
      404,
    );
  }

  const { score, flags } = computeRisk(token);

  return {
    chain: chainKey,
    chainId,
    address,
    name: token.token_name ?? null,
    symbol: token.token_symbol ?? null,
    totalSupply: token.total_supply ?? null,
    holderCount: num(token.holder_count),
    riskScore: score,
    riskLevel: levelOf(score),
    flags,
    taxes: {
      buy: num(token.buy_tax),
      sell: num(token.sell_tax),
    },
    ownership: {
      owner: token.owner_address ?? null,
      creator: token.creator_address ?? null,
      ownerPercent: num(token.owner_percent),
      creatorPercent: num(token.creator_percent),
    },
    liquidity: {
      lpHolderCount: num(token.lp_holder_count),
      lpLockedPercent: (() => {
        if (!token.lp_holders || token.lp_holders.length === 0) return null;
        let lockedSum = 0;
        let total = 0;
        for (const h of token.lp_holders) {
          const p = num(h.percent);
          if (p === null) continue;
          total += p;
          if (h.is_locked === 1) lockedSum += p;
        }
        return total > 0 ? lockedSum / total : null;
      })(),
    },
    raw: token,
    source: "goplus",
    fetchedAt: new Date().toISOString(),
  };
}

export const RUGCHECK_SUPPORTED_CHAINS = SUPPORTED;
