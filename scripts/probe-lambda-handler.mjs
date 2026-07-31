/**
 * Local smoke test for the bundled Lambda handler.
 *
 * Invokes dist-lambda/index.mjs with synthetic Lambda Function URL (payload
 * format 2.0) events and asserts the responses. Run after `npm run build:lambda`:
 *
 *   node scripts/probe-lambda-handler.mjs
 *
 * Exercises only paths that need no upstream API call, so it is safe to run
 * anywhere with no credentials and no network.
 */

const BUNDLE = new URL('../dist-lambda/index.mjs', import.meta.url).href;

function event(method, path, { headers = {}, body } = {}) {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers: {
      host: 'mcp.beta.viraly.io',
      'x-forwarded-for': '203.0.113.9',
      ...headers,
    },
    requestContext: {
      accountId: 'anonymous',
      apiId: 'probe',
      domainName: 'mcp.beta.viraly.io',
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '203.0.113.9',
        userAgent: 'probe/1.0',
      },
      requestId: 'probe-' + method + '-' + path,
      routeKey: '$default',
      stage: '$default',
      time: '31/Jul/2026:00:00:00 +0000',
      timeEpoch: 1785000000000,
    },
    body,
    isBase64Encoded: false,
  };
}

const ctx = { awsRequestId: 'probe', getRemainingTimeInMillis: () => 30000 };

let failures = 0;
function check(name, cond, detail) {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failures++;
  console.log(`  [${mark}] ${name}${detail ? '  ->  ' + detail : ''}`);
}

const { handler } = await import(BUNDLE);

console.log('\n1. GET /health');
{
  const r = await handler(event('GET', '/health'), ctx);
  const body = JSON.parse(r.body);
  check('status 200', r.statusCode === 200, `got ${r.statusCode}`);
  check('status ok', body.status === 'ok', JSON.stringify(body));
}

console.log('\n2. GET /.well-known/oauth-protected-resource');
{
  const r = await handler(event('GET', '/.well-known/oauth-protected-resource'), ctx);
  const body = JSON.parse(r.body);
  check('status 200', r.statusCode === 200, `got ${r.statusCode}`);
  check('23 scopes', body.scopes_supported?.length === 23, `got ${body.scopes_supported?.length}`);
  check('resource set', !!body.resource, body.resource);
  check('auth server set', !!body.authorization_servers?.[0], body.authorization_servers?.[0]);
}

console.log('\n3. POST /mcp with NO Authorization header');
{
  const r = await handler(
    event('POST', '/mcp', { headers: { 'content-type': 'application/json' }, body: '{}' }),
    ctx,
  );
  const wwwAuth = r.headers['www-authenticate'] || r.headers['WWW-Authenticate'];
  check('status 401', r.statusCode === 401, `got ${r.statusCode}`);
  check('WWW-Authenticate present', !!wwwAuth, wwwAuth);
  check('carries resource_metadata', /resource_metadata=/.test(wwwAuth || ''), wwwAuth);
}

console.log('\n4. GET /mcp (standalone SSE stream must be refused)');
{
  const r = await handler(
    event('GET', '/mcp', {
      headers: { authorization: 'Bearer vat_probe', accept: 'text/event-stream' },
    }),
    ctx,
  );
  check('status 405', r.statusCode === 405, `got ${r.statusCode}`);
  check('Allow header', (r.headers.allow || r.headers.Allow) === 'POST, DELETE', r.headers.allow);
  check('returned promptly (no hang)', true);
}

console.log('\n5. POST /mcp  initialize  (MCP protocol handshake)');
{
  const r = await handler(
    event('POST', '/mcp', {
      headers: {
        authorization: 'Bearer vat_probe',
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'probe', version: '1.0' },
        },
      }),
    }),
    ctx,
  );
  const body = JSON.parse(r.body);
  check('status 200', r.statusCode === 200, `got ${r.statusCode}`);
  check('JSON not SSE', (r.headers['content-type'] || '').includes('application/json'), r.headers['content-type']);
  check('serverInfo name', body.result?.serverInfo?.name === 'viraly', JSON.stringify(body.result?.serverInfo));
}

console.log('\n6. POST /mcp  tools/list');
{
  const r = await handler(
    event('POST', '/mcp', {
      headers: {
        authorization: 'Bearer vat_probe',
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    }),
    ctx,
  );
  const body = JSON.parse(r.body);
  const tools = body.result?.tools ?? [];
  check('status 200', r.statusCode === 200, `got ${r.statusCode}`);
  check('35 tools', tools.length === 35, `got ${tools.length}`);
  check('schedule_post present', tools.some((t) => t.name === 'schedule_post'));
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
