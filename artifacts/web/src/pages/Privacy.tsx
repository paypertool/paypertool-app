import { Link } from "wouter";
import { Terminal, ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";

export default function Privacy() {
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
          Privacy Policy
        </h1>
        <p className="text-xs pt-mono text-slate-500 mb-10">
          Last updated: 2026-05-21
        </p>

        <section className="space-y-6 text-sm text-slate-300 leading-relaxed">
          <p>
            PayPerTool is built for AI agents and machine-to-machine
            payments. There are no user accounts, no signups, and no
            personal identifiers collected.
          </p>

          <h2 className="text-xl font-semibold text-white pt-4">1. What we log</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Request path (e.g. <code className="text-cyan-300">/api/tools/scrape_url</code>)</li>
            <li>Timestamp</li>
            <li>HTTP status code</li>
            <li>Settled payment transaction hash (public on Base mainnet)</li>
            <li>Aggregated counter of total settled calls (visible at <code className="text-cyan-300">/api/stats</code>)</li>
          </ul>

          <h2 className="text-xl font-semibold text-white pt-4">2. What we do NOT log</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Response bodies (scraped content, search results, extracted data — never stored)</li>
            <li>Full request bodies beyond what is required to execute the tool</li>
            <li>IP addresses beyond transient infrastructure logs (rotated by hosting provider)</li>
            <li>Buyer wallet addresses (visible on-chain only)</li>
            <li>Any cookies, fingerprints, or tracking identifiers</li>
          </ul>

          <h2 className="text-xl font-semibold text-white pt-4">3. agent_memory tool</h2>
          <p>
            <strong>The <code className="text-cyan-300">agent_memory</code> tool stores key-value data publicly, with no authentication.</strong>
            Anyone who knows or guesses your key can read or overwrite it.
            <strong> Never use it for secrets, PII, credentials, or any data
            you would not publish to a public bulletin board.</strong>
          </p>

          <h2 className="text-xl font-semibold text-white pt-4">4. Third parties</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Coinbase x402 facilitator</strong> — verifies and settles payments on-chain. Sees the transaction details only.</li>
            <li><strong>Base mainnet</strong> — payment transactions are public on-chain.</li>
            <li><strong>OpenRouter / LLM provider</strong> — receives the extract prompts when you call <code className="text-cyan-300">extract</code>. Bound by their privacy policy.</li>
            <li><strong>Serper</strong> — receives search queries when you call <code className="text-cyan-300">web_search</code>. Bound by their privacy policy.</li>
            <li><strong>Railway</strong> — hosting provider. Bound by their privacy policy.</li>
          </ul>

          <h2 className="text-xl font-semibold text-white pt-4">5. Contact</h2>
          <p>
            Privacy questions or removal requests:{" "}
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
