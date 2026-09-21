# AccessPilot AI

AccessPilot AI is an open-source Chrome extension for blind and visually impaired people who want another way to understand the page they are reading. It offers short AI summaries, questions about the current page, optional spoken responses, and basic local accessibility checks.

The project aims to reduce the effort involved in finding a page's purpose and important information. AI may help organize extracted text and limited structure cues into a concise explanation, particularly when a page is complex or poorly structured. Its answers can be incomplete or wrong, and it cannot recover information that the extractor cannot read.

AccessPilot AI **complements existing screen readers; it does not replace them**. Screen readers remain essential for reading, navigation, and interaction. This extension does not repair the underlying website or make inaccessible controls operable. It is an MIT-licensed MVP for evaluation, not yet a production-ready Chrome Web Store release.

## Why AccessPilot AI?

Many websites can still be difficult to understand or navigate with assistive technology. Complex layouts, missing labels, poor semantics, and inaccessible content can make it hard to identify what matters or decide where to go next. A short explanation and focused questions may offer additional context alongside a user's usual tools. Whether that context is useful must be evaluated with blind and visually impaired users; accessibility cannot be established by AI output alone.

## Current MVP

- On-demand summaries of extracted text from the current HTTP/HTTPS page using OpenAI.
- Independent questions about a fresh snapshot of that page, without conversation history.
- Browser SpeechSynthesis reading with manual start/stop and automatic reading off by default.
- Local checks for missing image alt attributes, unnamed buttons, and unlabeled native form fields; no API key needed for these checks.
- A React popup with native keyboard controls, visible focus, loading/error/result status announcements, and a link to results.
- A bounded representation of page text and short headings, landmarks, links/buttons, labels, and image alt text. No raw DOM is sent to the model.
- v0.2 interactive-element discovery and explicit focus navigation from Q&A suggestions. The extension scrolls and focuses only after you activate the offered button.

The MVP does not click, submit forms, accept voice commands, or analyze image pixels. Chrome protected pages, iframe/shadow DOM content, and unloaded content are outside its current extraction scope. Keyboard behavior has automated coverage; real screen-reader and Chrome popup testing remains required.

## Element discovery and focus navigation (v0.2)

Ask a question such as **How can I schedule a service?**, **Where is checkout?**, or **Find the search field**. Q&A includes up to 100 visible native buttons, links, form controls, and supported ARIA widgets in document order. Each record contains a temporary ID, role, name (up to 160 characters), and disabled state. Names use associated labels, ARIA names, safe text, image alt text, or title fallback; entered values and password controls are excluded. Unnamed controls may be recorded but cannot be offered as focus targets.

The model returns a structured answer and an optional target ID. Only a named, enabled ID present in that snapshot can produce **Move focus to [element name]**. Use Tab to reach this native button and Enter or Space to activate it. The extension scrolls the original element into view, focuses it, stops its own speech, and closes the popup so your screen reader can announce the page control naturally. Use normal keyboard navigation afterward.

**Focus does not mean activation.** AccessPilot does not call click, submit, or execute selectors/JavaScript supplied by the model. You decide whether to activate the control yourself. This avoids treating an AI suggestion as permission to submit information, purchase something, or navigate away. However, websites can run their own code in response to focus or scrolling; those handlers are outside the extension's control.

The content script keeps an isolated in-memory map from snapshot IDs to actual element references; IDs are not written into the page DOM. The worker validates the offered ID, active tab, URL, and original Chrome document ID. The content script rechecks visibility, disabled state, name, role, input type, connection, and link destination. Removed/replaced controls, a new snapshot, changed page, five-minute expiry, or lost service-worker state require asking again. A failure is announced in the popup instead of choosing another element.

This is bounded, heuristic discovery, not a complete accessible-name or focus-navigation engine. Duplicate names can be ambiguous; later elements may be omitted; custom widgets may reject focus or redirect it. Hidden referenced labels and editable regions remain conservatively excluded. Some custom controls temporarily receive `tabindex="-1"`, restored on blur without creating a new tab stop. Live testing with Chrome and screen readers is still required. Q&A requires a model supporting the Responses API's structured JSON output; summaries remain plain text.

## Roadmap

These are proposed directions, not release dates or commitments. Later features require privacy and accessibility review.

### v0.1 — implemented foundation

- Page summarization
- Questions about the current page
- Text-to-speech
- Basic local accessibility checks
- Keyboard-accessible UI

### v0.2 — current iteration

- Interactive element discovery with bounded names, roles, disabled states, and snapshot IDs
- Optional AI target suggestions with validated, user-triggered focus navigation
- No automatic clicks or submissions

### v0.3 — planned

- AI image descriptions
- Better handling of complex web applications
- Richer accessibility analysis

### Future

- Voice commands and broader semantic page navigation
- Authenticated public deployment and durable usage controls
- Human confirmation before sensitive AI actions
- Observability and cost controls
- User testing with blind and visually impaired users
- Potential Chrome Web Store release

User testing should begin during MVP evaluation rather than wait for later features. Secure API handling is a prerequisite for distributing a build that uses a project-owned key.

## Quick start

Requires Node.js 22+ and pnpm. The OpenAI key now belongs **only on the backend**.
No key is embedded in or returned to the Chrome extension.

```sh
pnpm install
pnpm test
pnpm build          # production extension; blank backend URL leaves AI disabled
pnpm build:server   # separate backend bundle
```

For working local AI, follow [development setup](docs/deployment.md): configure
`server/.env.local`, set the public loopback backend URL in the root `.env.local`,
run `pnpm build:local`, load `dist/` in Chrome, configure its exact extension origin,
and run `pnpm server:dev`. The local server must remain running.

