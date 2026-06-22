import { request } from 'undici';

import type { ServerConfig } from '../config.js';
import { upstreamCallCounter } from '../observability/metrics.js';
import {
  ViralyAmbiguousWriteError,
  ViralyApiError,
  ViralyAuthError,
  ViralyPlanLimitError,
  ViralyScopeError,
  ViralyTransientError,
} from './errors.js';

/**
 * Typed HTTP client for the Viraly Platform API.
 *
 * One instance per request — the `accessToken` is captured from the inbound
 * MCP request and forwarded as `Authorization: Bearer <token>` upstream.
 *
 * Tool implementations call high-level methods (e.g. `client.posts.list`) so
 * we keep the upstream URL set in one place.
 */

export interface ViralyClientOptions {
  config: ServerConfig;
  accessToken: string;
  /** Per-request idempotency key for write operations. Optional. */
  idempotencyKey?: string;
  /** Default fetch timeout in milliseconds. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** When true, include the idempotency key header on the request. */
  idempotent?: boolean;
}

export class ViralyClient {
  private readonly origin: string;
  private readonly accessToken: string;
  private readonly idempotencyKey?: string;
  private readonly timeoutMs: number;

  constructor(options: ViralyClientOptions) {
    this.origin = options.config.viralyApiOrigin;
    this.accessToken = options.accessToken;
    this.idempotencyKey = options.idempotencyKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async call<T>(options: RequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.query);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };

    let bodyInit: string | undefined;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      bodyInit = JSON.stringify(options.body);
    }

    if (options.idempotent && this.idempotencyKey) {
      headers['Idempotency-Key'] = this.idempotencyKey;
    }

    const startedAt = Date.now();
    let statusClass = 'error';
    try {
      const response = await request(url, {
        method: options.method,
        headers,
        body: bodyInit,
        bodyTimeout: this.timeoutMs,
        headersTimeout: this.timeoutMs,
      });

      statusClass = `${Math.floor(response.statusCode / 100)}xx`;

      const text = await response.body.text();
      const parsed = text.length > 0 ? safeParseJson(text) : undefined;

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return parsed as T;
      }

      throw mapErrorResponse(response.statusCode, parsed);
    } catch (err) {
      if (err instanceof ViralyApiError) throw err;
      // Undici aborts, ECONNRESET, DNS, etc.
      const message = err instanceof Error ? err.message : 'Unknown upstream error';

      // A client-side timeout/abort on a mutating request is ambiguous: the
      // upstream write may have already completed (quota decremented, post
      // created) even though we never received the response. Surface a
      // NON-retryable error so the model verifies state before retrying —
      // because the Idempotency-Key header is not yet honored upstream, a
      // blind retry would duplicate the write / double-charge quota.
      const isWriteMethod = options.method !== 'GET';
      const isTimeoutOrAbort =
        err instanceof Error &&
        /timeout|aborted|abort|UND_ERR_(HEADERS_TIMEOUT|BODY_TIMEOUT)/i.test(
          `${err.name} ${err.message}`,
        );
      if (isWriteMethod && isTimeoutOrAbort) {
        throw new ViralyAmbiguousWriteError(
          `Upstream ${options.method} timed out after ${this.timeoutMs}ms; ` +
            'the operation may have completed. Verify current state (e.g. list the ' +
            'resource) before retrying — retrying blindly can create a duplicate or ' +
            're-consume quota.',
        );
      }

      throw new ViralyTransientError(`Upstream call failed: ${message}`, 502);
    } finally {
      upstreamCallCounter.inc({
        method: options.method,
        route: redactRoute(options.path),
        status_class: statusClass,
      });
      // Suppress unused warning when in non-debug builds.
      void startedAt;
    }
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.origin}${cleanPath}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function mapErrorResponse(status: number, body: unknown): ViralyApiError {
  if (status === 401) {
    return new ViralyAuthError('Access token rejected by Viraly API', body);
  }
  if (status === 403) {
    const scope = extractMissingScope(body) ?? 'unknown';
    return new ViralyScopeError(scope);
  }
  if (status === 429) {
    return new ViralyPlanLimitError('Plan limit reached', body);
  }
  if (status >= 500) {
    return new ViralyTransientError(`Upstream returned ${status}`, status);
  }
  // The Viraly API returns validation failures as `{ errors: [...] }` (e.g. per-platform
  // media-requirement messages) and only sometimes a top-level `message`. Surface the full
  // errors list so the model sees the actionable reason (wrong dimensions, file too large,
  // caption too long, too many hashtags, …) and can fix the media/caption and retry —
  // rather than a generic "Upstream returned 400".
  const message = extractErrorMessage(body) ?? `Upstream returned ${status}`;
  return new ViralyApiError(message, status, 'upstream_error', body);
}

function extractErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const obj = body as Record<string, unknown>;
  const errors = obj.errors;
  if (Array.isArray(errors)) {
    const list = errors.filter((e): e is string => typeof e === 'string' && e.length > 0);
    if (list.length > 0) return list.join(' ');
  }
  if (typeof obj.message === 'string' && obj.message.length > 0) return obj.message;
  return null;
}

function extractMissingScope(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;
  if (typeof record.required_scope === 'string') return record.required_scope;
  if (typeof record.error_description === 'string' && record.error_description.includes('scope')) {
    return record.error_description;
  }
  return undefined;
}

/**
 * Strip path segments that look like opaque identifiers, so the metric
 * cardinality stays bounded. e.g. /api/platforms/posts/abc123 → /api/platforms/posts/:id.
 */
function redactRoute(path: string): string {
  return path.replace(/\/[A-Za-z0-9_-]{6,}/g, '/:id');
}
