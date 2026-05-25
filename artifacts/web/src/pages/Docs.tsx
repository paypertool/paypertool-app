import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Terminal, ArrowLeft, AlertTriangle, Copy, Check } from "lucide-react";
import { Footer } from "@/components/Footer";

interface Tool {
  id: string;
  method: "GET" | "POST";
  path: string;
  price: string;
  description: string;
  inputs: Record<string, string>;
  outputSchema: Record<string, string>;
}

interface ToolsResponse {
  network: string;
  payTo: string;
  tools: Tool[];
}

export default function Docs() {
  const [data, setData] = useState<ToolsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tools", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ToolsResponse) => setData(d))
      .catch((e) => setError(String(e)));
  }, []);

  const origin = useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : ""),
    [],
  );

  return (
    <div
      className="min-h-screen text-slate-200 relative overflow-hidden"
      style={{
        backgroundColor: "#0B0B1F",
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0B0B1F]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Terminal className="w-5 h-5 text-cyan-400" />
            <span className="font-bold tracking-tight text-white">PayPerTool</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs pt-mono text-slate-400 hover:text-cyan-300"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </Link>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-10">
        <aside className="hidden lg:block sticky top-24 self-start">
          <div className="text-xs pt-mono text-slate-500 uppercase tracking-wide mb-3">
            Tools
          </div>
          <nav className="flex flex-col gap-1.5 text-sm">
            {data?.tools.map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                className="text-slate-400 hover:text-cyan-300 transition-colors pt-mono text-xs"
              >
                {t.id}
              </a>
            ))}
          </nav>
        </aside>

        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-2">
            API Docs
          </h1>
          <p className="text-sm text-slate-400 mb-8">
            Live catalog generated from <code className="text-cyan-300">/api/tools</code> — the single source of truth.
          </p>

          {data && (
            <div className="border border-white/10 rounded-lg bg-white/[0.02] p-5 mb-10 grid grid-cols-1 md:grid-cols-3 gap-4">
              <Meta label="Network" value={data.network} />
              <Meta label="Settlement" value="x402 / EIP-3009" />
              <Meta label="payTo" value={short(data.payTo)} mono />
            </div>
          )}

          <div className="border border-amber-500/20 bg-amber-500/[0.04] rounded-lg p-4 mb-10 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-100/90 leading-relaxed">
              <strong className="text-amber-200">How payment works:</strong> first
              call returns <code className="text-amber-300">402 Payment Required</code>{" "}
              with the exact USDC amount and recipient. Re-send the same request
              with an <code className="text-amber-300">X-PAYMENT</code> header
              containing a signed EIP-3009 authorization. Use{" "}
              <code className="text-amber-300">x402-fetch</code>,{" "}
              <code className="text-amber-300">x402-axios</code>, or the official
              MCP client.
            </div>
          </div>

          {error && (
            <div className="border border-rose-500/30 bg-rose-500/5 rounded-lg p-4 text-rose-300 text-sm mb-10">
              Failed to load /api/tools: {error}
            </div>
          )}

          {!data && !error && (
            <div className="text-slate-500 text-sm">Loading catalog…</div>
          )}

          <div className="space-y-10">
            {data?.tools.map((tool) => (
              <ToolBlock key={tool.id} tool={tool} origin={origin} />
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] pt-mono text-slate-500 uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className={mono ? "text-sm pt-mono text-cyan-300" : "text-sm text-white font-semibold"}>
        {value}
      </div>
    </div>
  );
}

