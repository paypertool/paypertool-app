import { safeFetch, UrlGuardError } from "./url-guard";

export type OgMetadataResult = {
  url: string;
  finalUrl: string;
  status: number;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  type: string | null;
  locale: string | null;
  canonical: string | null;
  favicon: string | null;
  og: Record<string, string>;
  twitter: Record<string, string>;
  fetchedAt: string;
};

export class OgMetadataError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OgMetadataError";
  }
}

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 1 * 1024 * 1024;
const USER_AGENT =
  "Mozilla/5.0 (compatible; PayPerToolBot/0.1; +https://paypertool.dev)";

const META_REGEX = /<meta\b([^>]*)>/gi;
const ATTR_REGEX = /(\w[\w:-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
const TITLE_REGEX = /<title[^>]*>([\s\S]*?)<\/title>/i;
const LINK_REGEX = /<link\b([^>]*)>/gi;

function parseAttrs(attrString: string): Record<string, string> {
  const result: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = ATTR_REGEX.exec(attrString)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[3] ?? m[4] ?? m[5] ?? "";
    result[name] = decodeEntities(value);
  }
  return result;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function abs(rawUrl: string | null, base: string): string | null {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl, base).toString();
  } catch {
    return rawUrl;
  }
}

export async function fetchOgMetadata(
  rawUrl: string,
): Promise<OgMetadataResult> {
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
      throw new OgMetadataError(err.message, err.status);
    }
    const msg = err instanceof Error ? err.message : "fetch failed";
    throw new OgMetadataError(`Fetch failed: ${msg}`, 502);
  }
  clearTimeout(timeout);

  if (!response.ok) {
    throw new OgMetadataError(
      `Upstream returned HTTP ${response.status}`,
      response.status >= 400 && response.status < 500 ? 404 : 502,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("xml")) {
    throw new OgMetadataError(
      `Unsupported content-type: ${contentType || "unknown"}`,
      415,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new OgMetadataError("Empty response body", 502);
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
      throw new OgMetadataError("Response too large (>1MB)", 413);
    }
    chunks.push(value);
  }
  const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString(
    "utf-8",
  );
  const headSlice = html.slice(0, 256_000);

  const og: Record<string, string> = {};
  const twitter: Record<string, string> = {};
  const baseRegex = /<base\b([^>]*)>/i;
  const baseMatch = headSlice.match(baseRegex);
  const baseHref = baseMatch
    ? parseAttrs(baseMatch[1]).href ?? response.url
    : response.url;

  META_REGEX.lastIndex = 0;
  let mm: RegExpExecArray | null;
  while ((mm = META_REGEX.exec(headSlice)) !== null) {
    const attrs = parseAttrs(mm[1]);
    const property = (attrs.property ?? attrs.name ?? "").toLowerCase();
    const content = attrs.content ?? "";
    if (!property || !content) continue;
    if (property.startsWith("og:")) {
      og[property.slice(3)] = content;
    } else if (property.startsWith("twitter:")) {
      twitter[property.slice(8)] = content;
    }
  }

  let canonical: string | null = null;
  let favicon: string | null = null;
  LINK_REGEX.lastIndex = 0;
  let lm: RegExpExecArray | null;
  while ((lm = LINK_REGEX.exec(headSlice)) !== null) {
    const attrs = parseAttrs(lm[1]);
    const rel = (attrs.rel ?? "").toLowerCase();
    if (rel === "canonical" && !canonical) {
      canonical = abs(attrs.href ?? null, baseHref);
    }
    if (
      (rel === "icon" || rel === "shortcut icon" || rel === "apple-touch-icon") &&
      !favicon
    ) {
      favicon = abs(attrs.href ?? null, baseHref);
    }
  }
  if (!favicon) {
    favicon = abs("/favicon.ico", baseHref);
  }

  const titleMatch = headSlice.match(TITLE_REGEX);
  const htmlTitle = titleMatch
    ? decodeEntities(titleMatch[1].trim().replace(/\s+/g, " "))
    : null;

  const title =
    og.title ?? twitter.title ?? htmlTitle ?? null;
  const description =
    og.description ?? twitter.description ?? null;
  const image = abs(
    og.image ?? og["image:url"] ?? twitter.image ?? null,
    baseHref,
  );

  return {
    url: rawUrl,
    finalUrl: response.url,
    status: response.status,
    title: title ? title.slice(0, 500) : null,
    description: description ? description.slice(0, 1000) : null,
    image,
    siteName: og.site_name ?? null,
    type: og.type ?? null,
    locale: og.locale ?? null,
    canonical,
    favicon,
    og,
    twitter,
    fetchedAt: new Date().toISOString(),
  };
}
