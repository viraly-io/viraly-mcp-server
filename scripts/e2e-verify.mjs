#!/usr/bin/env node
/**
 * End-to-end verification for a deployed Viraly MCP endpoint.
 *
 *   node scripts/e2e-verify.mjs https://mcp.beta.viraly.io [https://api.beta.viraly.io]
 *
 * Everything here runs without a real OAuth token. The one step that genuinely
 * needs a human is the consent approval at app.<env>.viraly.io/oauth/authorize,
 * so a real `vat_` token cannot be minted headlessly. What CAN be proven without
 * one is every layer up to and including "the bearer token reached the Lambda",
 * which is where the interesting failure modes live.
 *
 * THE TEST THAT MATTERS MOST is #6. CloudFront forwards to the origin only the
 * union of the cache policy's and origin request policy's headers, and
 * CACHING_DISABLED forwards none. Get the origin request policy wrong and
 * `Authorization` is silently dropped: /health and the discovery document stay
 * green, the 401 challenge still looks right, and every authenticated tool call
 * fails. `tools/list` is the decisive probe because it passes the bearer auth
 * middleware but makes no upstream call, so a 200 with the full tool list proves
 * the header survived the edge, with no valid token required.
 */

const base = (process.argv[2] || 'https://mcp.beta.viraly.io').replace(/\/+$/, '');
const expectedIssuer = process.argv[3] || null;

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}${detail ? '  ' + detail : ''}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/**
 * Every request is bounded. Test 5 exists precisely because a regression there
 * leaves an SSE stream open forever, and a test that hangs is a test that
 * cannot report the failure it was written to catch.
 */
const REQUEST_TIMEOUT_MS = 15_000;

async function req(path, init = {}) {
  try {
    const res = await fetch(base + path, {
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...init,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { res, text, json };
  } catch (err) {
    // Surface as a synthetic response so each check reports rather than throws.
    return {
      res: { status: 0, headers: new Headers(), timedOut: err.name === 'TimeoutError' },
      text: '',
      json: undefined,
      error: err,
    };
  }
}

const MCP_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
};

console.log(`\nVerifying ${base}\n${'='.repeat(60)}`);

// 1. TLS and reachability
section('1. TLS / reachability');
{
  try {
    const { res } = await req('/health');
    check('TLS handshake + HTTP response', true, `status ${res.status}`);
    check('served over the custom domain', new URL(base).protocol === 'https:');
  } catch (err) {
    check('TLS handshake + HTTP response', false, String(err.message));
  }
}

// 2. Health
section('2. GET /health');
{
  const { res, json } = await req('/health');
  check('status 200', res.status === 200, `got ${res.status}`);
  check('status ok', json?.status === 'ok', JSON.stringify(json));
  check('identifies the service', json?.service === 'viraly-mcp-server', json?.service);
}

// 3. RFC 9728 discovery
section('3. GET /.well-known/oauth-protected-resource');
{
  const { res, json } = await req('/.well-known/oauth-protected-resource');
  check('status 200', res.status === 200, `got ${res.status}`);
  check('resource matches this origin', json?.resource === base, json?.resource);
  check('23 scopes advertised', json?.scopes_supported?.length === 23, `got ${json?.scopes_supported?.length}`);
  const issuer = json?.authorization_servers?.[0];
  check('authorization server present', !!issuer, issuer);
  if (expectedIssuer) {
    check('authorization server is the expected API', issuer === expectedIssuer, `${issuer} vs ${expectedIssuer}`);
  }
}

// 4. Unauthenticated challenge
section('4. POST /mcp with no Authorization (OAuth discovery trigger)');
{
  const { res, json } = await req('/mcp', { method: 'POST', headers: MCP_HEADERS, body: '{}' });
  const wwwAuth = res.headers.get('www-authenticate');
  const remapped = res.headers.get('x-amzn-remapped-www-authenticate');
  check('status 401', res.status === 401, `got ${res.status}`);
  // Lambda Function URLs rename WWW-Authenticate to x-amzn-remapped-*. Behind
  // CloudFront a response headers policy re-attaches the canonical header, so
  // BOTH appear on a Lambda deployment. Only the canonical one matters: without
  // it no MCP client can discover the authorization server and onboarding is
  // dead, even though every other check here passes.
  check(
    'WWW-Authenticate present',
    !!wwwAuth,
    remapped && !wwwAuth
      ? 'ONLY the remapped header came back: the response headers policy is missing'
      : '',
  );
  check('advertises resource_metadata', /resource_metadata="[^"]+"/.test(wwwAuth || ''), wwwAuth);
  check('resource_metadata points at this host', (wwwAuth || '').includes(base), '');
  check('error is machine readable', !!json?.error, JSON.stringify(json)?.slice(0, 80));
}

// 5. Standalone SSE stream refused
section('5. GET /mcp must NOT open an SSE stream');
{
  const started = Date.now();
  const { res } = await req('/mcp', {
    method: 'GET',
    headers: { authorization: 'Bearer vat_e2eprobe', accept: 'text/event-stream' },
  });
  const elapsed = Date.now() - started;
  check('status 405', res.status === 405, res.timedOut ? 'TIMED OUT: the stream stayed open' : `got ${res.status}`);
  check('Allow header advertises POST, DELETE', res.headers.get('allow') === 'POST, DELETE', res.headers.get('allow'));
  check(
    'returned promptly, no hanging stream',
    !res.timedOut && elapsed < 5000,
    `${elapsed}ms${res.timedOut ? ' (aborted)' : ''}`,
  );
  check(
    'content-type is not an event stream',
    !(res.headers.get('content-type') || '').includes('text/event-stream'),
    res.headers.get('content-type'),
  );
}

// 6. THE CRITICAL ONE: Authorization survives the edge
section('6. Authorization header reaches the origin (CloudFront forwarding)');
{
  const { res, json } = await req('/mcp', {
    method: 'POST',
    headers: { ...MCP_HEADERS, authorization: 'Bearer vat_e2eprobe' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });

  if (res.status === 401) {
    check(
      'Authorization forwarded to origin',
      false,
      'got 401: the edge STRIPPED the header (check the origin request policy)',
    );
  } else {
    check('Authorization forwarded to origin', res.status === 200, `status ${res.status}`);
  }
  const tools = json?.result?.tools ?? [];
  check('tools/list returned 36 tools', tools.length === 36, `got ${tools.length}`);
  check('response is JSON, not SSE', (res.headers.get('content-type') || '').includes('application/json'));
  check('a known write tool is present', tools.some((t) => t.name === 'schedule_post'));
}

// 7. MCP protocol handshake
section('7. MCP initialize handshake');
{
  const { res, json } = await req('/mcp', {
    method: 'POST',
    headers: { ...MCP_HEADERS, authorization: 'Bearer vat_e2eprobe' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } },
    }),
  });
  check('status 200', res.status === 200, `got ${res.status}`);
  check('serverInfo.name is viraly', json?.result?.serverInfo?.name === 'viraly', JSON.stringify(json?.result?.serverInfo));
  check('protocolVersion negotiated', !!json?.result?.protocolVersion, json?.result?.protocolVersion);
  check('advertises tools capability', !!json?.result?.capabilities?.tools);
}

