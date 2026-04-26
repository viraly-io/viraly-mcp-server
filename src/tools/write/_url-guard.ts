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

export function assertSafeMediaUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new MediaUrlError('URL is not a valid absolute URL');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new MediaUrlError(`URL must use http or https (got ${url.protocol})`);
  }
  if (url.protocol === 'http:') {
    throw new MediaUrlError('URL must use https');
  }

  // Strip IPv6 brackets that the URL parser preserves on hostname.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (RESERVED_HOSTNAMES.has(host) || host.endsWith('.localhost')) {
    throw new MediaUrlError(`URL host is reserved: ${host}`);
  }

  const ipKind = isIP(host);
  if (ipKind === 4) {
    if (PRIVATE_IPV4_PATTERNS.some((p) => p.test(host))) {
      throw new MediaUrlError(`URL points to a private IP range: ${host}`);
    }
  }
  if (ipKind === 6) {
    // Block link-local (fe80::/10), unique-local (fc00::/7, fd00::/8), loopback (::1).
    if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) {
      throw new MediaUrlError(`URL points to a private IPv6 range: ${host}`);
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
