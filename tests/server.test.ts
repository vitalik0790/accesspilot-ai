// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createApp } from '../server/app';
import { MemoryUsageGate, entitled } from '../server/policy';
import { generate } from '../server/openai';
import { isAIRequest, type AIRequest } from '../src/shared/api';
import { loadConfig } from '../server/config';
const request: AIRequest = { version: 1, consent: true, operation: 'summary', page: { title: 'Title', text: 'Private page facts', truncated: false, structure: [] } };
const identity = { id: 'test-user', plan: 'free' as const };
const limits = { free: { monthly: 2, perMinute: 1 }, pro: { monthly: 4, perMinute: 2 } };
function fixture() {
  const log = vi.fn(), upstream = vi.fn().mockResolvedValue({ answer: 'Summary' });
  const usage = new MemoryUsageGate();
  return { log, upstream, usage, app: createApp({ usage, limits, generate: upstream, log }) };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('denies unauthorized requests before provider or usage work', async () => {
  const { app, upstream, usage } = fixture();
  expect(await app.authenticate('Bearer forged')).toBeNull();
  expect((await app.execute(request, null)).status).toBe(401);
  expect(upstream).not.toHaveBeenCalled();
  expect((await usage.read(identity, Date.now())).requests).toBe(0);
});
it.each([
  { ...request, plan: 'pro' }, { ...request, model: 'client-model' }, { ...request, consent: false },
  { ...request, page: { ...request.page, html: '<input value="private">' } },
  { ...request, page: { ...request.page, fields: [{ value: 'private' }] } },
  { ...request, page: { ...request.page, text: 'x'.repeat(16001) } },
  { ...request, operation: 'question', question: '' },
])('rejects malformed or over-sharing requests', async body => {
  const { app, upstream } = fixture();
  expect(isAIRequest(body)).toBe(false);
  expect((await app.execute(body, identity)).status).toBe(400);
  expect(upstream).not.toHaveBeenCalled();
});
it('meters successes and emits only content-free logs', async () => {
  const { app, usage, log } = fixture();
  expect(await app.execute(request, identity)).toEqual({ status: 200, body: { ok: true, result: { answer: 'Summary' } } });
  expect((await usage.read(identity, Date.now())).requests).toBe(1);
  expect(Object.keys(log.mock.calls[0][0]).sort()).toEqual(['durationMs','requestId','status']);
  expect(JSON.stringify(log.mock.calls)).not.toContain('Private');
});
it('enforces concurrent rate admissions and monthly limits', async () => {
  const usage = new MemoryUsageGate(), now = Date.UTC(2026, 8, 1);
  expect(await Promise.all([usage.admit(identity, limits.free, now), usage.admit(identity, limits.free, now)])).toEqual(['allowed','rate_limit']);
  expect(await usage.admit(identity, limits.free, now + 60000)).toBe('allowed');
  expect(await usage.admit(identity, limits.free, now + 120000)).toBe('usage_limit');
  expect(await usage.admit(identity, limits.free, Date.UTC(2026, 9, 1))).toBe('allowed');
});
it('uses server-owned Free/Pro limits and leaves future features unavailable', async () => {
  const usage = new MemoryUsageGate(), pro = { id: 'pro-user', plan: 'pro' as const };
  expect(await usage.admit(pro, limits.pro, 0)).toBe('allowed');
  expect(await usage.admit(pro, limits.pro, 0)).toBe('allowed');
  for (const plan of ['free','pro'] as const) {
    for (const feature of ['summary','question','speech','focus','local-checks'] as const) expect(entitled(plan, feature)).toBe(true);
    for (const feature of ['voice','images','advanced-navigation'] as const) expect(entitled(plan, feature)).toBe(false);
  }
});
it('returns usage/rate codes and never leaks internal errors', async () => {
  const { app, upstream } = fixture();
  upstream.mockRejectedValue(new Error('secret provider response'));
  expect((await app.execute(request, identity)).body).toEqual({ ok: false, error: { code: 'unavailable' } });
  expect((await app.execute(request, identity)).body).toEqual({ ok: false, error: { code: 'rate_limit' } });
  const full = createApp({ usage: { admit: async () => 'usage_limit', read: async () => ({ month: '', requests: 2 }) }, limits, generate: upstream, log: () => {} });
  expect((await full.execute(request, identity)).body).toEqual({ ok: false, error: { code: 'usage_limit' } });
});
const config = { apiKey: 'server-test-placeholder', model: 'test-model', timeoutMs: 50 };
const output = (text: string) => ({ output: [{ type: 'message', content: [{ type: 'output_text', text }] }] });
it.each([false,true])('preserves successful OpenAI summary/Q&A (%s)', async question => {
  const q: AIRequest = question ? { ...request, operation: 'question', question: 'Where?', page: { ...request.page, interactive: [{ id: 'element-1', role: 'button', name: 'Checkout', disabled: false }] } } : request;
  const mock = vi.fn().mockResolvedValue({ ok: true, json: async () => output(question ? JSON.stringify({ answer: 'Use Checkout', targetId: 'element-1' }) : 'Summary') });
  vi.stubGlobal('fetch', mock);
  expect(await generate(q, config)).toEqual(question ? { answer: 'Use Checkout', targetId: 'element-1' } : { answer: 'Summary' });
  const body = JSON.parse(mock.mock.calls[0][1].body);
  expect(body.store).toBe(false); expect(body.model).toBe(config.model);
  expect(body.instructions).toContain('untrusted');
  expect(body.tools).toBeUndefined();
});
it.each([401,429,500])('hides OpenAI error %s', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }));
  await expect(generate(request, config)).rejects.toMatchObject({ code: 'unavailable' });
});
it('aborts stalled OpenAI requests on timeout', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))))));
  const pending = expect(generate(request, config)).rejects.toMatchObject({ code: 'timeout' });
  await vi.advanceTimersByTimeAsync(51); await pending;
});
it('rejects production mock identity configuration', () => {
  expect(() => loadConfig({ NODE_ENV: 'production', AUTH_MODE: 'development' })).toThrow('Unsafe');
});


it.each(['not json', '{}', '{"answer":"","targetId":null}', '{"answer":"Answer","targetId":42}'])('rejects malformed provider Q&A: %s', async text => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => output(text) }));
  await expect(generate({ ...request, operation: 'question', question: 'Where?', page: { ...request.page, interactive: [] } }, config)).rejects.toMatchObject({ code: 'unavailable' });
});
it.each(['invented', 'element-2'])('server discards unsafe provider target %s', async targetId => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => output(JSON.stringify({ answer: 'Answer', targetId })) }));
  const question: AIRequest = { ...request, operation: 'question', question: 'Where?', page: { ...request.page, interactive: [{ id: 'element-2', name: 'Disabled', role: 'button', disabled: true }] } };
  expect(await generate(question, config)).toEqual({ answer: 'Answer' });
});
it('rejects duplicate target IDs and entered values inside interactive records', () => {
  const element = { id: 'element-1', role: 'textbox', name: 'Search', disabled: false };
  const q = { ...request, operation: 'question', question: 'Where?', page: { ...request.page, interactive: [element, element] } };
  expect(isAIRequest(q)).toBe(false);
  expect(isAIRequest({ ...q, page: { ...q.page, interactive: [{ ...element, value: 'private' }] } })).toBe(false);
});
it('keeps the timeout active while reading the provider body', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((_url, options) => Promise.resolve({ ok: true, json: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))) })));
  const pending = expect(generate(request, config)).rejects.toMatchObject({ code: 'timeout' });
  await vi.advanceTimersByTimeAsync(51); await pending;
});
