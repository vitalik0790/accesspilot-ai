import { loadConfig } from './config';
import { createApp } from './app';
import { createHttpServer } from './http';
import { MemoryUsageGate, denyIdentity } from './policy';
import { generate } from './openai';
try {
  const config = loadConfig(process.env);
  const app = createApp({
    identity: config.authMode === 'development' ? { authenticate: async () => ({ id: 'local-developer', plan: config.plan }) } : denyIdentity,
    usage: new MemoryUsageGate(), limits: config.limits,
    generate: request => generate(request, config),
    log: event => console.info(JSON.stringify(event)),
  });
  // This starter deliberately has no public listener. Add verified authentication
  // and durable quotas before changing the deployment boundary.
  createHttpServer(app, config.origin).listen(config.port, '127.0.0.1', () => {
    console.info('AccessPilot backend listening on loopback. Authentication mode: ' + config.authMode);
  });
} catch {
  console.error('Backend startup refused. Check the documented server configuration.');
  process.exitCode = 1;
}
