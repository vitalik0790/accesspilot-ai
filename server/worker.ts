import { createApp, ServiceError } from './app';
import { denyIdentity } from './policy';
import { createWorkerHandler, type WorkerEnv, type WorkerContext } from './worker-http';

const handle = createWorkerHandler(createApp({
  identity: denyIdentity,
  // Defense in depth: no local quotas or provider implementation in production.
  usage: { admit: async () => 'usage_limit', read: async () => ({ month: '', requests: 0 }) },
  limits: { free: { monthly: 0, perMinute: 0 }, pro: { monthly: 0, perMinute: 0 } },
  generate: async () => { throw new ServiceError('unavailable'); },
  log: event => console.info(JSON.stringify(event)),
}));

export default {
  fetch(request: Request, env: WorkerEnv, _ctx: WorkerContext): Promise<Response> {
    return handle(request, env);
  },
};
