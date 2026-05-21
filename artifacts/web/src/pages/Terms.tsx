import { Link } from "wouter";
import { Terminal, ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";

export default function Terms() {
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
          Terms of Service
        </h1>
        <p className="text-xs pt-mono text-slate-500 mb-10">
          Last updated: 2026-05-21
        </p>

        <section className="space-y-6 text-sm text-slate-300 leading-relaxed">
          <p>
            PayPerTool is an experimental pay-per-call API gateway for AI
            agents. By calling any endpoint listed at{" "}
            <code className="text-cyan-300">/api/tools</code> you agree to
            these terms.
          </p>

          <h2 className="text-xl font-semibold text-white pt-4">1. Service "as is"</h2>
          <p>
            The service is provided <strong>as is</strong>, with no warranty
            of fitness, accuracy, availability, or merchantability. We do not
            guarantee uptime, response correctness, or that the service will
            continue to exist tomorrow. Build dependencies accordingly.
          </p>

          <h2 className="text-xl font-semibold text-white pt-4">2. Payments are final</h2>
          <p>
            Calls are settled on-chain via the x402 protocol on Base mainnet
            in USDC. Once an HTTP <code className="text-cyan-300">200</code>{" "}
            response is returned, the payment is settled and{" "}
            <strong>not refundable</strong> under any circumstance. We do not
            hold custody of funds — settlement is direct, on-chain, between
            your wallet and ours. If a call fails (4xx/5xx) the payment is
            not captured.
          </p>

          <h2 className="text-xl font-semibold text-white pt-4">3. Prohibited uses</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Scraping behind authentication walls or paywalls.</li>
            <li>Targeting hosts you do not own or have permission to query.</li>
            <li>Storing or transmitting PII, secrets, credentials, or private keys via tools (especially <code className="text-cyan-300">agent_memory</code>, which is public).</li>
            <li>High-volume abuse intended to deny service to others.</li>
            <li>Any use in violation of applicable laws in your jurisdiction.</li>
          </ul>

          <h2 className="text-xl font-semibold text-white pt-4">4. Changes & discontinuation</h2>
          <p>
            We may change pricing, add or remove tools, or shut the service
            down at any time. Material changes will be reflected at{" "}
            <code className="text-cyan-300">/api/tools</code> (single source
            of truth) and on this page.
          </p>

          <h2 className="text-xl font-semibold text-white pt-4">5. Liability</h2>
          <p>
            To the maximum extent permitted by law, PayPerTool and its
            operators are not liable for any direct, indirect, incidental, or
            consequential damages arising from use of the service.
          </p>

          <h2 className="text-xl font-semibold text-white pt-4">6. Contact</h2>
          <p>
            Issues, abuse reports, or questions:{" "}
            <a
              href="https://github.com/paypertool/paypertool-app/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-300 underline decoration-cyan-500/40"
            >
              open a GitHub issue
            </a>
            .
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
