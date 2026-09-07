# Privacy and data handling

This document describes the current MVP, including its limits. It is not a guarantee that sensitive information will never leave the browser.

## When extraction happens

Opening the popup alone does not extract a page. Activating **Check accessibility locally**, **Summarize page**, or **Ask question** causes the service worker to inject an extractor into the active tab's top document. Each action takes a fresh snapshot. No background browsing monitor is installed.

## Information extracted

- Page title, limited to 300 characters.
- Readable text in document order, limited to 16,000 characters. This includes surrounding navigation and footer text, not only the `main` element.
- Up to 40 structure cues, each containing a kind and a name of at most 160 characters. These represent headings, selected landmarks, links, buttons, labels, and image alt text. They are not a full semantic tree.
- Local analyzer records for up to 2,000 images, buttons, and native form fields per category, containing tag, a bounded name, and whether an image has an alt attribute.
- A flag when text or structure cues exceed their limits. The local analyzer's element-count cap is separate and is not reported by this flag.

## What remains local

The accessibility analyzer runs in the service worker. Its element lists are not sent to OpenAI. The popup receives the page title, issue descriptions, truncation flag, and any AI response. Local scanning makes no network request. There is no extension storage, telemetry, or persisted conversation history. Popup preferences, consent, questions, and displayed answers are temporary. This does not guarantee memory erasure or prevent browser/OS diagnostics from retaining data.

## What can be sent to OpenAI

Only an explicitly requested AI action sends the title, bounded text and structure cues, truncation flag, and question (up to 1,000 characters). The request also contains model configuration and fixed instructions. The API key is sent in the HTTPS Authorization header. Local analyzer records, raw HTML, and page URL attributes are not part of the AI payload.

`store: false` is requested. This is not equivalent to zero retention: provider policies and account settings still apply. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data). Requests already sent can finish after the popup closes; closing the popup is not a provider-side cancellation or deletion request.

## Explicit exclusions and their limits

The extractor does not read password or other input values, textarea values, select choices, cookies, browser storage, or browsing history. It skips text in native form controls, editable regions, and elements with textbox/searchbox/combobox roles. It excludes scripts, styles, templates, and noscript content. The same text filtering applies to heading, label, and button descendants. No image pixels, screenshots, raw DOM, `href`/`src` attributes, or arbitrary metadata are sent.

Content detected as hidden by `hidden`, `inert`, `aria-hidden`, CSS display/visibility, zero opacity, or closed details is skipped. This is a heuristic, not a rendering or accessibility-tree guarantee. Clipping, overlays, offscreen positioning, custom widgets, and unusual CSS can evade it. Hidden referenced labels are conservatively omitted even if they contribute to a browser accessible name.

Visible text, page titles, ARIA labels, and image alt text can themselves contain passwords, personal messages, identifiers, URLs, or other sensitive information. A page can copy an entered value into an ordinary text node or label. Such data may be sent. This is **not** automatic personal-data redaction. Avoid AI actions on sensitive pages and use local checks when appropriate.

## Consent and speech

AI controls require the popup's consent checkbox. Consent defaults off and resets when the popup closes. The worker validates a consent flag on AI messages, but it is not a durable consent record or a per-document authorization token. If the page changes while the popup remains open, the next action reads the current page under that popup's existing consent. Review the active page before each request.

Speech defaults off. Manual reading and opt-in automatic reading use browser SpeechSynthesis. Disabling automatic reading cancels queued speech and is respected when an outstanding response arrives. Browser/OS voices may use a remote service; the extension does not guarantee local-only speech. Speech and screen readers may overlap if the user enables both.

## API key limitations and planned handling

The current local-development build reads `OPENAI_API_KEY` from ignored environment configuration and embeds it in the service worker bundle. Environment configuration and `.gitignore` prevent ordinary accidental source commits; they do not encrypt a distributed bundle. Do not share a keyed build. If a key is exposed, revoke it through its provider and replace it; deleting it from a later commit is insufficient.

A future production design should move project-owned credentials to a secure server, authenticate and authorize requests, limit usage and cost, minimize payloads, and define retention and incident handling. That backend is not implemented. Logging and observability must avoid page content and credentials by default. Changing where requests go requires an updated disclosure and permission review.
