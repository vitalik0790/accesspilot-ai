# AccessPilot AI

An MIT-licensed Chrome extension MVP for blind and visually impaired users. Summarize the current page, ask questions about its text, read AI responses aloud, and check for common accessibility problems.

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
- AI requests send the page title, at most 16,000 characters of text, truncation status, and the question. URLs, raw HTML, form values, editable regions, scripts, styles, and hidden/ARIA-hidden text are excluded. Ordinary visible page text can still contain personal or sensitive information; exclusion is not a complete redaction system.
- No page content, consent, questions, or answers are saved to extension storage. Consent resets when the popup closes. There is no analytics or telemetry. A request already sent may finish after the popup closes.
- The AI service uses `store: false`. This disables stored Responses retrieval; it is **not** a promise of zero provider retention. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data) and the [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create).
- Speech uses the browser/OS voices, which may use a remote speech service depending on the installed voice. Text remains available without speech.
- `.env.local`, other environment files, and `dist` are git-ignored. **The local-development API key is embedded in the built service worker and can be recovered. Never publish or share a build containing your key.** A public production release must move the AI call and key to an authenticated backend, or implement a carefully designed user-owned credential flow. This MVP intentionally does not add a backend. Never put a developer-owned shared key in a Chrome Web Store package.

## Basic checks and limitations

Checks identify images without an `alt` attribute (empty decorative alt is accepted), buttons without detectable names, and native form fields without labels. Names support associated labels, `aria-label`, `aria-labelledby`, button text, image alt in buttons, and title fallback. Placeholder text is not treated as a label.

This is a heuristic check, not WCAG certification or a full accessible-name computation. It examines up to 2,000 visible elements per category in the top document. It does not inspect iframe/shadow DOM content, image pixels, canvas, PDFs, contrast, or all custom widgets. Chrome internal pages and protected pages such as the Web Store cannot be extracted. Long pages are truncated; virtualized or unloaded content is unavailable. AI can make mistakes and page instructions may still influence a model despite defensive prompting. Verify important details.

Popup state and speech are temporary. Automatic reading defaults off to avoid competing with a screen reader. The interface uses native controls, visible focus, high-contrast colors, status/error announcements, and text-only answer rendering.

## Validation

```sh
pnpm test       # extraction/privacy, analyzer, AI, worker flow, speech, popup keyboard
pnpm build      # strict TypeScript check and production extension build
```

Before release, manually load `dist` in Chrome and verify summary/Q&A with a locally configured key; local scanning on a page with known issues; protected-page and offline errors; speech start/stop; Tab/Shift+Tab without traps; 200% zoom; and NVDA or another screen reader. Automated DOM tests do not establish full assistive-technology compatibility.

## License

MIT. See [LICENSE](LICENSE).
