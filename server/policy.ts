export type Plan = 'free' | 'pro';
export interface Identity { id: string; plan: Plan }
export interface IdentityProvider { authenticate(authorization: string | undefined): Promise<Identity | null> }
export const denyIdentity: IdentityProvider = { authenticate: async () => null };
export type Feature = 'summary' | 'question' | 'local-checks' | 'speech' | 'focus' | 'voice' | 'images' | 'advanced-navigation';
// Future Pro capabilities are intentionally unavailable, even to Pro identities.
export function entitled(plan: Plan, feature: Feature): boolean {
  return (plan === 'free' || plan === 'pro') && ['summary', 'question', 'local-checks', 'speech', 'focus'].includes(feature);
}
export interface Limits { monthly: number; perMinute: number }
export type PlanLimits = Record<Plan, Limits>;
export interface MonthlyUsage { month: string; requests: number }
export interface UsageGate {
  // Admission must be atomic across both limits. One unit = admitted upstream attempt.
  admit(identity: Identity, limits: Limits, now: number): Promise<'allowed' | 'usage_limit' | 'rate_limit'>;
  read(identity: Identity, now: number): Promise<MonthlyUsage>;
}
export class MemoryUsageGate implements UsageGate {
  private entries = new Map<string, { month: string; requests: number; minute: number; burst: number }>();
  async admit(identity: Identity, limits: Limits, now: number) {
    const month = new Date(now).toISOString().slice(0, 7);
    const minute = Math.floor(now / 60000);
    for (const [id, entry] of this.entries) if (entry.month !== month) this.entries.delete(id);
    let entry = this.entries.get(identity.id);
    if (!entry) {
      if (this.entries.size >= 10000) return 'rate_limit' as const;
      entry = { month, requests: 0, minute, burst: 0 }; this.entries.set(identity.id, entry);
    }
    if (entry.minute !== minute) { entry.minute = minute; entry.burst = 0; }
    if (entry.requests >= limits.monthly) return 'usage_limit' as const;
    if (entry.burst >= limits.perMinute) return 'rate_limit' as const;
    entry.requests++; entry.burst++;
    return 'allowed' as const;
  }
  async read(identity: Identity, now: number): Promise<MonthlyUsage> {
    const month = new Date(now).toISOString().slice(0, 7), entry = this.entries.get(identity.id);
    return { month, requests: entry?.month === month ? entry.requests : 0 };
  }
}
