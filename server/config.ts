import type { Plan, PlanLimits } from './policy';
export function loadConfig(env: NodeJS.ProcessEnv) {
  const development = env.NODE_ENV === 'development';
  const authMode = env.AUTH_MODE || 'disabled';
  if (!['disabled', 'development'].includes(authMode) || (authMode === 'development' && !development)) throw new Error('Unsafe authentication configuration.');
  const positive = (key: string, max = 1000000) => {
    const value = Number(env[key]);
    if (!Number.isSafeInteger(value) || value <= 0 || value > max) throw new Error('Missing or invalid server setting: ' + key);
    return value;
  };
  const limits: PlanLimits = {
    free: { monthly: positive('FREE_MONTHLY_REQUESTS'), perMinute: positive('FREE_REQUESTS_PER_MINUTE') },
    pro: { monthly: positive('PRO_MONTHLY_REQUESTS'), perMinute: positive('PRO_REQUESTS_PER_MINUTE') },
  };
  if (limits.pro.monthly < limits.free.monthly || limits.pro.perMinute < limits.free.perMinute) throw new Error('Pro limits must be at least Free limits.');
  const origin = env.EXTENSION_ORIGIN || '';
  if (!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) throw new Error('Configure the exact extension origin.');
  if (!env.OPENAI_API_KEY?.trim() || !env.OPENAI_MODEL?.trim()) throw new Error('Missing server OpenAI configuration.');
  const plan = env.DEV_PLAN || 'free';
  if (plan !== 'free' && plan !== 'pro') throw new Error('Invalid development plan.');
  return { development, authMode, origin, limits, plan: plan as Plan,
    apiKey: env.OPENAI_API_KEY.trim(), model: env.OPENAI_MODEL.trim(),
    timeoutMs: positive('OPENAI_TIMEOUT_MS', 25000), port: positive('PORT', 65535) };
}
