import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Terminal, ArrowLeft, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Footer } from "@/components/Footer";

type HealthState = "loading" | "live" | "down";

interface Stats {
  calls: number;
  revenueUsd: number;
  since: string;
}

export default function Status() {
  const [health, setHealth] = useState<HealthState>("loading");
  const [stats, setStats] = useState<Stats | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const t0 = performance.now();
      try {
        const [h, s] = await Promise.all([
          fetch("/api/healthz", { cache: "no-store" }),
          fetch("/api/stats", { cache: "no-store" }),
        ]);
        const dt = Math.round(performance.now() - t0);
        if (cancelled) return;
        if (h.ok) {
          setHealth("live");
          setLatencyMs(dt);
        } else {
          setHealth("down");
        }
        if (s.ok) {
          const data = (await s.json()) as Stats;
          if (!cancelled) setStats(data);
        }
        if (!cancelled) setCheckedAt(new Date());
      } catch {
        if (!cancelled) setHealth("down");
      }
    }
    check();
    const id = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div
      className="min-h-screen text-slate-200 relative overflow-hidden"
      style={{
        backgroundColor: "#0B0B1F",
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0B0B1F]/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
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

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">
          System Status
        </h1>
        <p className="text-xs pt-mono text-slate-500 mb-10">
          Live check against the API server. Refreshes every 30s.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <StatusCard
            label="API"
            status={health}
            detail={
              health === "live" && latencyMs !== null
                ? `${latencyMs}ms`
                : health === "down"
                  ? "unreachable"
                  : "checking…"
            }
          />
          <StatusCard
            label="Settlement"
            status={health === "live" ? "live" : "loading"}
            detail="Base mainnet"
          />
          <StatusCard
            label="Facilitator"
            status={health === "live" ? "live" : "loading"}
            detail="x402.org"
          />
        </div>

        {stats && (
          <div className="border border-white/10 rounded-lg bg-white/[0.02] p-6">
            <h2 className="text-sm pt-mono text-slate-400 mb-4 tracking-wide uppercase">
              Lifetime stats
            </h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-3xl font-bold text-white">
                  {stats.calls.toLocaleString()}
                </div>
                <div className="text-xs pt-mono text-slate-500 mt-1">
                  settled calls
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold text-white">
                  ${stats.revenueUsd.toFixed(3)}
                </div>
                <div className="text-xs pt-mono text-slate-500 mt-1">
                  total paid
                </div>
              </div>
            </div>
            <div className="text-[10px] pt-mono text-slate-600 mt-4">
              Counting since {new Date(stats.since).toLocaleDateString()}
            </div>
          </div>
        )}

        {checkedAt && (
          <div className="text-[10px] pt-mono text-slate-600 mt-6 text-center">
            Last check: {checkedAt.toLocaleTimeString()}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

function StatusCard({
  label,
  status,
  detail,
}: {
  label: string;
  status: HealthState;
  detail: string;
}) {
  return (
    <div className="border border-white/10 rounded-lg bg-white/[0.02] p-5">
      <div className="text-xs pt-mono text-slate-400 uppercase tracking-wide mb-3">
        {label}
      </div>
      <div className="flex items-center gap-2">
        {status === "live" && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
        {status === "down" && <XCircle className="w-5 h-5 text-rose-400" />}
        {status === "loading" && <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />}
        <span
          className={
            status === "live"
              ? "text-emerald-300 font-semibold"
              : status === "down"
                ? "text-rose-300 font-semibold"
                : "text-slate-400"
          }
        >
          {status === "live" ? "Live" : status === "down" ? "Down" : "Checking"}
        </span>
      </div>
      <div className="text-xs pt-mono text-slate-500 mt-2">{detail}</div>
    </div>
  );
}
