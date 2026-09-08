# Real-world testing checklist

Use a locally built unpacked extension and synthetic or public, non-sensitive pages. Record Chrome and OS versions, screen reader and version, zoom settings, test outcome, and steps for any failure. Never include API keys or private page contents in reports.

## Automated checks

Run `pnpm test`, `pnpm typecheck`, and `pnpm build`. Unit tests mock Chrome and OpenAI and do not establish actual screen-reader announcements, zoom layout, voice availability, or API connectivity.

### Iteration validation — 2026-09-07

- 24 Vitest tests passed across six test files; standalone TypeScript checks and the production build passed.
- An isolated headless Chrome harness loaded the built popup with mocked responses. Initial keyboard focus, visible focus outline, keyboard access to the results link, and focus on its target heading passed.
- The built popup had no horizontal overflow at 390 and 195 CSS-pixel viewport widths with a long synthetic page title. The narrow view was visually inspected. This approximates reduced space at enlarged zoom; it does not verify actual Chrome extension-popup zoom behavior.
- Actual extension installation, live API responses, OS speech, 200% popup zoom, and screen-reader/user testing remain unverified. The temporary harness and screenshot are local ignored `.cache` artifacts, not shipped tests.

### Popup sizing regression

A user reported continuous flickering and a narrow, clipped popup until clicking inside it. The popup previously constrained its body width to `100vw`, coupling content size to Chrome's automatic popup viewport sizing. The root document now supplies a viewport-independent 390px width and reserves the vertical scrollbar. The earlier 195px ordinary-page reflow check does not validate this sizing contract: the actual extension popup must establish its own width.

After rebuilding and reloading the extension, open it repeatedly using both the toolbar and shortcut without clicking inside. Confirm that width stays stable immediately, scrolling works, and no flicker occurs. Repeat at 200% popup zoom and with a screen reader. The CSS addresses a suspected sizing feedback loop; confirmation on the affected Chrome installation is still required.

The user subsequently confirmed that the flicker disappeared after reloading the corrected build. Screen-reader and 200% zoom checks remain separate.

## v0.2 focus navigation

Automated validation: 53 tests across seven Vitest files passed, along with TypeScript checks and the production build. An isolated headless Chrome harness exercised the built, detached content functions with synthetic HTTP-page content and mocked Chrome messaging/AI. Native and custom focus, scrolling, stale removal rejection, temporary tabindex restoration, exclusion of form values, and absence of click/submit/extra AI calls passed. No paid API calls were made by these checks. Actual extension-popup handoff and screen-reader announcements still require manual validation below.

- On a synthetic/public page, ask where a named button, link, or search field is. Verify that only a relevant enabled suggestion offers **Move focus to [name]**. An answer without a target should still display and read normally.
- Tab to the offered button and activate it with Enter/Space. The popup should close, the page should scroll to the control, and NVDA/Chrome should announce its name and role. Tab/Shift+Tab should continue normal page navigation. No link should open and no form should submit.
- Remove, replace, hide, rename, or disable the target before activating the button. Also test a changed tab/URL, page reload, new snapshot, five-minute expiry, and service-worker restart. Expect an accessible error and a new-question instruction, never a different target.
- Test custom role widgets without tabindex and existing negative tabindex values. Temporary tabindex must be removed on blur without creating a keyboard trap.
- Inspect a Q&A network request using non-sensitive fixtures: interactive entries contain only ID, role, name, and disabled state. There must be no input values, password controls, raw HTML, actual DOM IDs/selectors, or hrefs. The follow-up focus request must make no AI call.
- Test actual page-focus handoff and screen-reader announcements in the installed extension; DOM unit tests cannot certify browser-window focus behavior.

## Keyboard and screen reader

- Open the popup using its shortcut (configure it in Chrome if intercepted).
- Use Tab and Shift+Tab across local scan, consent, summary, question, ask, speech preference, read, stop, and results link. Unavailable native controls are skipped. Confirm visible focus and no keyboard trap.
- Activate controls using Enter/Space; checkboxes toggle with Space. Enter in the textarea inserts a newline. Verify each control's accessible name, role, and state in NVDA/Chrome or another supported combination.
- Trigger a request and verify the loading status is announced without moving focus. Repeated activation must not issue another request while busy.
- Verify errors are announced, completion is announced briefly, and **Go to results** moves to the result heading. Results should be readable through normal heading/text navigation without automatically speaking the full answer over the screen reader.
- Keep automatic reading off and confirm no synthesized response is played. Then enable it, start a request, disable it before completion, and confirm silence. Check manual reading, Stop, and popup closure.

## Zoom and layout

- At 200% browser zoom and enlarged OS text settings, inspect the actual Chrome popup: all controls and long page titles/errors must wrap without horizontal clipping; vertical scrolling must reach results and Stop.
- Verify the focused control is visible when scrolling, and check Windows high-contrast/forced-colors mode.
- Chrome popup zoom may differ from ordinary webpage zoom. Record how popup zoom was applied; a desktop webpage screenshot alone is not sufficient.

## Privacy and errors

- With consent off, local scan should make no OpenAI request; summary/ask should be unavailable.
- Use a test page containing passwords, input/textarea/select values, editable regions, hidden text, labels with hidden descendants, headings, and image alt text. Inspect the worker's network request locally: no raw DOM, URL attributes, form values, or excluded text should appear.
- Confirm the disclosed title/text/structure cues and question do appear. Test values mirrored into ordinary visible text to understand the known redaction limitation.
- Test a closed details section, a large page, a restricted Chrome page, Web Store, offline mode, missing API configuration, and API errors. Local scan should remain usable without AI configuration.
- Navigate or change the page between actions; the next request should read a fresh snapshot. Closing/reopening the popup must reset consent.

## Before an evaluation release

Do not distribute a build containing a developer-owned API key. Record unresolved issues before inviting participants, and evaluate whether summaries are useful alongside their usual screen reader. The roadmap is not a promise of current functionality.
