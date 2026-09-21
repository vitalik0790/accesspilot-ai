import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { createApp } from './app';
const maxBytes = 200000; // Allows bounded Unicode fields, not arbitrary payloads.
export function createHttpServer(app: ReturnType<typeof createApp>, origin: string) {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json', Connection: 'close' });
      res.end(JSON.stringify(body));
    };
    const fail = (status: number, code: string) => send(status, { ok: false, error: { code } });
    try {
      if (req.headers.origin !== origin) return fail(403, 'unauthorized');
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      if (req.url !== '/v1/ai') return fail(404, 'invalid_request');
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'POST');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.writeHead(204); res.end(); return;
      }
      if (req.method !== 'POST') return fail(405, 'invalid_request');
      const identity = await app.authenticate(req.headers.authorization);
      if (!identity) return fail(401, 'unauthorized');
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '') || req.headers['content-encoding']) return fail(400, 'invalid_request');
      if (Number(req.headers['content-length'] || 0) > maxBytes) return fail(413, 'invalid_request');
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > maxBytes) { fail(413, 'invalid_request'); return; }
        chunks.push(Buffer.from(chunk));
      }
      let body: unknown;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return fail(400, 'invalid_request'); }
      const result = await app.execute(body, identity);
      send(result.status, result.body);
    } catch { if (!res.headersSent) fail(503, 'unavailable'); else res.destroy(); }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 30;
  server.maxConnections = 100;
  server.setTimeout(35000, socket => socket.destroy());
  return server;
}
