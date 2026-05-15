import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";

export class UrlGuardError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "UrlGuardError";
  }
}

function ipv4ToInt(octets: number[]): number {
  return (
    ((octets[0] << 24) >>> 0) +
    ((octets[1] << 16) >>> 0) +
    ((octets[2] << 8) >>> 0) +
    octets[3]
  );
}

function inIpv4Cidr(ip: number, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const baseOctets = base.split(".").map(Number);
  const baseInt = ipv4ToInt(baseOctets);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return ((ip & mask) >>> 0) === ((baseInt & mask) >>> 0);
}

const IPV4_BLOCKED_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10", // CGNAT
  "127.0.0.0/8",
  "169.254.0.0/16", // link-local incl. AWS/GCP/Azure metadata 169.254.169.254
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/4", // multicast
  "240.0.0.0/4", // reserved
];

function tryParseIpv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n < 0 || n > 255) return null;
    nums.push(n);
  }
  return nums;
}

function isBlockedIpv4(ip: string): boolean {
  const v4 = tryParseIpv4(ip);
  if (!v4) return false;
  const asInt = ipv4ToInt(v4);
  return IPV4_BLOCKED_CIDRS.some((c) => inIpv4Cidr(asInt, c));
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/%.*$/, ""); // strip zone id

  // Unspecified + loopback
  if (lower === "::" || lower === "::1") return true;

  // IPv4-mapped IPv6 (::ffff:a.b.c.d) → check the v4 part
  const v4Mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Mapped) return isBlockedIpv4(v4Mapped[1]);
  // Hex-form mapped (::ffff:xxxx:xxxx) — conservative reject
  if (lower.startsWith("::ffff:")) return true;

  // Compute first 16-bit hextet for prefix-based ranges
  const firstHextet = lower.split(":")[0] || "0";
  const first = parseInt(firstHextet, 16);
  if (Number.isNaN(first)) return false;

  // fc00::/7 (Unique Local Addresses)
  if ((first & 0xfe00) === 0xfc00) return true;
  // fe80::/10 (link-local)
  if ((first & 0xffc0) === 0xfe80) return true;
  // fec0::/10 (site-local, deprecated but still rejected)
  if ((first & 0xffc0) === 0xfec0) return true;
  // ff00::/8 (multicast)
  if ((first & 0xff00) === 0xff00) return true;

  return false;
}

function isBlockedIp(ip: string): boolean {
  if (isIPv4(ip)) return isBlockedIpv4(ip);
  if (isIPv6(ip)) return isBlockedIpv6(ip);
  return true; // unknown family → block
}

const HOSTNAME_BLOCKLIST = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "broadcasthost",
]);

/**
 * Static URL validation: protocol, literal IP ranges, obvious local
 * hostnames. Does NOT do DNS — call assertSafeUrl() if you also want
 * DNS rebinding protection.
 */
export function safeParseUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UrlGuardError("Invalid URL", 400);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UrlGuardError("Only http(s) URLs are supported", 400);
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) {
    throw new UrlGuardError("URL has no hostname", 400);
  }

  if (HOSTNAME_BLOCKLIST.has(host) || host.endsWith(".local")) {
    throw new UrlGuardError("Local addresses are not allowed", 400);
  }

  // Literal IPv4 in the URL
  if (tryParseIpv4(host)) {
    if (isBlockedIpv4(host)) {
      throw new UrlGuardError("Private/reserved IPv4 not allowed", 400);
    }
    return parsed;
  }

  // Literal IPv6 in the URL (URL.hostname strips brackets)
  if (host.includes(":")) {
    if (isBlockedIpv6(host)) {
      throw new UrlGuardError("Private/reserved IPv6 not allowed", 400);
    }
    return parsed;
  }

  return parsed;
}

/**
 * Resolve a hostname and ensure NO resolved IP (v4 + v6) lands in a
 * blocked range. Defeats DNS rebinding where a public hostname points
 * to a private IP at fetch time.
 *
 * Literal IPs are accepted as-is (already covered by safeParseUrl).
 */
export async function assertHostResolvesPublic(
  hostname: string,
): Promise<void> {
  if (isIPv4(hostname) || isIPv6(hostname)) return;

  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(hostname, { all: true });
  } catch {
    throw new UrlGuardError(`DNS lookup failed for ${hostname}`, 502);
  }
  if (!addrs.length) {
    throw new UrlGuardError(`No DNS records for ${hostname}`, 502);
  }
  for (const { address } of addrs) {
    if (isBlockedIp(address)) {
      throw new UrlGuardError(
        `Hostname ${hostname} resolves to a private/reserved address`,
        400,
      );
    }
  }
}

/**
 * Full validation: parse + literal-IP check + DNS resolution check.
 * Use this for any user-supplied URL before passing it to a downstream
 * service that will fetch it server-side (e.g. screenshot rendering).
 */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  const parsed = safeParseUrl(rawUrl);
  await assertHostResolvesPublic(parsed.hostname);
  return parsed;
}

export interface SafeFetchOptions extends Omit<RequestInit, "redirect"> {
  /** Max redirect hops to follow (default 5). */
  maxRedirects?: number;
}

/**
 * SSRF-hardened fetch:
 *  - Validates the initial URL (literal IP + DNS resolution).
 *  - Disables auto-redirect; manually re-validates every Location hop.
 *  - Strips Authorization on cross-origin redirects (defensive).
 *
 * Use this anywhere we fetch a user-supplied URL.
 */
export async function safeFetch(
  rawUrl: string,
  init: SafeFetchOptions = {},
): Promise<Response> {
  const { maxRedirects = 5, headers, ...rest } = init;

  let currentUrl = await assertSafeUrl(rawUrl);
  let currentHeaders: RequestInit["headers"] = headers;
  let hops = 0;

  while (true) {
    const res = await fetch(currentUrl.toString(), {
      ...rest,
      headers: currentHeaders,
      redirect: "manual",
    });

    const isRedirect = res.status >= 300 && res.status < 400;
    const location = res.headers.get("location");

    if (!isRedirect || !location) {
      return res;
    }

    if (hops >= maxRedirects) {
      throw new UrlGuardError("Too many redirects", 502);
    }

    // Drain to release the socket
    try {
      await res.arrayBuffer();
    } catch {
      // ignore
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      throw new UrlGuardError("Invalid redirect Location header", 502);
    }

    // Re-validate every hop (parse + DNS)
    const validatedNext = await assertSafeUrl(nextUrl.toString());

    // Strip Authorization on cross-origin redirects (defensive — some
    // upstreams set it and following blindly can leak creds).
    if (validatedNext.origin !== currentUrl.origin && currentHeaders) {
      const h = new Headers(currentHeaders);
      h.delete("authorization");
      h.delete("cookie");
      currentHeaders = h;
    }

    currentUrl = validatedNext;
    hops++;
  }
}
