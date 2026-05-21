import { Link } from "wouter";
import { Terminal } from "lucide-react";

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/10 bg-[#0B0B1F]/60 backdrop-blur-xl mt-32">
      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-start">
        <div className="flex items-center gap-3">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="font-bold tracking-tight text-white text-sm">
            PayPerTool
          </span>
          <span className="text-xs pt-mono text-slate-500">
            Pay-per-call AI tools in USDC on Base.
          </span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs pt-mono">
          <Link href="/terms" className="text-slate-400 hover:text-cyan-300 transition-colors">
            Terms
          </Link>
          <Link href="/privacy" className="text-slate-400 hover:text-cyan-300 transition-colors">
            Privacy
          </Link>
          <Link href="/status" className="text-slate-400 hover:text-cyan-300 transition-colors">
            Status
          </Link>
          <a
            href="https://github.com/paypertool/paypertool-app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-cyan-300 transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://www.npmjs.com/package/@paypertooldev/paypertool-mcp"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-cyan-300 transition-colors"
          >
            npm
          </a>
        </nav>
      </div>
      <div className="max-w-6xl mx-auto px-6 pb-8 text-[10px] pt-mono text-slate-600">
        x402 settlements are on-chain and final. No accounts, no refunds.
      </div>
    </footer>
  );
}
