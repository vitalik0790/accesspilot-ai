import { randomUUID } from 'node:crypto';
import { isAIRequest, validatedAnswer, type AIRequest, type AIResponse, type ErrorCode } from '../src/shared/api';
import { denyIdentity, entitled, type IdentityProvider, type PlanLimits, type UsageGate } from './policy';
import type { AIAnswer } from '../src/shared/types';
export class ServiceError extends Error {
  constructor(public code: ErrorCode) { super(code); }
}
export interface LogEvent { requestId: string; status: number; durationMs: number }
export interface Dependencies {
  identity?: IdentityProvider; usage: UsageGate; limits: PlanLimits;
  generate(request: AIRequest): Promise<AIAnswer>;
  log(event: LogEvent): void;
}
const statuses: Record<ErrorCode, number> = { unauthorized: 401, invalid_request: 400, usage_limit: 429, rate_limit: 429, unavailable: 503, timeout: 504 };
export function createApp(deps: Dependencies) {
  return {
    authenticate: (authorization?: string) => (deps.identity || denyIdentity).authenticate(authorization),
    async execute(body: unknown, identity: Awaited<ReturnType<IdentityProvider['authenticate']>>): Promise<{ status: number; body: AIResponse }> {
      const start = Date.now(), requestId = randomUUID();
      let status = 503;
      try {
        if (!identity || !identity.id || !['free', 'pro'].includes(identity.plan)) throw new ServiceError('unauthorized');
        if (!isAIRequest(body)) throw new ServiceError('invalid_request');
        if (!entitled(identity.plan, body.operation)) throw new ServiceError('unauthorized');
        const admitted = await deps.usage.admit(identity, deps.limits[identity.plan], Date.now());
        if (admitted !== 'allowed') throw new ServiceError(admitted);
        const result = validatedAnswer(await deps.generate(body), body.operation === 'question' ? body.page.interactive : []);
        if (!result) throw new ServiceError('unavailable');
        status = 200;
        return { status, body: { ok: true, result } };
      } catch (error) {
        const code = error instanceof ServiceError ? error.code : 'unavailable';
        status = statuses[code];
        return { status, body: { ok: false, error: { code } } };
      } finally {
        // A logging failure must never change billing or return internal details.
        try { deps.log({ requestId, status, durationMs: Date.now() - start }); } catch { /* sink unavailable */ }
      }
    },
  };
}
