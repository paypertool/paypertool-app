import TurndownService from "turndown";
import { safeFetch, UrlGuardError } from "./url-guard";

export type ScrapeResult = {
  url: string;
  finalUrl: string;
  status: number;
  title: string | null;
  markdown: string;
  contentLength: number;
  fetchedAt: string;
};

export class ScrapeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ScrapeError";
  }
}

const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; PayPerToolBot/0.1; +https://paypertool.dev)";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

turndown.remove(["script", "style", "noscript", "iframe", "svg"]);

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  return match[1].trim().replace(/\s+/g, " ").slice(0, 300) || null;
}

function stripBoilerplate(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

export async function scrapeUrl(rawUrl: string): Promise<ScrapeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await safeFetch(rawUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof UrlGuardError) {
      throw new ScrapeError(err.message, err.status);
    }
    const msg = err instanceof Error ? err.message : "fetch failed";
    throw new ScrapeError(`Fetch failed: ${msg}`, 502);
  }
  clearTimeout(timeout);

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("xml")) {
    throw new ScrapeError(
      `Unsupported content-type: ${contentType || "unknown"}`,
      415,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ScrapeError("Empty response body", 502);
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      throw new ScrapeError("Response too large (>2MB)", 413);
    }
    chunks.push(value);
  }

  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const html = buffer.toString("utf-8");
  const cleaned = stripBoilerplate(html);
  const markdown = turndown.turndown(cleaned).trim();

  return {
    url: rawUrl,
    finalUrl: response.url,
    status: response.status,
    title: extractTitle(html),
    markdown,
    contentLength: buffer.byteLength,
    fetchedAt: new Date().toISOString(),
  };
}
