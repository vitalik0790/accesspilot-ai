import type { createApp } from './app';
import type { ErrorCode } from '../src/shared/api';

export interface WorkerEnv { EXTENSION_ORIGIN?: string }
// Only the execution-context capability this entry point may need; no Node types.
export interface WorkerContext { waitUntil(promise: Promise<unknown>): void }
const maxBytes = 200000;
const uploadTimeoutMs = 10000;

class BodyError extends Error {
  constructor(readonly status: number, readonly code: ErrorCode) { super(code); }
}

async function readJson(request: Request): Promise<unknown> {
  const length = request.headers.get('Content-Length');
  if (length !== null && !/^\d+$/.test(length)) throw new BodyError(400, 'invalid_request');
  if (length !== null && Number(length) > maxBytes) throw new BodyError(413, 'invalid_request');
  if (!request.body) throw new BodyError(400, 'invalid_request');
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new BodyError(408, 'timeout'));
      void reader.cancel().catch(() => {});
    }, uploadTimeoutMs);
  });
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new BodyError(413, 'invalid_request');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new BodyError(400, 'invalid_request'); }
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// Dependency injection exists for adapter tests, never through request/env data.
export function createWorkerHandler(app: Pick<ReturnType<typeof createApp>, 'authenticate' | 'execute'>) {
  return async (request: Request, env: WorkerEnv): Promise<Response> => {
    const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin' });
    const send = (status: number, body: unknown) => Response.json(body, { status, headers });
    const fail = (status: number, code: ErrorCode) => send(status, { ok: false, error: { code } });
    try {
      const origin = env.EXTENSION_ORIGIN;
      if (typeof origin !== 'string' || !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return fail(503, 'unavailable');
      if (request.headers.get('Origin') !== origin) return fail(403, 'unauthorized');
      headers.set('Access-Control-Allow-Origin', origin);
      const url = new URL(request.url);
      if (url.pathname !== '/v1/ai' || url.search) return fail(404, 'invalid_request');
      if (request.method === 'OPTIONS') {
        headers.set('Access-Control-Allow-Methods', 'POST');
        headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return new Response(null, { status: 204, headers });
      }
      if (request.method !== 'POST') return fail(405, 'invalid_request');
      // Authenticate before reading potentially sensitive/unbounded content.
      const identity = await app.authenticate(request.headers.get('Authorization') || undefined);
      if (!identity) return fail(401, 'unauthorized');
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type') || '') || request.headers.has('Content-Encoding')) return fail(400, 'invalid_request');
      const result = await app.execute(await readJson(request), identity);
      return send(result.status, result.body);
    } catch (error) {
      return error instanceof BodyError ? fail(error.status, error.code) : fail(503, 'unavailable');
    }
  };
}
