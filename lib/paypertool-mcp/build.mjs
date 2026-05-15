import { build } from "esbuild";
import { chmodSync } from "node:fs";

const shared = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false,
  minify: false,
  external: [
    "@modelcontextprotocol/sdk",
    "viem",
    "x402",
    "x402-fetch",
    "zod",
  ],
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
};

await build({
  ...shared,
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
});

await build({
  ...shared,
  entryPoints: ["src/cli.ts"],
  outfile: "dist/cli.js",
  banner: {
    js: "#!/usr/bin/env node\n" + shared.banner.js,
  },
});

chmodSync("dist/cli.js", 0o755);
console.log("[paypertool-mcp] built dist/index.js + dist/cli.js");
