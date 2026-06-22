/**
 * Error types thrown by the Viraly API client. These map to MCP-friendly
 * error responses so the LLM can recover or report meaningfully.
 */

export class ViralyApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly upstreamBody: unknown;

  constructor(message: string, status: number, code: string, upstreamBody: unknown = null) {
    super(message);
    this.name = 'ViralyApiError';
    this.status = status;
    this.code = code;
    this.upstreamBody = upstreamBody;
  }
}

/** 401 from upstream — the OAuth token was rejected. */
export class ViralyAuthError extends ViralyApiError {
  constructor(message = 'Viraly API rejected the access token', upstreamBody: unknown = null) {
    super(message, 401, 'unauthorized', upstreamBody);
    this.name = 'ViralyAuthError';
  }
}

/** 403 — the token is valid but lacks the scope for this operation. */
export class ViralyScopeError extends ViralyApiError {
  constructor(missingScope: string) {
    super(`Missing required scope: ${missingScope}`, 403, 'insufficient_scope');
    this.name = 'ViralyScopeError';
  }
}

/** 429 — plan limit hit. The body usually contains structured upgrade context. */
export class ViralyPlanLimitError extends ViralyApiError {
  constructor(message: string, upstreamBody: unknown = null) {
    super(message, 429, 'plan_limit_exceeded', upstreamBody);
    this.name = 'ViralyPlanLimitError';
  }
}

/** 5xx or network failure — transient. The LLM should suggest retry. */
export class ViralyTransientError extends ViralyApiError {
  constructor(message: string, status: number) {
    super(message, status, 'transient_upstream_error');
    this.name = 'ViralyTransientError';
  }
}

/**
 * A client-side timeout/abort occurred on a non-idempotent write. The upstream
 * operation may have completed (e.g. an image was generated and quota was
 * decremented) even though we never saw the response — so a blind retry can
 * double-charge or create duplicates. This is deliberately NOT a transient
 * (retryable) error: the model must verify state before retrying.
 */
export class ViralyAmbiguousWriteError extends ViralyApiError {
  constructor(message: string) {
    super(message, 504, 'ambiguous_write_timeout');
    this.name = 'ViralyAmbiguousWriteError';
  }
}
