# Native Cloudflare Worker — Milestone 1

The Worker entry point is `server/worker.ts`, with native
`fetch(request, env, ctx)` handling in `server/worker-http.ts`. The existing Node
entry point and local development workflow remain available. Both adapters reuse
`createApp` and the same JSON contract/validation. The application now uses Web
Crypto instead of importing `node:crypto`.

## Deliberately closed production boundary

The Worker hard-wires `denyIdentity`. No environment variable, bearer token,
development mode, Origin header, or loopback assumption can enable AI. Even if
authentication were accidentally changed, deny-only usage and generation adapters
remain in place. The Worker does not import the OpenAI client or Node configuration.
It requires **no OpenAI key** in this milestone and performs no outbound requests.

The only binding is `EXTENSION_ORIGIN`, an exact `chrome-extension://` origin with
a 32-letter extension ID. Missing/invalid configuration returns safe 503; a wrong
or missing request origin returns 403. Correct-origin POST `/v1/ai` returns the
existing 401 envelope `{ "ok": false, "error": { "code": "unauthorized" } }`.
Preflight succeeds only for the configured origin. It is not authorization.

Authentication occurs before reading bodies. The adapter's authenticated path is
covered by a separate test-only entry point, never the production configuration.
It enforces JSON content type, rejects content encoding, checks declared length,
counts streamed bytes up to 200,000, validates UTF-8/JSON and the shared contract,
and applies a 10-second body-read deadline. A stalled upload returns 408 with the
existing `timeout` error code. Internal failures return safe 503 responses.
Every response has no-store and nosniff headers; Origin-dependent responses vary
by Origin. No raw request, body, credentials or exception details are logged.

Node socket settings are not copied into Workers. Cloudflare owns transport/header
limits; application byte/deadline checks cover body parsing. The existing Node
OpenAI timeout is unchanged. Provider/identity/database deadlines must be reviewed
again when those adapters are introduced into Workers.

## Local verification only

- `pnpm typecheck`
- `pnpm test` — existing tests plus real Miniflare/workerd tests
- `pnpm test:worker` — Worker-runtime suite only
- `pnpm build` — extension
- `pnpm build:server` — Node backend
- `pnpm build:worker` — Wrangler **dry-run**, output in ignored `build/worker`

Wrangler and Miniflare are pinned matching development tools. The existing Vitest
version remains unchanged. Only esbuild/workerd dependency setup scripts are
allowed; unused sharp setup is explicitly disabled. No new runtime dependency is
added to the extension. Tests run workerd locally with synthetic content and a
blocked outbound service on the production Worker; no paid provider calls occur.

`wrangler.jsonc` pins a tested-target compatibility date, has no Node compatibility
flag or routes, disables workers.dev/preview URLs, telemetry and observability,
and leaves the origin blank. It contains no credentials. `.wrangler`, `.dev.vars`
and their variants are ignored. Do not put secrets in Wrangler vars or build defines.

The build command contains `deploy --dry-run`; it does not upload or deploy.
There is intentionally no deployment script. A real deployment requires separate
authorization and review of secrets, routes, logging and origin configuration.
Do not enable request/URL/header tracing without a privacy review.

Before public AI access, implement verified authentication and durable atomic
quotas, replace all three deny-only adapters explicitly, and repeat runtime and
privacy tests. Never reuse the Node development identity in the Worker. Accessibility
checks, speech, extraction, focus validation and consent UI are unchanged.

## Validation limitation on the development machine

On 2026-11-08, workerd exited with native Windows exception `0xc0000005` during
startup, before Worker tests executed. The same crash reproduced with a minimal
in-memory Worker unrelated to AccessPilot. WSL is not installed. This is a runtime
verification blocker, not a passing test result. No runtime protections were disabled.
Run the full suite on a functioning workerd installation (for example a supported
Linux development/CI environment) or repair the Windows runtime before accepting
this milestone. Do not replace these tests with Node mocks or skip them for release.

Verification results: all 81 pre-existing tests passed; 16 Worker tests could not execute because the runtime failed during suite setup. Strict TypeScript, extension, Node backend and Worker dry-run builds passed. A scan of publishable files plus extension/Worker artifacts found no configured credentials or recognizable key patterns. The Worker artifact contained no Node import, OpenAI endpoint or development identity switch. No deployment, commit or push was performed.

## Linux CI verification (prepared, not executed)

`.github/workflows/verify.yml` runs on `ubuntu-latest` for pull requests, pushes to
main or feature/cloudflare-worker-adapter, and manual dispatch. It pins Node 24.22.1 in `.node-version`, pnpm 11.25.0
in the workflow/packageManager field, and GitHub actions by immutable commit SHA.
`pnpm install --frozen-lockfile` installs exactly the repository's dependency graph;
it does not update the existing package version ranges. The Ubuntu runner image
itself can change because ubuntu-latest was explicitly selected.

The job has contents:read only, disables persisted Git credentials, uses no secret
references or deployment credentials, and uploads no artifacts. It does not use
pull_request_target. Worker compilation uses only the existing dry-run command.
There is no skipped Worker suite or continue-on-error setting. A runtime startup
failure or any failing test makes CI fail.

Exact verification commands after Node/pnpm setup:

```sh
node scripts/check-security.mjs
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm build:server
pnpm build:worker
pnpm check:security --artifacts
git diff --check
git diff --exit-code -- package.json pnpm-lock.yaml pnpm-workspace.yaml
```

`pnpm test` includes all 97 current cases: 81 existing tests and 16 Miniflare/workerd
tests. No real OpenAI call is required. `pnpm test:worker` can run the latter alone.
The security guard scans publishable/indexed files, rejects private configuration
and generated files in Git, and scans all three build outputs. It checks recognizable
credential patterns and configured local credentials without printing them. The
one narrowly exempted URL is an existing dummy security-test fixture. Pattern checks
are a supplemental guard, not a guarantee of detecting every possible secret format.

GitHub Actions cannot execute a workflow that exists only in this local working
tree. No Linux CI run has occurred. A separately authorized commit/push is required
to make the workflow and source available to a runner. Manual workflow_dispatch
also requires the workflow on the default branch. Once authorized, prefer a review
branch/PR run before accepting Milestone 1; require the complete Linux job to pass.
The Windows runtime limitation remains documented above and is not a reason to
mark the 16 Worker tests successful or to weaken production logic.
