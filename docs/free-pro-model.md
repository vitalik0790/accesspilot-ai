# Free and Pro model

No prices, payment provider, subscriptions or final quotas are implemented.

| Capability | Free | Pro |
| --- | --- | --- |
| Local accessibility checks | Available locally | Available locally |
| Browser text-to-speech | Available locally | Available locally |
| AI page summaries | Configured usage limits | Higher configured limits |
| AI page questions | Configured usage limits | Higher configured limits |
| Focus navigation | Available for a valid suggestion | Available for a valid suggestion |
| Voice navigation | Not implemented | Future |
| Image descriptions | Not implemented | Future |
| Advanced AI navigation | Not implemented | Future |

Focus itself and speech use no AI quota. Getting a fresh AI suggestion requires Q&A.
Local tools remain usable when the backend is offline or access/usage is denied.

IdentityProvider returns a server-owned identity and free/pro plan. The development
adapter uses DEV_PLAN; clients cannot submit a plan in the API contract.
entitled() enables only implemented capabilities for either plan; future features
remain unavailable even for Pro until separately implemented and reviewed.

FREE_MONTHLY_REQUESTS, FREE_REQUESTS_PER_MINUTE, PRO_MONTHLY_REQUESTS and
PRO_REQUESTS_PER_MINUTE are required deployment settings. No final values are hard-coded.
Pro limits cannot be lower than Free. Example values are development fixtures.

Monthly usage means admitted provider attempts in a UTC calendar month, not successful
answers, tokens, dollars, or a subscription billing cycle. Errors/timeouts still consume
a unit. A future commercial policy must decide billing-cycle alignment, refunds,
idempotency, upgrades/downgrades and token/cost controls. Restartable in-memory counters
are not sufficient for selling or enforcing public plans.

Next: verified accounts and persistent plan/usage records; then trusted billing events
with signature verification and idempotent plan updates. Never grant Pro based on a
client flag or an unverified payment redirect.
