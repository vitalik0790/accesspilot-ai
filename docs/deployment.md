# Development and deployment

## Local setup (no public exposure)

Requires Node.js 22+ and pnpm.

1. Install dependencies with pnpm install.
2. Copy server/.env.example to server/.env.local. Set OPENAI_API_KEY there only.
   Keep OPENAI_MODEL or select a compatible Responses/structured-output model.
3. Set the public URL ACCESSPILOT_BACKEND_URL=http://127.0.0.1:8787 in the root
   .env.local. A legacy OPENAI_API_KEY there is ignored by the extension; move it to
   server/.env.local and remove that legacy entry. Do not paste keys into chat.
4. Run pnpm build:local. Load dist/ in Chrome as an unpacked extension.
5. Copy its ID from chrome://extensions into server/.env.local as
   EXTENSION_ORIGIN=chrome-extension://YOUR_32_LETTER_EXTENSION_ID.
6. Run pnpm build:server and pnpm server:dev. Leave this terminal running.
7. Open a normal webpage, open AccessPilot, consent, and test summary/Q&A/focus.

PowerShell copy command: Copy-Item server/.env.example server/.env.local.
The server env file is read by Node --env-file at runtime, never by the extension build.
Do not overwrite an existing env file without preserving your local configuration.
If the root file is still located in OneDrive, consider moving the checkout out of
cloud sync; Git ignore does not control backup/sync services.

The development identity is shared by all admitted local requests. Origin is not
authentication. Do not expose the loopback service using a tunnel, LAN binding or proxy.
Requests use real paid provider access; the example quotas are only local test settings.
No live OpenAI request is part of the automated test suite.

## Builds and checks

- pnpm test: browser behavior, backend policy/provider/HTTP tests and a real Vite
  in-memory build with a sentinel server key.
- pnpm typecheck: strict TypeScript across extension, server, tests and build config.
- pnpm build: production extension into dist/.
- pnpm build:server: production server JavaScript into build/server/.
- pnpm build:local: extension permitting the configured loopback HTTP backend.
- pnpm server:start: server from runtime environment; does not read an env file.
- pnpm server:dev: server using ignored server/.env.local.

Production extension configuration accepts only an HTTPS origin (no userinfo, path,
query or fragment). A blank URL produces an extension with local tools and AI disabled,
and no network host permission. Set ACCESSPILOT_BACKEND_URL in the production build
environment when a backend is ready. A local HTTP value causes production build to fail,
rather than accidentally producing a store package pointing to a development server.

The build emits manifest.json from the checked-in template, replacing host permissions
and connect-src with exactly the backend origin. There is no direct OpenAI permission.
Only dist/ is an extension package. Never package the repository root, server env files,
node_modules or build/server. The backend bundle contains no key; deploy runtime secrets
through the host's secret manager. Do not place keys under public/.

The extension build checks for known legacy/root or process keys, recognizable OpenAI
keys and accidental server-module imports. Tests verify a sentinel key is absent from
actual bundled output. These checks supplement code review; arbitrary secret formats
or externally modified packaging pipelines require their own audit.

## Public deployment gates

This iteration does not provision or deploy a service. The shipped listener stays on
127.0.0.1. AUTH_MODE=disabled denies all identities; AUTH_MODE=development is refused
unless NODE_ENV=development. There is no production authentication adapter yet.
A successful production build is not permission to expose the development service.

Before public traffic:

1. Implement verified account tokens and server-owned plan lookup through IdentityProvider.
   Add the extension sign-in/token lifecycle. Test expiry, logout, revocation, replay,
   issuer/audience and cross-account access. Never ship a shared backend bearer secret.
2. Replace MemoryUsageGate with durable atomic per-user quotas and shared rate limits;
   define idempotency/refunds and global spend/concurrency controls. Test parallel requests,
   multiple replicas, failures and restarts. Configure real limits based on cost testing.
3. Add TLS termination, exact store extension Origin allowlisting, upstream network policy,
   proxy body/header/request limits, pre-auth abuse protection and operational health checks.
   CORS is not authentication. Do not trust forwarded identity/IP headers without a trusted proxy.
4. Configure content-free infrastructure logging, retention, alerting and secret rotation.
   Review backups, error reporting, request tracing and OpenAI account budget controls.
5. Deploy the server separately, inject runtime env, then build the extension against its
   HTTPS origin. Confirm installed Chrome requests (including Origin) and denied requests.
6. Perform Chrome/NVDA keyboard/focus/zoom tests, privacy review and staged user testing.

Required server settings: NODE_ENV, AUTH_MODE, PORT, EXTENSION_ORIGIN,
OPENAI_API_KEY, OPENAI_MODEL, OPENAI_TIMEOUT_MS (maximum 25000), and all four plan
limit settings. DEV_PLAN selects free/pro only in local development.
Startup errors intentionally avoid printing configuration values.

## Subsequent milestones

Authentication and durable usage are the next implementation milestone, followed by
a limited authenticated pilot and cost measurements. Billing comes after plan policies:
choose a payment provider, verify webhook signatures, handle idempotency and lifecycle
events, and test cancellations/refunds without weakening server authorization.

Chrome Web Store readiness then requires a stable backend/extension ID, reviewed package,
privacy policy and data-use disclosures consistent with actual hosting, accessible onboarding,
support information and real assistive-technology testing. No release/tag/store submission
is included here. Calendar estimates depend on provider and hosting choices; these are
separate milestones, not a claim this build is ready for public distribution.
