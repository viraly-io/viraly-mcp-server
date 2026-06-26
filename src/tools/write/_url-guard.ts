import { isIP } from 'node:net';

/**
 * SSRF defense for `upload_media`.
 *
 * The MCP server forwards the URL to the Viraly API, which fetches and
 * stores it. Even though the API may have its own protections, we fail fast
 * at the MCP layer for obviously bad URLs so the LLM gets an immediate,
 * meaningful error rather than waiting on a downstream timeout.
 *
 * Rules:
 *   - Scheme must be https (or http for localhost only — useful in tests).
 *   - Hostname must not be an IP literal in a private/reserved range.
 *   - Hostname must not be "localhost", "*.localhost", or a metadata-style
 *     name we treat as internal.
 */

const PRIVATE_IPV4_PATTERNS: ReadonlyArray<RegExp> = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./, // 0.0.0.0/8
];

const RESERVED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.azure.com',
]);

/**
 * Returns true if an IPv4 literal falls in a private/reserved/link-local range
 * that must never be reachable from a server-side fetch.
 */
function isPrivateIpv4(ipv4: string): boolean {
  return PRIVATE_IPV4_PATTERNS.some((p) => p.test(ipv4));
}

/**
 * If an (already lower-cased, bracket-stripped) IPv6 host embeds an IPv4
 * address — either IPv4-mapped (::ffff:1.2.3.4 / ::ffff:0102:0304) or
 * IPv4-compatible (::1.2.3.4) — return that IPv4 in dotted-quad form so it can
 * be range-checked. Returns null when no IPv4 is embedded.
 */
function extractMappedIpv4(host: string): string | null {
  // Dotted-quad tail, e.g. ::ffff:169.254.169.254 or ::1.2.3.4
  const dotted = host.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) return dotted[1]!;

  // Hex-encoded IPv4-mapped form, e.g. ::ffff:a9fe:a9fe (= 169.254.169.254).
  const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const high = parseInt(hex[1]!, 16);
    const low = parseInt(hex[2]!, 16);
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
  }

  return null;
}

export function assertSafeMediaUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new MediaUrlError('URL is not a valid absolute URL');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new MediaUrlError(`URL scheme must be https (got ${url.protocol}). Provide a public https:// URL.`);
  }
  if (url.protocol === 'http:') {
    throw new MediaUrlError('URL scheme must be https, not http. Provide a public https:// URL.');
  }

  // Strip IPv6 brackets that the URL parser preserves on hostname.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (RESERVED_HOSTNAMES.has(host) || host.endsWith('.localhost')) {
    throw new MediaUrlError(`URL host is reserved: ${host}`);
  }

  const ipKind = isIP(host);
  if (ipKind === 4) {
    if (isPrivateIpv4(host)) {
      throw new MediaUrlError(`URL points to a private IP range: ${host}`);
    }
  }
  if (ipKind === 6) {
    // Block loopback (::1) and the unspecified address (::).
    if (host === '::1' || host === '::') {
      throw new MediaUrlError(`URL points to a private IPv6 range: ${host}`);
    }
    // Block link-local (fe80::/10) and unique-local (fc00::/7 → fc/fd prefix).
    if (host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) {
      throw new MediaUrlError(`URL points to a private IPv6 range: ${host}`);
    }
    // Block IPv4-mapped / IPv4-compatible IPv6 forms that smuggle a private
    // IPv4 target past the IPv6 checks, e.g. ::ffff:169.254.169.254,
    // ::ffff:10.0.0.1, or ::ffff:c0a8:0001 (hex-encoded 192.168.0.1). Node's
    // isIP() classifies all of these as kind 6, so without this they would
    // otherwise be treated as a benign public IPv6 address.
    const mappedIpv4 = extractMappedIpv4(host);
    if (mappedIpv4) {
      if (isPrivateIpv4(mappedIpv4)) {
        throw new MediaUrlError(`URL points to a private IP range: ${mappedIpv4}`);
      }
    }
  }

  return url;
}

export class MediaUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaUrlError';
  }
}
