import { createPublicClient, http, isAddress, type Address } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

export type EnsResolveResult = {
  input: string;
  type: "name" | "address";
  name: string | null;
  address: string | null;
  avatar: string | null;
  fetchedAt: string;
};

export class EnsResolveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "EnsResolveError";
  }
}

const TIMEOUT_MS = 8_000;

let cachedClient: ReturnType<typeof createPublicClient> | null = null;
function getClient() {
  if (cachedClient) return cachedClient;
  const rpcUrl =
    process.env["MAINNET_RPC_URL"] ?? "https://eth.llamarpc.com";
  cachedClient = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl, { timeout: TIMEOUT_MS }),
  });
  return cachedClient;
}

function looksLikeEnsName(input: string): boolean {
  return /\.[a-z0-9-]+$/i.test(input) && !input.startsWith("0x");
}

export async function resolveEns(rawInput: string): Promise<EnsResolveResult> {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new EnsResolveError("Missing 'input' (ENS name or address)", 400);
  }

  const client = getClient();
  const fetchedAt = new Date().toISOString();

  if (isAddress(trimmed)) {
    const address = trimmed as Address;
    let name: string | null = null;
    try {
      name = await client.getEnsName({ address });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "RPC call failed";
      throw new EnsResolveError(`Reverse ENS lookup failed: ${msg}`, 502);
    }
    let avatar: string | null = null;
    if (name) {
      try {
        avatar = await client.getEnsAvatar({ name: normalize(name) });
      } catch {
        avatar = null;
      }
    }
    return {
      input: rawInput,
      type: "address",
      name,
      address,
      avatar,
      fetchedAt,
    };
  }

  if (!looksLikeEnsName(trimmed)) {
    throw new EnsResolveError(
      "Input must be an ENS name (e.g. vitalik.eth) or 0x address",
      400,
    );
  }

  let normalized: string;
  try {
    normalized = normalize(trimmed);
  } catch {
    throw new EnsResolveError("Invalid ENS name (failed normalization)", 400);
  }

  let address: string | null = null;
  try {
    const res = await client.getEnsAddress({ name: normalized });
    address = res ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "RPC call failed";
    throw new EnsResolveError(`Forward ENS lookup failed: ${msg}`, 502);
  }
  if (!address) {
    throw new EnsResolveError(`No address record set for ${normalized}`, 404);
  }
  let avatar: string | null = null;
  try {
    avatar = await client.getEnsAvatar({ name: normalized });
  } catch {
    avatar = null;
  }

  return {
    input: rawInput,
    type: "name",
    name: normalized,
    address,
    avatar,
    fetchedAt,
  };
}
