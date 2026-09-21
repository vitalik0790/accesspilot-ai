// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createApp } from '../server/app';
import { createHttpServer } from '../server/http';
import { MemoryUsageGate } from '../server/policy';
import type { AddressInfo } from 'node:net';
const origin = 'chrome-extension://' + 'a'.repeat(32);
it('enforces HTTP origin, authentication, body limits and JSON contract before OpenAI', async () => {
  const generate = vi.fn().mockResolvedValue({ answer: 'Summary' });
  const app = createApp({ identity: { authenticate: async token => token === 'Bearer test-user' ? { id: 'user', plan: 'free' } : null },
    usage: new MemoryUsageGate(), limits: { free: { monthly: 10, perMinute: 10 }, pro: { monthly: 20, perMinute: 20 } },
    generate, log: () => {} });
  const server = createHttpServer(app, origin);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/v1/ai';
  const headers = { Origin: origin, Authorization: 'Bearer test-user', 'Content-Type': 'application/json' };
  try {
    expect((await fetch(url, { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' }, body: '{}' })).status).toBe(403);
    expect((await fetch(url, { method: 'POST', headers: { Origin: origin }, body: '{}' })).status).toBe(401);
    expect((await fetch(url, { method: 'POST', headers, body: '{' })).status).toBe(400);
    expect((await fetch(url, { method: 'POST', headers, body: 'x'.repeat(200001) })).status).toBe(413);
    expect(generate).not.toHaveBeenCalled();
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ version: 1, consent: true, operation: 'summary', page: { title: 'Title', text: 'Facts', truncated: false, structure: [] } }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ ok: true, result: { answer: 'Summary' } });
    const options = await fetch(url, { method: 'OPTIONS', headers: { Origin: origin } });
    expect(options.status).toBe(204);
    expect(options.headers.get('access-control-allow-origin')).toBe(origin);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