Production builds use only `ACCESSPILOT_BACKEND_URL`, an HTTPS origin. They do not
require `OPENAI_API_KEY`. Old keyed builds should not be distributed. No server
credentials are copied from old environment files automatically.

Open a normal webpage and use the toolbar or **Alt+Shift+A**. Local checks need no
backend. Summary/Q&A require **Allow sending this page to AccessPilot and OpenAI**.
Tab/Shift+Tab moves between controls; Space toggles consent; Enter activates buttons.
Speech is optional and automatic reading defaults off. Keep the popup open during
requests and speech. Reload the extension after rebuilding.

## Architecture

```text
Popup → typed worker message → filtered active-page extraction
                            ├─ local accessibility checks
                            └─ compact JSON → AccessPilot backend
                                              ├─ identity / entitlements
                                              ├─ rate and monthly usage admission
                                              └─ OpenAI (server-only credentials)
Popup ← answer + validated optional target ID
  ├─ browser SpeechSynthesis
  └─ explicit focus action → existing local snapshot/document validation
```

`src/services/ai.ts` is the backend client; `src/shared/api.ts` defines the versioned
contract. `server/` contains the Node HTTP boundary, policy adapters and provider
service. The existing `src/content`, `src/accessibility`, and speech service preserve
v0.2 behavior. No payments or new runtime dependencies are added.

This iteration is a production **boundary**, not a public launch. The reference
server binds only to loopback and uses an explicitly enabled local mock identity.
Its default identity provider denies requests. Public authentication and durable,
shared quotas must be implemented before hosting it for users.
See [production architecture](docs/production-architecture.md) and
[deployment requirements](docs/deployment.md).

## Free and Pro preparation

Both plans retain local accessibility checks, text-to-speech, focus navigation and
limited AI summary/Q&A. Pro supports higher configurable limits. Voice navigation,
image descriptions and advanced navigation remain future features, disabled for both
plans today. There are no prices, subscriptions or final usage quotas in code.
See [Free and Pro model](docs/free-pro-model.md).

## Permissions

| Manifest entry | Purpose |
| --- | --- |
| `activeTab` | Temporary access after invoking the extension, without ongoing all-site access. |
| `scripting` | User-triggered extraction and validated focus in the authorized tab. |
| Configured backend origin | AI JSON requests only; emitted at build time. Blank URL grants no network host permission. Local builds can permit loopback HTTP. |

The build emits the manifest and sets its `connect-src` to the same backend origin.
Direct OpenAI host access is removed. No `tabs`, `storage`, microphone, clipboard or
`<all_urls>` permission is added.

## Privacy and credentials

AI actions send a filtered title, text, structure cues and question to AccessPilot,
which forwards them to OpenAI. Q&A also includes bounded interactive IDs, roles,
names and disabled states. No raw HTML, form values, passwords, editable regions,
hidden content, URL attributes or live DOM references are sent. Sensitive information
in ordinary page text or labels can still be included; filtering is not full redaction.

Local checks, speech and focus require no backend request. Consent resets when the
popup closes. Page content and answers are not persisted by the application. The
backend logs only random request ID, status and duration, and keeps development
usage counters in memory. Hosting logs and future persistent usage need separate
retention controls. Browser/OS voices can use remote speech services.

Server requests use `store: false`, which is not a zero-retention promise; see
[OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).
See [privacy](docs/privacy.md) for the exact transmitted fields and limitations,
and [threat model](docs/threat-model.md) for remaining risks.

## Basic checks and limitations

Checks identify images without an `alt` attribute (empty decorative alt is accepted), buttons without detectable names, and native form fields without labels. Names support associated labels, `aria-label`, `aria-labelledby`, button text, image alt in buttons, and title fallback. Placeholder text is not treated as a label.

This is a heuristic check, not WCAG certification or a full accessible-name computation. It examines up to 2,000 visible elements per category in the top document. It does not inspect iframe/shadow DOM content, image pixels, canvas, PDFs, contrast, or all custom widgets. Chrome internal pages and protected pages such as the Web Store cannot be extracted. Long pages are truncated; virtualized or unloaded content is unavailable. AI can make mistakes and page instructions may still influence a model despite defensive prompting. Verify important details.

For conservative privacy filtering, names referenced from hidden or editable content are omitted, even where the browser's accessibility tree may legitimately use hidden labels. Input button values are not read; submit/reset controls use generic fallback names. These choices can produce false positives or less precise names. Structure cues preserve document order, not heading hierarchy or a full page accessibility tree; an early navigation menu may consume the cue budget.

Popup state and speech are temporary. Automatic reading defaults off to avoid competing with a screen reader. The interface uses native controls, visible focus, high-contrast colors, status/error announcements, and text-only answer rendering.

## Validation

```sh
pnpm test       # extraction/privacy, analyzer, AI, worker flow, speech, popup keyboard
pnpm typecheck  # standalone strict TypeScript check
pnpm build      # strict TypeScript check and production extension build
pnpm build:server # separate production server bundle
```

Before release, manually load `dist` in Chrome and verify summary/Q&A through the locally configured backend; local scanning on a page with known issues; protected-page and offline errors; speech start/stop; Tab/Shift+Tab without traps; 200% zoom; and NVDA or another screen reader. Automated DOM tests do not establish full assistive-technology compatibility.

Use the [manual testing checklist](docs/testing.md) to record the browser, assistive technology, observed results, and unresolved issues. Do not publish page text, API keys, or personal data in test reports.

## License

MIT. See [LICENSE](LICENSE).
