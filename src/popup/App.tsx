import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Request, Response, FocusResponse } from '../shared/types';
import { speak, stopSpeech } from '../services/speech';

export function App() {
  const [consent, setConsent] = useState(false);
  const [autoRead, setAutoRead] = useState(false);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Ready. Start with a local accessibility check.');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Extract<Response, { ok: true }> | null>(null);
  const locked = useRef(false);
  const autoReadRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    window.addEventListener('pagehide', stopSpeech);
    return () => { mounted.current = false; stopSpeech(); window.removeEventListener('pagehide', stopSpeech); };
  }, []);
  async function moveFocus() {
    if (locked.current || !result?.target) return;
    locked.current = true;
    setBusy(true); setError(''); stopSpeech();
    setStatus(`Moving focus to ${result.target.name}…`);
    try {
      const response: FocusResponse = await chrome.runtime.sendMessage({ type: 'focus', snapshotId: result.target.snapshotId, targetId: result.target.id } satisfies Request);
      if (!response?.ok) throw new Error(response && !response.ok ? response.error : 'Could not move focus. Ask your question again.');
      // Returning the browser's focus to the page lets assistive technology
      // announce the focused control naturally instead of talking over it.
      window.close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not move focus. Ask your question again.');
      setStatus('Focus was not moved. Ask your question again.');
    } finally { locked.current = false; setBusy(false); }
  }
  async function run(request: Exclude<Request, { type: 'focus' }>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true); setError(''); setResult(null); stopSpeech();
    setStatus(request.type === 'scan' ? 'Checking this page locally…' : 'Reading this page and asking OpenAI…');
    try {
      const response: Response = await chrome.runtime.sendMessage(request);
      if (!mounted.current) return;
      if (!response) throw new Error('The extension did not respond. Reload it and try again.');
      if (!response.ok) throw new Error(response.error);
      setResult(response);
      setStatus(`${response.answer ? 'AI response ready.' : 'Check complete.'} ${response.issues.length} potential issues found. Use Go to results to review.`);
      if (autoReadRef.current && response.answer) speak(response.answer, setError);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not contact the extension.');
      setStatus('Request failed. You can try again.');
    } finally { locked.current = false; setBusy(false); }
  }
  function ask(event: FormEvent) {
    event.preventDefault();
    if (consent && question.trim() && !busy) void run({ type: 'ask', question: question.trim(), consent: true });
  }
  return <main>
    <header><p className="eyebrow">YOUR PAGE, MADE CLEARER</p><h1>AccessPilot AI</h1><p>Understand the page. Find your next step.</p></header>
    <section aria-labelledby="page-actions">
      <h2 id="page-actions">Explore this page</h2>
      <button aria-disabled={busy} onClick={() => void run({ type: 'scan' })}>Check accessibility locally</button>
      <p id="privacy">AI actions send the page title, up to 16,000 characters of page text, up to 40 short structure cues (such as headings and labels), and your question to OpenAI. Questions also send up to 100 interactive element names, roles, temporary IDs, and disabled states. Page text and labels may contain personal information. Form values are excluded. Local checks send nothing.</p>
      <label className="check"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} aria-describedby="privacy" />Allow sending this page to OpenAI</label>
      <button className="primary" disabled={!consent} aria-disabled={busy || !consent} onClick={() => { if (consent) void run({ type: 'summarize', consent: true }); }}>Summarize page</button>
      <form onSubmit={ask}>
        <label htmlFor="question">Ask about this page</label>
        <textarea id="question" value={question} onChange={event => setQuestion(event.target.value)} maxLength={1000} rows={3} placeholder="What are the main points?" aria-describedby="question-help" />
        <p id="question-help">Up to 1,000 characters. Each question uses a fresh page snapshot.</p>
        <button type="submit" disabled={!consent || !question.trim()} aria-disabled={busy || !consent || !question.trim()}>Ask question</button>
      </form>
    </section>
    <section aria-labelledby="speech-heading"><h2 id="speech-heading">Read aloud</h2>
      <label className="check"><input type="checkbox" checked={autoRead} onChange={event => {
        autoReadRef.current = event.target.checked;
        setAutoRead(event.target.checked);
        if (!event.target.checked) stopSpeech();
      }} />Read new AI responses automatically</label>
      <div className="actions"><button disabled={!result?.answer} onClick={() => { if (result?.answer) speak(result.answer, setError); }}>Read response</button><button onClick={stopSpeech}>Stop reading</button></div>
      <p>Keep this popup open while listening.</p>
    </section>
    <p role="status" aria-atomic="true">{status}</p>
    {result && <a href="#result-heading">Go to results</a>}
    {error && <p role="alert" className="error">{error}</p>}
    {result && <section aria-labelledby="result-heading"><h2 id="result-heading" tabIndex={-1}>{result.title || 'Page results'}</h2>
      {result.truncated && <p>Some page text or structure cues were omitted to keep the request short.</p>}
      {result.answer && <><h3>AI response</h3><p className="answer">{result.answer}</p><p>AI can make mistakes. Check important details on the page.</p></>}
      {result.target && <>
        <button aria-disabled={busy} aria-describedby="focus-help" onClick={() => void moveFocus()}>Move focus to {result.target.name}</button>
        <p id="focus-help">Moves keyboard focus to this control and closes the popup. Nothing is clicked or submitted by AccessPilot.</p>
      </>}
      <h3>Accessibility check</h3>
      <p>{result.issues.length} potential issues. These basic checks are not a complete accessibility audit.</p>
      {result.issues.length > 0 && <ul>{result.issues.map((issue, index) => <li key={`${issue.code}-${index}`}><strong>{issue.element}:</strong> {issue.message}</li>)}</ul>}
    </section>}
    <footer>Open with Alt+Shift+A. Use Tab to move and Enter or Space to activate controls.</footer>
  </main>;
}
