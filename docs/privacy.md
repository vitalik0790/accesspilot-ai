# Privacy and data handling

## User action and consent

Nothing is extracted until a page action is activated. A local accessibility check sends
no network request. Summary/Q&A require the popup checkbox allowing transmission to
AccessPilot and OpenAI; consent resets when the popup closes. The backend also requires
consent:true, but that field is not proof of consent from a modified client.

## Exactly what is transmitted

The extension sends the following JSON to the configured AccessPilot backend:
version, operation (summary/question), consent, page title (300 characters), filtered
visible text (16,000 characters), truncation flag, and up to 40 structure cues containing
kind and name (160 characters). Kinds are heading, landmark, link, button, form-label, image.

Questions additionally send the question (1,000 characters) and up to 100 interactive
records: temporary element ID, role, name (160 characters) and disabled state.
The server forwards the page fields and question to OpenAI, with server-controlled
instructions, model, output format and token cap. Consent/version are not forwarded.
There is no conversation history. Backend responses contain only answer and optional
validated target ID, or an error code.

Network operators necessarily process connection metadata such as IP addresses and timing.
The application does not log these, but a hosting platform may do so.

## Exclusions and limitations

The existing extractor remains unchanged. It excludes password controls, form values,
editable regions, scripts, styles, hidden content, cookies, raw HTML/DOM, browser history,
and unnecessary metadata. Input button values are not read. URL attributes, live element
references, snapshot UUIDs, local accessibility findings, and local validation link
destinations are not transmitted. There is no screenshot or image-pixel transmission.

Sensitive information, URLs or credentials written as ordinary visible page text, headings,
labels, alt text or in the user's question can still be sent. Filtering is heuristic,
not general-purpose redaction. The server rejects extra JSON fields but cannot prove a
text string was safely extracted. Avoid AI requests on sensitive pages until you have
reviewed the content and deployment policy.

## Local state and navigation

Snapshots, consent, questions and answers are not persisted in extension storage.
Temporary focus registries and worker sessions remain local, expire after five minutes,
and can disappear earlier on worker suspension/new snapshots. Focus is user-triggered,
validated, and sends no network request. No click or submit is performed; websites may
run handlers when focused or scrolled.

Speech uses browser/OS SpeechSynthesis and starts automatically only when enabled by the
user. Installed voices may use remote speech services. Speech does not require the AI backend.

## Backend and provider

Request/response content is processed transiently in backend memory and is not written
to application logs or a database. Application logs contain random request ID, status and
duration only. The local usage adapter retains a user identifier, calendar month, request
count and minute-window count in memory; restart clears this data. Real deployment will
need persistent usage and account metadata with a documented retention/deletion policy.

OpenAI requests use store:false. This is not a zero-retention guarantee; provider abuse
monitoring and other policies can still apply. Review the current
[OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).
Infrastructure, proxy logs, crash dumps and backups must be reviewed independently;
this code cannot guarantee their retention behavior.

## Credentials and local development

OpenAI credentials are loaded only by the server at runtime. Extension builds contain
only a public backend URL and never receive the provider key. Production builds do not
require OPENAI_API_KEY. No endpoint returns server credentials.

Use ignored server/.env.local for local server configuration. The legacy root .env.local
is ignored and no longer supplies an extension key. Earlier keyed builds remain unsafe:
remove old packages from circulation and rotate keys that were distributed or exposed.
A secret in an environment file is safe only if it stays server-side.
See [deployment](deployment.md) for migration and public-launch blockers.
