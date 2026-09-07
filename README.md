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

The MVP does not perform page actions, accept voice commands, analyze image pixels, or navigate semantically. Chrome protected pages, iframe/shadow DOM content, and unloaded content are outside its current extraction scope. Keyboard behavior has automated coverage; real screen-reader and Chrome popup testing remains required.

## Roadmap

These are proposed directions, not release dates or commitments. Later features require privacy and accessibility review.

### v0.1 — current MVP

- Page summarization
- Questions about the current page
- Text-to-speech
- Basic local accessibility checks
- Keyboard-accessible UI

### v0.2 — planned

- Voice commands
- Semantic page navigation
- Improved page structure understanding

### v0.3 — planned

- AI image descriptions
- Better handling of complex web applications
- Richer accessibility analysis

### Future

- Secure backend for AI requests
- Human confirmation before sensitive AI actions
- Observability and cost controls
- User testing with blind and visually impaired users
- Potential Chrome Web Store release

User testing should begin during MVP evaluation rather than wait for later features. Secure API handling is a prerequisite for distributing a build that uses a project-owned key.

## Quick start

Requires Node.js 22 or newer and pnpm (or npm).

```sh
pnpm install
cp .env.example .env.local
# Edit .env.local: set OPENAI_API_KEY; optionally change OPENAI_MODEL.
pnpm test
pnpm build
```

On PowerShell, use `Copy-Item .env.example .env.local`. With npm, use `npm install`, `npm test`, and `npm run build` instead. The repository includes a pnpm lockfile for reproducible installs.

Open Chrome's `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this project's `dist` folder. Open a normal webpage, then open the extension from the toolbar or with **Alt+Shift+A**. Chrome lets you change conflicting shortcuts at `chrome://extensions/shortcuts`.

Local accessibility checks work without a key. To summarize or ask a question, select **Allow sending this page to OpenAI** and activate the relevant button. Use Tab / Shift+Tab to move, Space to toggle checkboxes, and Enter to activate buttons. In the question field, Enter inserts a newline; Tab to **Ask question** to submit. Speech is opt-in; use **Read response**, **Stop reading**, or the automatic-reading checkbox. Keep the popup open during requests and speech.

Run `pnpm dev` for rebuilds on changes. Reload the extension in Chrome after each build, and reopen the popup. Environment changes require a fresh build and extension reload.

## Architecture

```text
React popup → typed runtime message → service worker
                                      ├─ executeScript(extractPage) → active tab DOM
                                      ├─ local accessibility analyzer
                                      └─ AI service → OpenAI Responses API
React popup ← typed result ← service worker
     └─ browser SpeechSynthesis
```

```text
public/manifest.json       Manifest V3 and minimal permissions
src/popup/                Semantic React UI and styles
src/content/extract.ts     On-demand content script function
src/background/           Sender validation and orchestration
src/services/ai.ts         OpenAI network boundary
src/services/speech.ts     SpeechSynthesis controls
src/accessibility/        Pure accessibility checks
src/shared/               Typed requests, results, and page snapshots
tests/                    Vitest behavior tests
```

The content script is a self-contained function injected with `chrome.scripting.executeScript`; no persistent content script or all-sites registration is needed. Each action takes a fresh snapshot of the active page. Questions are independent, with no conversation history. The build emits `popup.html`, `background.js`, supporting assets, and the manifest into `dist`.

## Permissions

| Manifest entry | Purpose |
| --- | --- |
| `activeTab` | Temporary access to the page after the user invokes the extension; used to identify and read that tab. Avoids ongoing access to browsing history or all sites. |
| `scripting` | Injects the DOM extraction function into that tab only when an action is requested. |
| `https://api.openai.com/*` host permission | Allows the service worker to call the OpenAI API. Chrome host permission paths cover the host; code calls only `/v1/responses`. |

No `tabs`, `storage`, microphone, clipboard, or `<all_urls>` permission is requested. SpeechSynthesis needs no microphone permission. The manifest also declares a popup shortcut and a Content Security Policy restricting scripts to packaged files and connections to OpenAI.

## Privacy and API keys

- Nothing is extracted until you activate a page action. Local scans make no network calls.
- AI requests send the page title (up to 300 characters), at most 16,000 characters of text, up to 40 structure cues of 160 characters each, truncation status, and the question. URL attributes, raw HTML, form values, editable regions, scripts, styles, and content detected as hidden are excluded. URLs or sensitive information written in ordinary page text or labels may still be included; exclusion is not a complete redaction system.
- No page content, consent, questions, or answers are saved to extension storage. Consent resets when the popup closes. There is no analytics or telemetry. A request already sent may finish after the popup closes.
- The AI service uses `store: false`. This disables stored Responses retrieval; it is **not** a promise of zero provider retention. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data) and the [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create).
- Speech uses the browser/OS voices, which may use a remote speech service depending on the installed voice. Text remains available without speech.
- `.env.local`, other environment files, and `dist` are git-ignored. **The local-development API key is embedded in the built service worker and can be recovered. Never publish or share a build containing your key.** A public production release must move the AI call and key to an authenticated backend, or implement a carefully designed user-owned credential flow. This MVP intentionally does not add a backend. Never put a developer-owned shared key in a Chrome Web Store package.

See [Privacy](docs/privacy.md) for exact data boundaries and [Threat model](docs/threat-model.md) for current mitigations and remaining risks.

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
```

Before release, manually load `dist` in Chrome and verify summary/Q&A with a locally configured key; local scanning on a page with known issues; protected-page and offline errors; speech start/stop; Tab/Shift+Tab without traps; 200% zoom; and NVDA or another screen reader. Automated DOM tests do not establish full assistive-technology compatibility.

Use the [manual testing checklist](docs/testing.md) to record the browser, assistive technology, observed results, and unresolved issues. Do not publish page text, API keys, or personal data in test reports.

## License

MIT. See [LICENSE](LICENSE).
