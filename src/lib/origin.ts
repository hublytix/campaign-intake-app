const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
}

function defaultPort(protocol: string): string {
  if (protocol === "https:") return "443";
  if (protocol === "http:") return "80";
  return "";
}

export function parseWebOrigin(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "null") return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    // Origin headers must be an origin, not a path-bearing URL.
    if (url.pathname && url.pathname !== "/") return null;
    return url;
  } catch {
    return null;
  }
}

export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(normalizeHostname(hostname));
}

export function sameSchemeAndPort(a: URL, b: URL): boolean {
  const portA = a.port || defaultPort(a.protocol);
  const portB = b.port || defaultPort(b.protocol);
  return a.protocol === b.protocol && portA === portB;
}

export function isLocalLoopbackEquivalent(a: URL, b: URL): boolean {
  if (!sameSchemeAndPort(a, b)) return false;
  const hostA = normalizeHostname(a.hostname);
  const hostB = normalizeHostname(b.hostname);
  if (hostA === hostB) return true;
  return isLoopbackHostname(hostA) && isLoopbackHostname(hostB);
}

export function trustedOrigins(appBaseUrl: string): string[] {
  const base = parseWebOrigin(appBaseUrl);
  if (!base) return [];
  const origins = new Set([base.origin]);
  if (isLoopbackHostname(base.hostname)) {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      const next = new URL(base.origin);
      next.hostname = host;
      origins.add(next.origin);
    }
  }
  return [...origins];
}

export function isTrustedRequestOrigin(input: {
  originHeader: string;
  requestUrl: string;
  appBaseUrl: string;
}): boolean {
  const origin = parseWebOrigin(input.originHeader);
  if (!origin || origin.origin !== input.originHeader.trim()) return false;
  const request = parseWebOrigin(new URL(input.requestUrl).origin);
  if (!request) return false;
  const trusted = trustedOrigins(input.appBaseUrl);
  return trusted.includes(origin.origin) && isLocalLoopbackEquivalent(origin, request);
}
