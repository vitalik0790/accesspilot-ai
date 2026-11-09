// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { build } from 'vite';
import { Miniflare, Log, LogLevel } from 'miniflare';

const origin = 'chrome-extension://' + 'a'.repeat(32);
const headers = { Origin: origin, Authorization: 'Bearer fixture', 'Content-Type': 'application/json' };
const body = { version: 1, consent: true, operation: 'summary', page: { title: 'Title', text: 'PRIVATE_PAGE_CANARY', truncated: false, structure: [] } };
let production: Miniflare, fixture: Miniflare, invalid: Miniflare;
let productionCode = '';
async function bundle(entry: string) {
  const result = await build({ configFile: false, publicDir: false, logLevel: 'silent',
    build: { write: false, minify: false, target: 'es2022', lib: { entry, formats: ['es'] }, rollupOptions: { external: [] } },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(r => 'output' in r ? r.output : []);
  return outputs.filter(o => o.type === 'chunk').map(o => o.code).join('\n');
}
beforeAll(async () => {
  productionCode = await bundle('server/worker.ts');
  const options = { modules: true, compatibilityDate: '2026-06-01', log: new Log(LogLevel.NONE) };
  production = new Miniflare({ ...options, script: productionCode, bindings: {
    EXTENSION_ORIGIN: origin, AUTH_MODE: 'development', NODE_ENV: 'development', DEV_PLAN: 'pro', OPENAI_API_KEY: 'PRIVATE_KEY_CANARY',
  }, outboundService: () => { throw new Error('Production must never make outbound calls'); } });
  fixture = new Miniflare({ ...options, script: await bundle('tests/fixtures/worker.ts'), bindings: { EXTENSION_ORIGIN: origin } });
  invalid = new Miniflare({ ...options, script: productionCode });
  await Promise.all([production.ready, fixture.ready, invalid.ready]);
}, 60000);
afterAll(async () => { await Promise.all([production?.dispose(), fixture?.dispose(), invalid?.dispose()]); });

it('has no Node modules, provider endpoint or development bypass in the production bundle', () => {
  expect(productionCode).not.toMatch(/node:|process\.env|127\.0\.0\.1|api\.openai\.com|local-developer|AUTH_MODE|OPENAI_API_KEY/);
});
it.each([undefined, 'Bearer forged'])('production denies AI with authorization %s even with hostile bindings', async authorization => {
  const h: Record<string, string> = { Origin: origin, 'Content-Type': 'application/json' };
  if (authorization) h.Authorization = authorization;
  const response = await production.dispatchFetch('https://worker.test/v1/ai', { method: 'POST', headers: h, body: JSON.stringify(body) });
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ ok: false, error: { code: 'unauthorized' } });
  expect(response.headers.get('cache-control')).toBe('no-store');
});
it('fails closed without the required binding', async () => {
  const response = await invalid.dispatchFetch('https://worker.test/v1/ai', { method: 'POST', headers });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ ok: false, error: { code: 'unavailable' } });
});
it('enforces exact CORS and supports preflight without granting AI access', async () => {
  const denied = await production.dispatchFetch('https://worker.test/v1/ai', { method: 'POST', headers: { Origin: 'https://evil.test' } });
  expect(denied.status).toBe(403); expect(denied.headers.has('access-control-allow-origin')).toBe(false);
  const allowed = await production.dispatchFetch('https://worker.test/v1/ai', { method: 'OPTIONS', headers });
  expect(allowed.status).toBe(204); expect(allowed.headers.get('access-control-allow-origin')).toBe(origin);
  expect(allowed.headers.get('access-control-allow-headers')).toBe('Content-Type, Authorization');
});
it.each([['/other','POST',404], ['/v1/ai?secret=x','POST',404], ['/v1/ai','GET',405]])('rejects route/method %s %s', async (path, method, status) => {
  expect((await production.dispatchFetch('https://worker.test' + path, { method: String(method), headers })).status).toBe(status);
});
it.each(['summary','question'])('portable application handles %s in workerd with test-only identity', async operation => {
  const payload = operation === 'summary' ? body : { ...body, operation, question: 'Where?', page: { ...body.page, interactive: [{ id: 'element-1', name: 'Checkout', role: 'button', disabled: false }] } };
  const response = await fixture.dispatchFetch('https://worker.test/v1/ai', { method: 'POST', headers, body: JSON.stringify(payload) });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, result: { answer: 'Fixture answer', ...(operation === 'question' ? { targetId: 'element-1' } : {}) } });
  const logs = JSON.parse(response.headers.get('X-Fixture-Logs')!);
  expect(Object.keys(logs[0]).sort()).toEqual(['durationMs','requestId','status']);
  expect(JSON.stringify(logs)).not.toContain('PRIVATE');
});
it.each(['{', JSON.stringify({ ...body, consent: false }), JSON.stringify({ ...body, html: '<input>' })])('rejects malformed JSON or contract', async payload => {
  expect((await fixture.dispatchFetch('https://worker.test/v1/ai', { method: 'POST', headers, body: payload })).status).toBe(400);
});
it('rejects declared and streamed oversized bodies', async () => {
  const declared = await fixture.dispatchFetch('https://worker.test/v1/ai', { method: 'POST', headers, body: 'x'.repeat(200001) });
  expect(declared.status).toBe(413);
  const streamed = await fixture.dispatchFetch('https://worker.test/v1/ai', { method: 'POST', headers: { ...headers, 'X-Fixture-Stream': 'oversize' } });
  expect(streamed.status).toBe(413);
});
it('times out stalled uploads in the Worker runtime', async () => {
  const response = await fixture.dispatchFetch('https://worker.test/v1/ai', { method: 'POST', headers: { ...headers, 'X-Fixture-Stream': 'stall' } });
  expect(response.status).toBe(408);
  expect(await response.json()).toEqual({ ok: false, error: { code: 'timeout' } });
}, 20000);
it('does not disclose provider exceptions', async () => {
  const response = await fixture.dispatchFetch('https://worker.test/v1/ai', { method: 'POST', headers, body: JSON.stringify({ ...body, page: { ...body.page, title: 'throw' } }) });
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('PRIVATE');
  expect(response.headers.get('X-Fixture-Logs')).not.toContain('PRIVATE');
});
