import { assertSafeUrl, UrlGuardError } from "./url-guard";

export type ScreenshotResult = {
  url: string;
  width: number;
  height: number;
  contentType: string;
  imageBase64: string;
  byteLength: number;
  provider: "wordpress-mshots";
  fetchedAt: string;
};

export class ScreenshotError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ScreenshotError";
  }
}

const FETCH_TIMEOUT_MS = 30_000;
const MAX_BYTES = 5 * 1024 * 1024;
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 8;

async function validateUrl(rawUrl: string): Promise<URL> {
  try {
    return await assertSafeUrl(rawUrl);
  } catch (err) {
    if (err instanceof UrlGuardError) {
      throw new ScreenshotError(err.message, err.status);
    }
    throw err;
  }
}

const PLACEHOLDER_THRESHOLD_BYTES = 8 * 1024;

async function fetchBytes(url: string): Promise<{
  bytes: Uint8Array;
  contentType: string;
  status: number;
}> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      throw new ScreenshotError("Screenshot payload too large", 413);
    }
    return {
      bytes: buf,
      contentType: res.headers.get("content-type") ?? "",
      status: res.status,
    };
  } finally {
    clearTimeout(t);
  }
}

function isImageBytes(bytes: Uint8Array, contentType: string): boolean {
  if (contentType.startsWith("image/")) return true;
  // PNG magic 89 50 4E 47, JPEG FF D8 FF, GIF 47 49 46
  if (bytes.length < 4) return false;
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return true;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return true;
  return false;
}

export async function screenshotUrl(
  rawUrl: string,
  width: number = 1280,
  height: number = 800,
): Promise<ScreenshotResult> {
  const target = await validateUrl(rawUrl);
  const w = Math.min(Math.max(320, Math.floor(width) || 1280), 2000);
  const h = Math.min(Math.max(240, Math.floor(height) || 800), 2000);

  // WordPress mShots: returns PNG. If not yet generated, returns a placeholder
  // ~5KB grey image. Poll until size grows or attempts exceeded.
  const shotUrl =
    `https://s.wordpress.com/mshots/v1/${encodeURIComponent(target.toString())}` +
    `?w=${w}&h=${h}`;

  let last: { bytes: Uint8Array; contentType: string; status: number } | null =
    null;
  let isReal = false;
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    try {
      last = await fetchBytes(shotUrl);
    } catch (err) {
      if (err instanceof ScreenshotError) throw err;
      const msg = err instanceof Error ? err.message : "fetch failed";
      throw new ScreenshotError(`Screenshot backend failed: ${msg}`, 502);
    }
    if (last.status >= 500) {
      throw new ScreenshotError(
        `Screenshot backend returned ${last.status}`,
        502,
      );
    }
    if (!isImageBytes(last.bytes, last.contentType)) {
      throw new ScreenshotError("Screenshot backend returned non-image", 502);
    }
    // Heuristic: placeholder grey PNG is ~3-6KB. Real screenshots are larger.
    if (last.bytes.byteLength > PLACEHOLDER_THRESHOLD_BYTES) {
      isReal = true;
      break;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (!last) {
    throw new ScreenshotError("Screenshot backend gave no response", 502);
  }

  if (!isReal) {
    // mShots returned only the grey placeholder after every poll. Refusing
    // with a non-2xx prevents x402-express from settling — the buyer is not
    // charged for a useless image.
    throw new ScreenshotError(
      "Screenshot backend did not produce a real image in time (only placeholder returned). Try again shortly.",
      504,
    );
  }

  return {
    url: target.toString(),
    width: w,
    height: h,
    contentType: last.contentType || "image/png",
    imageBase64: Buffer.from(last.bytes).toString("base64"),
    byteLength: last.bytes.byteLength,
    provider: "wordpress-mshots",
    fetchedAt: new Date().toISOString(),
  };
}
