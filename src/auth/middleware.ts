import type { NextFunction, Request, Response } from 'express';

import type { ServerConfig } from '../config.js';
import { authFailureCounter } from '../observability/metrics.js';

/**
 * Bearer-token auth middleware for the HTTP MCP transport.
 *
 * The MCP server does not validate the token itself. It accepts any
 * non-empty `Bearer vat_*` value and forwards it to the Viraly Platform API
 * on each tool call. The Viraly API is the source of truth for
 * authentication and authorization. If the token is invalid, the upstream
 * call returns 401 and we surface that to the MCP client.
 *
 * Why no local validation:
 *   - Avoids duplicating revocation/expiration logic.
 *   - Avoids a stale-cache risk where an expired or revoked token still
 *     works for a few seconds.
 *   - Keeps the MCP server stateless (no session store).
 *
 * What this middleware DOES enforce:
 *   - The Authorization header is present and well-formed.
 *   - The token has the expected `vat_` prefix (rejects obvious garbage
 *     before round-tripping it through the upstream).
 *   - 401 responses include WWW-Authenticate per RFC 6750 §3.
 */

const BEARER_PREFIX = 'Bearer ';
const TOKEN_PREFIX = 'vat_';

export interface AuthenticatedRequest extends Request {
  accessToken: string;
}

export function bearerAuthMiddleware(config: ServerConfig) {
  const challengeUrl = `${config.publicOrigin}/.well-known/oauth-protected-resource`;

  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header('authorization');

    if (!header) {
      authFailureCounter.inc({ reason: 'missing_header' });
      respondUnauthorized(res, challengeUrl, 'invalid_request', 'Missing Authorization header');
      return;
    }

    if (!header.startsWith(BEARER_PREFIX)) {
      authFailureCounter.inc({ reason: 'wrong_scheme' });
      respondUnauthorized(res, challengeUrl, 'invalid_token', 'Authorization scheme must be Bearer');
      return;
    }

    const token = header.slice(BEARER_PREFIX.length).trim();

    if (token.length === 0) {
      authFailureCounter.inc({ reason: 'empty_token' });
      respondUnauthorized(res, challengeUrl, 'invalid_token', 'Empty Bearer token');
      return;
    }

    if (!token.startsWith(TOKEN_PREFIX)) {
      authFailureCounter.inc({ reason: 'wrong_prefix' });
      respondUnauthorized(res, challengeUrl, 'invalid_token', 'Token format unrecognized');
      return;
    }

    (req as AuthenticatedRequest).accessToken = token;
    next();
  };
}

function respondUnauthorized(res: Response, resourceMetadata: string, error: string, description: string): void {
  res
    .status(401)
    .set(
      'WWW-Authenticate',
      `Bearer resource_metadata="${resourceMetadata}", error="${error}", error_description="${description}"`,
    )
    .json({ error, error_description: description });
}
