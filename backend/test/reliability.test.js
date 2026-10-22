const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createApp } = require('../app');
const { createCircuitBreaker, createBulkhead } = require('../lib/recovery');
const { createRateLimit } = require('../middleware/rateLimitMiddleware');

const serve = async (t, options) => {
  const server = createApp(options).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
};

test('production readiness fails on disconnected DB and ping failure; liveness stays healthy', async t => {
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  t.after(() => { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old; });
  const database = { readyState: 0, db: { admin: () => ({ command: async () => { throw new Error('down'); } }) } };
  const url = await serve(t, { database });
  assert.equal((await fetch(`${url}/api/health/live`)).status, 200);
  assert.equal((await fetch(`${url}/api/health/ready`)).status, 503);
  database.readyState = 1;
  assert.equal((await fetch(`${url}/api/health/ready`)).status, 503);
  database.db.admin = () => ({ command: async () => ({ ok: 1 }) });
  assert.equal((await fetch(`${url}/api/health/ready`)).status, 200);
});

test('body parsing errors return JSON and a request ID; unknown APIs do not serve HTML', async t => {
  const url = await serve(t);
  const response = await fetch(`${url}/api/resume/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(response.status, 400);
  assert.ok(response.headers.get('x-request-id'));
  assert.ok((await response.json()).requestId);
  assert.equal((await fetch(`${url}/api/unknown`)).status, 404);
});

test('production serves built SPA and client routes with Express 5', async t => {
  const staticDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gradhunt-test-'));
  await fs.writeFile(path.join(staticDir, 'index.html'), '<html>GradHunt</html>');
  t.after(() => fs.rm(staticDir, { recursive: true, force: true }));
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  t.after(() => { if (old === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old; });
  const url = await serve(t, { staticDir });
  assert.match(await (await fetch(`${url}/`)).text(), /GradHunt/);
  assert.match(await (await fetch(`${url}/account`)).text(), /GradHunt/);
});

test('draining returns 503 before routing', async t => {
  const url = await serve(t, { isDraining: () => true });
  assert.equal((await fetch(`${url}/api/health/ready`)).status, 503);
});

test('mounted API routes emit EMF once and exclude query tokens and health probes', async t => {
  const previous = process.env.CLOUDWATCH_EMF;
  process.env.CLOUDWATCH_EMF = 'true';
  const lines = [];
  const original = console.log;
  console.log = line => lines.push(line);
  t.after(() => {
    console.log = original;
    if (previous === undefined) delete process.env.CLOUDWATCH_EMF; else process.env.CLOUDWATCH_EMF = previous;
  });
  const url = await serve(t, { database: { readyState: 1 } });
  assert.equal((await fetch(`${url}/api/resume/analyze?token=do-not-log`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  })).status, 400);
  await fetch(`${url}/api/health/live`);
  const metrics = lines.map(line => JSON.parse(line)).filter(line => line._aws);
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].Requests, 1);
  assert.equal(metrics[0].ServerErrors, 0);
  assert.equal(metrics[0].Service, 'gateway');
  assert.ok(!lines.some(line => line.includes('do-not-log')));
});

test('circuit breaker rejects during cooldown and permits one recovery probe', async () => {
  let clock = 0;
  const run = createCircuitBreaker({ threshold: 2, resetMs: 100, now: () => clock });
  const fail = async () => { throw new Error('down'); };
  await assert.rejects(run(fail));
  await assert.rejects(run(fail));
  let invoked = false;
  await assert.rejects(run(async () => { invoked = true; }), { statusCode: 503 });
  assert.equal(invoked, false);
  clock = 101;
  let release;
  const probe = run(() => new Promise(resolve => { release = resolve; }));
  await assert.rejects(run(async () => 'other'), { statusCode: 503 });
  release('recovered');
  assert.equal(await probe, 'recovered');
  assert.equal(await run(async () => 'healthy'), 'healthy');
});

test('client input failures do not open dependency circuit', async () => {
  const run = createCircuitBreaker({ threshold: 1 });
  await assert.rejects(run(async () => { throw Object.assign(new Error('bad request'), { statusCode: 400 }); }));
  assert.equal(await run(async () => 'ok'), 'ok');
});

test('bulkhead bounds browser concurrency and frees capacity after failures', async () => {
  const run = createBulkhead(1);
  let release;
  const held = run(() => new Promise(resolve => { release = resolve; }));
  await assert.rejects(run(async () => 'overflow'), { statusCode: 503 });
  release();
  await held;
  await assert.rejects(run(async () => { throw new Error('failed'); }));
  assert.equal(await run(async () => 'recovered'), 'recovered');
});

test('rate limiting uses trusted req.ip rather than a spoofed forwarded header', () => {
  const middleware = createRateLimit({ maxRequests: 1, windowMs: 10000, scope: 'test' });
  let status;
  const response = { setHeader() {}, status(value) { status = value; return this; }, json() {} };
  middleware({ ip: '127.0.0.1', headers: { 'x-forwarded-for': 'a' } }, response, () => {});
  middleware({ ip: '127.0.0.1', headers: { 'x-forwarded-for': 'b' } }, response, () => assert.fail('bypassed limit'));
  assert.equal(status, 429);
});
