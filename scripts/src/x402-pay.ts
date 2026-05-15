import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, formatUnits, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { createSigner } from "x402/types";
import { decodeXPaymentResponse } from "x402/shared";
import { wrapFetchWithPayment } from "x402-fetch";

const WALLET_PATH = resolve(
  process.cwd(),
  "../.local/x402-test-wallet.json",
);
const NETWORK = "base-sepolia";
const USDC_BASE_SEPOLIA =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const SERVER_URL =
  process.env["X402_SERVER_URL"] ?? "http://localhost:80";

type WalletFile = { privateKey: Hex; address: `0x${string}` };

function loadOrCreateWallet(): WalletFile {
  if (existsSync(WALLET_PATH)) {
    const data = JSON.parse(readFileSync(WALLET_PATH, "utf-8")) as WalletFile;
    return data;
  }
  console.log(
    "[setup] No test wallet found. Generating a fresh TESTNET-ONLY wallet...",
  );
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const wallet: WalletFile = { privateKey, address: account.address };
  mkdirSync(dirname(WALLET_PATH), { recursive: true });
  writeFileSync(WALLET_PATH, JSON.stringify(wallet, null, 2));
  console.log(`[setup] Wallet saved to: ${WALLET_PATH}`);
  return wallet;
}

async function checkBalances(address: `0x${string}`) {
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });
  const ethBalance = await client.getBalance({ address });
  const usdcBalance = (await client.readContract({
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
    args: [address],
  })) as bigint;
  return {
    ethFormatted: formatUnits(ethBalance, 18),
    usdcFormatted: formatUnits(usdcBalance, 6),
    ethRaw: ethBalance,
    usdcRaw: usdcBalance,
  };
}

function printSetupInstructions(address: `0x${string}`) {
  console.log("");
  console.log("================================================================");
  console.log("  TESTNET FUNDING NEEDED  (USDC only — no ETH required!)");
  console.log("================================================================");
  console.log(`  Test wallet address: ${address}`);
  console.log("");
  console.log("  x402 uses EIP-3009 gasless transfers. The facilitator pays");
  console.log("  the on-chain gas, so this wallet only needs USDC, NOT ETH.");
  console.log("");
  console.log("  Get Base Sepolia USDC (testnet, free, no signup, no ETH needed):");
  console.log("     https://faucet.circle.com");
  console.log("     -> Select Network: 'Base Sepolia'");
  console.log("     -> Token: USDC");
  console.log(`     -> Address: ${address}`);
  console.log("");
  console.log("  You'll get 10 USDC testnet (= 2000 calls at $0.005 each).");
  console.log("  Wait ~30 seconds after requesting, then re-run this script.");
  console.log("================================================================");
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] ?? "scrape";

  const wallet = loadOrCreateWallet();
  console.log(`[wallet] address = ${wallet.address}`);
  console.log(`[wallet] network = ${NETWORK}`);

  const balances = await checkBalances(wallet.address);
  console.log(
    `[wallet] balance: ${balances.ethFormatted} ETH | ${balances.usdcFormatted} USDC`,
  );

  if (cmd === "setup" || cmd === "wallet") {
    if (balances.usdcRaw === 0n) {
      printSetupInstructions(wallet.address);
    } else {
      console.log("[setup] Wallet has USDC and is ready to pay.");
      if (balances.ethRaw === 0n) {
        console.log(
          "[setup] (ETH balance is 0 — that's fine. x402 is gasless for the client.)",
        );
      }
    }
    return;
  }

  if (balances.usdcRaw === 0n) {
    console.error("\n[error] Wallet has 0 USDC on Base Sepolia. Cannot pay.");
    printSetupInstructions(wallet.address);
    process.exit(1);
  }

  const targetUrl = args[1] ?? "https://example.com";
  console.log(`[req] POST ${SERVER_URL}/api/tools/scrape  url=${targetUrl}`);

  const signer = await createSigner(NETWORK, wallet.privateKey);
  const fetchWithPay = wrapFetchWithPayment(fetch, signer);

  const t0 = Date.now();
  const res = await fetchWithPay(`${SERVER_URL}/api/tools/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: targetUrl }),
  });
  const elapsed = Date.now() - t0;

  console.log(`[res] HTTP ${res.status} (${elapsed}ms)`);

  const xPaymentResponse = res.headers.get("x-payment-response");
  if (xPaymentResponse) {
    try {
      const decoded = decodeXPaymentResponse(xPaymentResponse);
      console.log("[settlement]", JSON.stringify(decoded, null, 2));
      const txHash = (decoded as { transaction?: string }).transaction;
      if (txHash) {
        console.log(
          `[explorer] https://sepolia.basescan.org/tx/${txHash}`,
        );
      }
    } catch (err) {
      console.warn("[settlement] failed to decode X-PAYMENT-RESPONSE", err);
    }
  } else {
    console.log("[settlement] no X-PAYMENT-RESPONSE header on response");
  }

  if (!res.ok) {
    const text = await res.text();
    console.error(`[error] body: ${text}`);
    process.exit(1);
  }

  const body = (await res.json()) as {
    title: string | null;
    finalUrl: string;
    contentLength: number;
    markdown: string;
  };

  console.log("");
  console.log("================ SCRAPED RESULT ================");
  console.log(`  title:  ${body.title}`);
  console.log(`  url:    ${body.finalUrl}`);
  console.log(`  bytes:  ${body.contentLength}`);
  console.log("------------------ MARKDOWN --------------------");
  console.log(body.markdown.slice(0, 600));
  if (body.markdown.length > 600) {
    console.log(`... (${body.markdown.length - 600} more chars)`);
  }
  console.log("================================================");

  const after = await checkBalances(wallet.address);
  const usdcSpent = balances.usdcRaw - after.usdcRaw;
  console.log(
    `[wallet] post-balance: ${after.ethFormatted} ETH | ${after.usdcFormatted} USDC`,
  );
  console.log(
    `[wallet] spent on this call: ${formatUnits(usdcSpent, 6)} USDC`,
  );
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
