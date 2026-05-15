import { runStdioServer } from "./index.js";
import type { Hex } from "viem";

function readEnv(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  if (fallback !== undefined) return fallback;
  process.stderr.write(
    `[paypertool-mcp] Missing required env var: ${name}\n`,
  );
  process.exit(1);
}

function readEnvAny(names: string[], fallback?: string): string {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.length > 0) return v;
  }
  if (fallback !== undefined) return fallback;
  process.stderr.write(
    `[paypertool-mcp] Missing required env var (any of): ${names.join(", ")}\n`,
  );
  process.exit(1);
}

function readPrivateKey(): Hex {
  const raw = readEnv("PAYPERTOOL_PRIVATE_KEY");
  const hex = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    process.stderr.write(
      "[paypertool-mcp] PAYPERTOOL_PRIVATE_KEY must be a 32-byte hex string\n",
    );
    process.exit(1);
  }
  return hex as Hex;
}

async function main() {
  const config = {
    privateKey: readPrivateKey(),
    serverUrl: readEnvAny(
      ["PAYPERTOOL_BASE_URL", "PAYPERTOOL_SERVER_URL"],
      "https://web-production-a4921.up.railway.app",
    ),
    network: readEnv("PAYPERTOOL_NETWORK", "base"),
  };
  await runStdioServer(config);
}

main().catch((err) => {
  process.stderr.write(`[paypertool-mcp] fatal: ${String(err)}\n`);
  process.exit(1);
});