function short(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function ToolBlock({ tool, origin }: { tool: Tool; origin: string }) {
  const isAgentMemory = tool.id.startsWith("agent_memory");
  const exampleBody = useMemo(() => buildExampleBody(tool), [tool]);
  const curlCmd = useMemo(
    () => buildCurl(tool, origin, exampleBody),
    [tool, origin, exampleBody],
  );

  return (
    <section
      id={tool.id}
      className="border border-white/10 rounded-lg bg-white/[0.02] overflow-hidden scroll-mt-24"
    >
      <header className="px-6 py-5 border-b border-white/10 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold text-white tracking-tight pt-mono">
          {tool.id}
        </h2>
        <span className="text-[10px] pt-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
          {tool.method}
        </span>
        <span className="text-xs pt-mono text-slate-400">{tool.path}</span>
        <span className="ml-auto text-sm pt-mono font-semibold text-emerald-300">
          {tool.price}
        </span>
      </header>

      <div className="px-6 py-5 space-y-5">
        <p className="text-sm text-slate-300 leading-relaxed">{tool.description}</p>

        {isAgentMemory && (
          <div className="border border-amber-500/40 bg-amber-500/[0.06] rounded p-3 flex gap-2 text-xs text-amber-100/90">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-200">Public KV — no authentication.</strong>{" "}
              Anyone who knows or guesses your <code className="text-amber-300">namespace</code> + <code className="text-amber-300">key</code> can read or overwrite the value.
              <strong> Never store secrets, PII, credentials, private keys, or any data you would not publish to a public bulletin board.</strong> Use a long random key (UUID or your wallet address as namespace).
            </div>
          </div>
        )}

        <SchemaTable title="Inputs" rows={tool.inputs} />
        <SchemaTable title="Response" rows={tool.outputSchema} />

        <CodeBlock title="Example (curl, after payment)" code={curlCmd} />
      </div>
    </section>
  );
}

function SchemaTable({ title, rows }: { title: string; rows: Record<string, string> }) {
  const entries = Object.entries(rows);
  if (!entries.length) return null;
  return (
    <div>
      <div className="text-[10px] pt-mono text-slate-500 uppercase tracking-wide mb-2">
        {title}
      </div>
      <div className="border border-white/5 rounded overflow-hidden">
        <table className="w-full text-xs pt-mono">
          <tbody>
            {entries.map(([k, v], i) => (
              <tr
                key={k}
                className={i % 2 === 0 ? "bg-white/[0.015]" : "bg-transparent"}
              >
                <td className="px-3 py-2 text-cyan-300 align-top w-1/3 whitespace-nowrap">
                  {k}
                </td>
                <td className="px-3 py-2 text-slate-400 align-top break-words">
                  {v}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] pt-mono text-slate-500 uppercase tracking-wide">
          {title}
        </div>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex items-center gap-1 text-[10px] pt-mono text-slate-400 hover:text-cyan-300"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="text-xs pt-mono bg-black/40 border border-white/10 rounded p-3 overflow-x-auto text-slate-300 leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

function buildExampleBody(tool: Tool): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(tool.inputs)) {
    if (/optional/i.test(v)) continue;
    out[k] = exampleValue(tool.id, k, v);
  }
  return out;
}

function exampleValue(toolId: string, key: string, descr: string): unknown {
  const lk = key.toLowerCase();
  if (lk === "url") return "https://example.com";
  if (lk === "videourl") return "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  if (lk === "query") return "x402 protocol";
  if (lk === "input" && toolId === "ens_resolve") return "vitalik.eth";
  if (lk === "chain") return "base";
  if (lk === "address" && toolId === "rugcheck")
    return "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  if (lk === "address") return "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  if (lk === "namespace") return "0xYourWallet";
  if (lk === "key") return "session-abc-123";
  if (lk === "value") return { note: "any json" };
  if (lk === "schema") return { title: { type: "string" } };
  if (/number/i.test(descr)) return 10;
  return "string";
}

function buildCurl(tool: Tool, origin: string, body: Record<string, unknown>): string {
  const base = origin || "https://web-production-d8897.up.railway.app";
  const json = JSON.stringify(body, null, 2);
  if (tool.method === "GET") {
    return `curl -H "X-PAYMENT: <signed-eip3009-authorization>" \\\n  ${base}${tool.path}`;
  }
  return `curl -X POST ${base}${tool.path} \\\n  -H "Content-Type: application/json" \\\n  -H "X-PAYMENT: <signed-eip3009-authorization>" \\\n  -d '${json.replace(/'/g, "'\\''")}'`;
}