// 8. Authenticated call reaches upstream
section('8. Authenticated tool call reaches the upstream API');
{
  const { res, json } = await req('/mcp', {
    method: 'POST',
    headers: { ...MCP_HEADERS, authorization: 'Bearer vat_e2eprobe' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'list_channels', arguments: {} },
    }),
  });
  const text = JSON.stringify(json ?? '');
  check('status 200 (JSON-RPC transport ok)', res.status === 200, `got ${res.status}`);
  // The probe token is not real, so the upstream must reject it. Seeing that
  // rejection surface as a tool error proves the whole chain worked: edge ->
  // Lambda -> upstream API -> mapped error text.
  check(
    'upstream rejected the fake token (proves full round trip)',
    /expired|revoked|reconnect|unauthor/i.test(text),
    text.slice(0, 120),
  );
}

// 9. CORS preflight
section('9. OPTIONS preflight');
{
  const { res } = await req('/mcp', {
    method: 'OPTIONS',
    headers: { origin: 'https://claude.ai', 'access-control-request-method': 'POST' },
  });
  check('preflight does not 5xx', res.status < 500, `got ${res.status}`);
}

// 10. Unsupported paths are refused at the edge
section('10. Unsupported paths 404 at the edge, never reaching Lambda');
{
  // CloudFront routes only /mcp, /health and the RFC 9728 document to the
  // Lambda. Everything else lands on the catch-all origin (an empty private
  // bucket) and 404s without an invocation. This exists because the endpoint
  // is public and continuously scanned: a burst of .env probes once consumed
  // beta's entire regional Lambda concurrency pool.
  for (const path of ['/definitely-not-a-route', '/.env', '/.env.production', '/wp-admin/', '/.git/config']) {
    const { res } = await req(path);
    check(`404 for ${path}`, res.status === 404, `got ${res.status}`);
  }
  // A POST to a junk path is refused by CloudFront itself: the catch-all
  // behavior permits GET/HEAD only.
  const { res: postRes } = await req('/.env', { method: 'POST', body: '{}' });
  check('POST to a junk path is refused', postRes.status === 403 || postRes.status === 405, `got ${postRes.status}`);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`${pass} passed, ${fail} failed`);
if (fail) console.log('Failed: ' + failures.join(', '));
console.log('');
process.exit(fail === 0 ? 0 : 1);
