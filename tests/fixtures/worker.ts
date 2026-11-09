// Test-only entry point. Never referenced by Wrangler or production code.
import { createApp, type LogEvent } from '../../server/app';
import { createWorkerHandler, type WorkerEnv } from '../../server/worker-http';
export default {
  async fetch(request: Request, env: WorkerEnv) {
    const logs: LogEvent[] = [];
    const handle = createWorkerHandler(createApp({
      identity: { authenticate: async token => token === 'Bearer fixture' ? { id: 'fixture', plan: 'free' } : null },
      limits: { free: { monthly: 1, perMinute: 1 }, pro: { monthly: 1, perMinute: 1 } },
      usage: { admit: async () => 'allowed', read: async () => ({ month: '', requests: 0 }) },
      generate: async body => {
        if (body.page.title === 'throw') throw new Error('PRIVATE_PROVIDER_SECRET');
        return { answer: 'Fixture answer', ...(body.operation === 'question' ? { targetId: 'element-1' } : {}) };
      },
      log: event => logs.push(event),
    }));
    const stream = request.headers.get('X-Fixture-Stream');
    if (stream) {
      const headers = new Headers(request.headers); headers.delete('Content-Length');
      const body = new ReadableStream<Uint8Array>({ start(controller) {
        if (stream === 'oversize') {
          controller.enqueue(new Uint8Array(100001)); controller.enqueue(new Uint8Array(100000)); controller.close();
        }
        // Otherwise intentionally leave upload pending to exercise the real deadline.
      } });
      request = new Request(request.url, { method: 'POST', headers, body, duplex: 'half' } as RequestInit);
    }
    const response = await handle(request, env);
    response.headers.set('X-Fixture-Logs', JSON.stringify(logs));
    return response;
  },
};
