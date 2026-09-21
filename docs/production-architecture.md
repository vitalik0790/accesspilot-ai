# Production backend boundary

## Status

The v0.2 extension now calls an AccessPilot backend instead of OpenAI directly.
This is a tested production boundary with a local reference server, **not a publicly
launchable hosted service**. The default identity provider denies all requests.
The only working identity adapter is explicitly development-only and the shipped
HTTP listener always binds to 127.0.0.1. Authentication and persistent quotas must
be integrated before public use. There is no payment integration.

## Components

- Popup: explicit consent, accessible status and errors, optional speech.
- Worker/content: unchanged filtered extraction, local checks and snapshot-bound focus.
- src/services/ai.ts: projects allowed fields and calls the backend; no provider credentials.
- src/shared/api.ts: versioned contract, request validation and answer/target validation.
- server/http.ts: exact extension-origin allowlist, bounded JSON body, HTTP timeouts.
- server/app.ts: identity, validation, entitlement, atomic usage admission, generation, safe response.
- server/policy.ts: IdentityProvider, Plan, MonthlyUsage, UsageGate, entitlement policy.
- server/openai.ts: only component making provider requests; runtime key and model configuration.
- server/config.ts: validates server environment and disallows development identity in production.

Node.js 22+, TypeScript, native HTTP and fetch; no new runtime dependencies.
Vite builds the server separately into build/server/index.js, without bundling secrets.

## API v1

POST /v1/ai, Content-Type: application/json, explicit consent: true.

Summary:
```json
{
  "version": 1,
  "operation": "summary",
  "consent": true,
  "page": {"title": "Example", "text": "Page facts", "truncated": false, "structure": []}
}
```

Question adds operation: "question", a question string and page.interactive:
```json
{"id": "element-1", "role": "button", "name": "Checkout", "disabled": false}
```

Success:
```json
{"ok": true, "result": {"answer": "Use Checkout.", "targetId": "element-1"}}
```
targetId is optional. Summary responses never offer a target.
Failure:
```json
{"ok": false, "error": {"code": "usage_limit"}}
```
Codes: unauthorized (401; origin rejection 403), invalid_request (400; transport also
404/405/413), usage_limit/rate_limit (429), unavailable (503), timeout (504).
The client maps codes to safe accessible text. Internal/provider messages are never forwarded.

Unknown fields and oversized strings/arrays are rejected. Limits: title 300 characters,
text 16,000; 40 structure cues with 160-character names; Q&A 1,000 characters and
100 interactive records with 160-character names, 40-character roles and unique bounded IDs.
Transport body limit: 200,000 bytes. No client-provided model, plan, user ID,
provider URL, instructions or tool definitions are accepted. Text is untrusted data:
schema validation cannot determine whether text itself contains sensitive information.

## Identity and plans

IdentityProvider resolves a verified identity and server-owned free/pro plan.
The default denies access. The local mock assigns local-developer and DEV_PLAN
to requests from the explicitly configured extension origin. This is not authentication:
local processes can spoof Origin. Never expose or tunnel the development listener.
CORS/Origin is defense in depth, not evidence of user identity.

Future authentication must validate issuer, audience, signature and expiry, then resolve
plan status from trusted server storage. Do not accept a client plan claim.
The extension currently sends no bearer credentials or cookies; the future sign-in flow
must supply short-lived user tokens, never OpenAI keys.

## Metering and limits

UsageGate.admit atomically checks per-identity fixed-minute rate limits and UTC calendar-month
request counts before the provider call. One admitted attempt consumes one monthly unit,
including upstream errors/timeouts. Invalid/unauthorized/denied requests consume no unit.
There are no automatic retries. Future refund/idempotency policy requires a separate decision.
Counts are requests, not tokens or currency. Free and Pro limits come from server environment;
sample values are for local testing, not final commercial entitlements.

MemoryUsageGate bounds identities to 10,000, drops previous-month entries and fails closed
at capacity. It is atomic within one Node process only. Restart loses counts; multiple
instances do not share them. Replace it with transactional durable storage before public use.
Add token/cost accounting, global concurrency/spend caps, abuse prevention, alerts and
edge rate limiting before increasing exposure. Fixed-minute windows permit bursts at boundaries.

## Failure and security behavior

OpenAI calls retain store:false and structured Q&A output. There are no provider tools.
Server and client discard unknown/disabled targets, then existing document/snapshot validation
controls local focus. No automatic click/submit is introduced. Page handlers may react to focus.

The provider timeout covers response headers and body reading, up to 25 seconds. The client
waits up to 30 seconds. HTTP uploads/headers have a 10-second deadline and sockets a 35-second
idle timeout. Redirects are rejected on both network hops. Closing the popup does not guarantee
cancellation of a request already admitted; it may still incur cost.

Application logs contain only a random request ID, status and duration. No page text,
questions, answers, credentials, authorization headers, IP addresses or identity IDs are logged
by this application. HTTP rejections before app execution currently have no application event.
Hosting/proxy logs require independent configuration and retention rules.

See [deployment](deployment.md), [privacy](privacy.md), and [plans](free-pro-model.md).
