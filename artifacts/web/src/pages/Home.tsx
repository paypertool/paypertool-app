import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Footer } from "@/components/Footer";
import {
  ArrowRight,
  Copy,
  ExternalLink,
  Terminal,
  Search,
  Image as ImageIcon,
  Database,
  Globe,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

type Stats = { calls: number; revenueUsd: number; since: string };

async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${API_BASE_URL}/api/stats`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`stats ${res.status}`);
  return res.json();
}

function useAnimatedNumber(target: number, durationMs = 800): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    fromRef.current = value;
    startRef.current = null;
    let raf = 0;
    const tick = (t: number) => {
      if (startRef.current === null) startRef.current = t;
      const p = Math.min(1, (t - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(fromRef.current + (target - fromRef.current) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return value;
}

function scrollToInstall() {
  document.getElementById("install")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

type Tool = {
  id: string;
  method: string;
  path: string;
  price: string;
  description: string;
};

type ToolsResponse = {
  network: string;
  payTo: string;
  tools: Tool[];
};

const ICON_BY_ID: Record<string, typeof Globe> = {
  scrape_url: Globe,
  search_web: Search,
  screenshot: ImageIcon,
  extract_data: Database,
};

const FALLBACK_ICON = Globe;

const RECEIVER_WALLET = "0xD54173d0708d16bBe17A8a1156e66460aE872Ff7";

const CODE_SNIPPET = `{
  "mcpServers": {
    "paypertool": {
      "command": "npx",
      "args": ["-y", "@paypertool/mcp"],
      "env": {
        "PAYPERTOOL_PRIVATE_KEY": "0x...",
        "PAYPERTOOL_BASE_URL": "https://web-production-a4921.up.railway.app",
        "PAYPERTOOL_NETWORK": "base"
      }
    }
  }
}`;

function fmtAddress(addr: string) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function basescanUrl(network: string, address: string) {
  const base =
    network === "base"
      ? "https://basescan.org"
      : "https://sepolia.basescan.org";
  return `${base}/address/${address}`;
}

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? ""
).replace(/\/$/, "");

async function fetchTools(): Promise<ToolsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/tools`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Failed to load tools (${res.status})`);
  }
  return res.json();
}

export default function Home() {
  const [copied, setCopied] = useState<"ok" | "err" | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["paypertool", "tools"],
    queryFn: fetchTools,
    staleTime: 60_000,
    retry: 1,
  });

  const { data: statsData } = useQuery({
    queryKey: ["paypertool", "stats"],
    queryFn: fetchStats,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  });

  const tools = data?.tools ?? [];
  const network = data?.network ?? "base";
  const payTo = data?.payTo ?? RECEIVER_WALLET;
  const isTestnet = network !== "base";

  const animatedCalls = useAnimatedNumber(statsData?.calls ?? 0);
  const animatedRevenue = useAnimatedNumber(statsData?.revenueUsd ?? 0);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(CODE_SNIPPET);
      setCopied("ok");
    } catch {
      setCopied("err");
    }
    setTimeout(() => setCopied(null), 2000);
  };

  useEffect(() => {
    document.title = "PayPerTool — Pay-per-call AI tools. No signup.";
  }, []);

  const networkLabel = useMemo(
    () => network.replace(/-/g, " ").toUpperCase(),
    [network],
  );

  return (
    <div
      className="min-h-screen text-slate-200 relative overflow-hidden selection:bg-cyan-500/30 selection:text-cyan-100"
      style={{
        backgroundColor: "#0B0B1F",
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

        .pt-mono { font-family: 'JetBrains Mono', monospace; }

        .pt-mesh-bg {
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(circle at 15% 50%, rgba(139, 92, 246, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 85% 30%, rgba(6, 182, 212, 0.15) 0%, transparent 50%);
          z-index: 0;
          pointer-events: none;
        }

        @keyframes pt-float1 {
          0%   { transform: translate(0, 0)      scale(1);   }
          33%  { transform: translate(30px,-50px) scale(1.1); }
          66%  { transform: translate(-20px,20px) scale(0.9); }
          100% { transform: translate(0, 0)      scale(1);   }
        }
        @keyframes pt-float2 {
          0%   { transform: translate(0, 0)       scale(1);   }
          33%  { transform: translate(-30px,40px) scale(0.9); }
          66%  { transform: translate(20px,-20px) scale(1.1); }
          100% { transform: translate(0, 0)       scale(1);   }
        }
        .pt-orb-1 { animation: pt-float1 15s ease-in-out infinite; }
        .pt-orb-2 { animation: pt-float2 18s ease-in-out infinite; }

        .pt-glass {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          transition: all 0.3s ease;
        }
        .pt-glass:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(6, 182, 212, 0.3);
          box-shadow: 0 0 20px rgba(6, 182, 212, 0.1);
        }

        .pt-shimmer {
          background: linear-gradient(90deg, #8B5CF6 0%, #06B6D4 50%, #8B5CF6 100%);
          background-size: 200% auto;
          color: transparent;
          -webkit-background-clip: text;
          background-clip: text;
          animation: pt-shimmer 3s linear infinite;
        }
        @keyframes pt-shimmer { to { background-position: 200% center; } }

        .pt-step-line {
          position: absolute;
          width: 2px;
          background: linear-gradient(to bottom, rgba(6,182,212,0.5), rgba(139,92,246,0.5));
          box-shadow: 0 0 8px rgba(6,182,212,0.5);
          z-index: 0;
        }
      `}</style>

      <div className="pt-mesh-bg" />

      {/* Orbs */}
      <div className="absolute top-[20%] left-[10%] w-96 h-96 bg-purple-600/20 rounded-full blur-[100px] pt-orb-1 pointer-events-none" />
      <div className="absolute bottom-[20%] right-[10%] w-[30rem] h-[30rem] bg-cyan-500/10 rounded-full blur-[100px] pt-orb-2 pointer-events-none" />
      {/* Trust strip — facilitator + network */}
      <div className="relative z-50 border-b border-emerald-500/20 bg-emerald-500/[0.04] backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 py-2 flex items-center justify-center gap-2 text-[11px] pt-mono text-emerald-200/90 tracking-wide">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="hidden sm:inline">Payments settled via</span>
          <a
            href="https://github.com/coinbase/x402"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-emerald-400/40 underline-offset-2 hover:text-emerald-100 hover:decoration-emerald-300"
          >
            Coinbase x402 facilitator
          </a>
          <span>on</span>
          <a
            href="https://basescan.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-emerald-400/40 underline-offset-2 hover:text-emerald-100 hover:decoration-emerald-300"
          >
            Base mainnet
          </a>
        </div>
      </div>
      {/* Sticky Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0B0B1F]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
          {/* Brand + status */}
          <div className="flex items-center gap-3 shrink-0">
            <Terminal className="w-5 h-5 text-cyan-400" />
            <span className="font-bold tracking-tight text-white">
              PayPerTool
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] uppercase pt-mono tracking-wider bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
              </span>
              {isTestnet ? "Live · Testnet" : "Live · Base"}
            </span>
          </div>

          {/* Mini-nav */}
          <div className="hidden md:flex items-center gap-6 text-sm pt-mono text-slate-400">
            <a
              href="#tools"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("tools")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="hover:text-white transition-colors"
            >
              Tools
            </a>
            <a
              href="https://github.com/ttcarter38-max/paypertool"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-colors"
            >
              Docs
            </a>
            <a
              href="https://www.npmjs.com/package/@paypertool/mcp"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-colors"
            >
              npm
            </a>
          </div>

          {/* Live counter + CTA */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden lg:flex items-baseline gap-2 pt-mono text-xs text-slate-400">
              <span className="text-cyan-300 font-semibold tabular-nums">
                {Math.floor(animatedCalls).toLocaleString()}
              </span>
              <span>calls</span>
              <span className="text-slate-600">·</span>
              <span className="text-emerald-300 font-semibold tabular-nums">
                ${animatedRevenue.toFixed(animatedRevenue < 10 ? 3 : 2)}
              </span>
              <span>paid</span>
            </div>
            <button
              type="button"
              onClick={scrollToInstall}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs pt-mono font-semibold bg-gradient-to-r from-cyan-400 to-purple-400 text-[#0B0B1F] hover:from-cyan-300 hover:to-purple-300 transition-all shadow-lg shadow-cyan-500/20"
            >
              Get the MCP
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-20 lg:py-32">
        {/* Hero */}
        <div className="max-w-3xl mx-auto text-center space-y-8 mb-32">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full pt-glass text-sm pt-mono text-cyan-300 border-cyan-500/30 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Designed for AI Agents
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-white leading-[1.1]">
            Pay-per-call AI tools.
            <br />
            <span className="pt-shimmer">No signup. Just a wallet.</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Equip your MCP clients, LangChain agents, and autonomous bots with
            native capabilities. Powered by the{" "}
            <span className="text-slate-200">x402 protocol</span>. Settles in{" "}
            <span className="text-slate-200">USDC on Base</span>.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button
              type="button"
              onClick={() =>
                document
                  .getElementById("install")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
              className="w-full sm:w-auto bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold text-base h-12 px-8 border border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all hover:shadow-[0_0_25px_rgba(6,182,212,0.6)] cursor-pointer"
            >
              Get the MCP server
            </button>
            <button
              type="button"
              onClick={() =>
                document
                  .getElementById("tools")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
              className="w-full sm:w-auto h-12 px-8 border border-white/20 text-white hover:bg-white/5 hover:border-white/40 font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              View tools <ArrowRight className="w-4 h-4 opacity-70" />
            </button>
          </div>
        </div>

        {/* Tools Catalog */}
        <div id="tools" className="mb-32 scroll-mt-24">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold text-white tracking-tight">
              Active Endpoints
            </h2>
            <div className="text-sm pt-mono text-slate-500">
              Live on {network}
            </div>
          </div>

          {isLoading && (
            <div className="grid md:grid-cols-2 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="pt-glass p-6 rounded-xl h-40 animate-pulse"
                />
              ))}
            </div>
          )}

          {isError && (
            <div className="pt-glass p-6 rounded-xl flex items-start gap-3 text-amber-200 border-amber-500/30">
              <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-amber-400" />
              <div className="text-sm">
                Couldn't reach the discovery endpoint at{" "}
                <code className="pt-mono text-amber-300">/api/tools</code>. The
                catalog will appear once the server is reachable.
              </div>
            </div>
          )}

          {!isLoading && !isError && tools.length === 0 && (
            <div className="pt-glass p-6 rounded-xl text-slate-300 text-sm">
              No tools are currently advertised. Check the server's environment
              configuration (some tools are gated by API keys).
            </div>
          )}

          {!isLoading && !isError && tools.length > 0 && (
            <div className="grid md:grid-cols-2 gap-4">
              {tools.map((tool) => {
                const Icon = ICON_BY_ID[tool.id] ?? FALLBACK_ICON;
                return (
                  <div
                    key={tool.id}
                    className="pt-glass p-6 rounded-xl group relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                      <Icon className="w-24 h-24 text-cyan-400" />
                    </div>
                    <div className="relative z-10 flex flex-col h-full">
                      <div className="flex items-start justify-between mb-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-xl font-bold text-white tracking-tight">
                              {tool.id}
                            </h3>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase pt-mono tracking-wider bg-[#2775CA]/10 text-[#2775CA] border border-[#2775CA]/30">
                              USDC
                            </span>
                          </div>
                          <div className="pt-mono text-xs text-cyan-400/80 bg-cyan-500/10 inline-block px-2 py-0.5 rounded">
                            <span className="text-purple-400 mr-1">
                              {tool.method}
                            </span>
                            {tool.path}
                          </div>
                        </div>
                        <div className="text-xl pt-mono text-white tracking-tight group-hover:text-cyan-300 transition-colors drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]">
                          {tool.price}
                        </div>
                      </div>
                      <p className="text-sm text-slate-400 leading-relaxed mt-auto max-w-[85%]">
                        {tool.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-16 mb-32">
          {/* Install Snippet */}
          <div id="install" className="space-y-6 scroll-mt-24">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold text-white tracking-tight">
                Equip Your Agent
              </h2>
              <p className="text-slate-400">
                Discover tools at{" "}
                <code className="text-cyan-300 pt-mono text-sm">
                  /api/tools
                </code>
                . Agent signs EIP-3009 authorizations and pays autonomously per
                call.
              </p>
            </div>
                        <div className="flex flex-wrap items-center gap-2">
              <a
                href="https://www.npmjs.com/package/@paypertooldev/paypertool-mcp"
                target="_blank"
                rel="noopener noreferrer"
                title="Built and signed on GitHub Actions"
              >
                <img
                  src="https://img.shields.io/npm/v/@paypertooldev/paypertool-mcp?logo=npm&label=npm%20%7C%20provenance&color=06b6d4"
                  alt="npm version with provenance"
                  className="h-5"
                />
              </a>
            </div>

            <div className="pt-glass rounded-xl overflow-hidden border-amber-500/20">
              <div className="px-4 py-2 border-b border-amber-500/20 bg-amber-500/5 text-xs pt-mono text-amber-300 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                Hot wallet — never use a key holding significant funds. For
                production, use a managed signer (CDP Wallet, Privy, Turnkey).
              </div>
              <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-black/40">
                <span className="text-xs pt-mono text-slate-500">
                  claude_desktop_config.json
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="text-slate-400 hover:text-white transition-colors"
                  title="Copy code"
                  aria-label="Copy install snippet"
                >
                  {copied === "ok" ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                  ) : copied === "err" ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <pre className="p-6 overflow-x-auto text-sm pt-mono text-slate-300 leading-relaxed">
                <code>{CODE_SNIPPET}</code>
              </pre>
            </div>
          </div>

          {/* How x402 works */}
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold text-white tracking-tight">
                How x402 Works
              </h2>
              <p className="text-slate-400">
                Gasless micro-settlements over HTTP.
              </p>
            </div>

            <div className="relative pl-8 space-y-8">
              <div className="pt-step-line left-[11px] top-6 bottom-6" />

              <div className="relative z-10 pt-glass p-5 rounded-lg border-l-2 border-l-cyan-500">
                <div className="absolute -left-[45px] top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#0B0B1F] border-2 border-cyan-500 flex items-center justify-center text-xs font-bold text-cyan-500 pt-mono">
                  1
                </div>
                <div className="pt-mono text-xs text-cyan-400 mb-1">
                  HTTP 402 Payment Required
                </div>
                <p className="text-sm text-slate-300">
                  Agent calls a paid endpoint. Server returns 402 with payment
                  requirements.
                </p>
              </div>

              <div className="relative z-10 pt-glass p-5 rounded-lg border-l-2 border-l-purple-500">
                <div className="absolute -left-[45px] top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#0B0B1F] border-2 border-purple-500 flex items-center justify-center text-xs font-bold text-purple-500 pt-mono">
                  2
                </div>
                <div className="pt-mono text-xs text-purple-400 mb-1">
                  EIP-3009 Authorization
                </div>
                <p className="text-sm text-slate-300">
                  Agent signs a USDC authorization with its hot wallet. Gasless
                  — no ETH needed.
                </p>
              </div>

              <div className="relative z-10 pt-glass p-5 rounded-lg border-l-2 border-l-green-500">
                <div className="absolute -left-[45px] top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#0B0B1F] border-2 border-green-500 flex items-center justify-center text-xs font-bold text-green-500 pt-mono">
                  3
                </div>
                <div className="pt-mono text-xs text-green-400 mb-1">
                  HTTP 200 OK
                </div>
                <p className="text-sm text-slate-300">
                  Agent retries with X-PAYMENT header. Facilitator settles on
                  Base. Server returns result.
                </p>
              </div>
            </div>
          </div>
        </div>

        {isTestnet && (
          <div className="pt-glass rounded-xl p-4 mb-12 text-center text-sm text-amber-200 border-amber-500/20">
            Currently running on <span className="pt-mono">{network}</span>. No
            real value moves. Mainnet launch coming next.
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 bg-black/20 backdrop-blur-sm py-12">
        <div className="max-w-6xl mx-auto px-6 space-y-8">
          {/* Top row: brand + payments wallet + spec links */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-1 text-center md:text-left">
              <div className="font-bold text-white tracking-tight flex items-center justify-center md:justify-start gap-2">
                Built on Base. Settles in USDC.
              </div>
              <div className="text-xs pt-mono text-slate-500">
                {isTestnet ? "Currently on Base Sepolia (testnet)" : "Live on Base mainnet"}
              </div>
            </div>

            <div className="flex items-center gap-6 text-sm text-slate-400 pt-mono">
              <a
                href="https://x402.org"
                target="_blank"
                rel="noreferrer"
                className="hover:text-white transition-colors"
              >
                x402 Spec
              </a>
              <a
                href="https://github.com/coinbase/x402"
                target="_blank"
                rel="noreferrer"
                className="hover:text-white transition-colors"
              >
                GitHub
              </a>
              <a
                href="https://www.npmjs.com/package/@paypertool/mcp"
                target="_blank"
                rel="noreferrer"
                className="hover:text-white transition-colors"
              >
                npm
              </a>
            </div>
          </div>

          {/* Wallet transparency row */}
          <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="text-xs pt-mono text-slate-500 leading-relaxed">
              All payments settle on-chain to:
              <br className="sm:hidden" />
              <a
                href={basescanUrl(network, payTo)}
                target="_blank"
                rel="noreferrer"
                className="ml-0 sm:ml-2 inline-flex items-center gap-1 text-cyan-400/80 hover:text-cyan-300 transition-colors"
              >
                {payTo}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="text-[10px] pt-mono text-slate-600 uppercase tracking-wider">
              No signup. No API keys.
            </div>
          </div>
        </div>
       </footer>
       <Footer />
     </div>
  );
}
