import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Request, Response } from '../shared/types';
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
  useEffect(() => {
    window.addEventListener('pagehide', stopSpeech);
    return () => { stopSpeech(); window.removeEventListener('pagehide', stopSpeech); };
  }, []);
  async function run(request: Request) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true); setError(''); setResult(null); stopSpeech();
    setStatus(request.type === 'scan' ? 'Checking this page locally…' : 'Reading this page and asking OpenAI…');
    try {
      const response: Response = await chrome.runtime.sendMessage(request);
      if (!response) throw new Error('The extension did not respond. Reload it and try again.');
      if (!response.ok) throw new Error(response.error);
      setResult(response);
      setStatus(response.answer ? 'AI response ready.' : `Check complete. ${response.issues.length} potential issues found.`);
      if (autoRead && response.answer) speak(response.answer, setError);
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
      <p id="privacy">AI actions send the page title, up to 16,000 characters of page text, and your question to OpenAI. Visible text may contain personal information. Form values are excluded. Local checks send nothing.</p>
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
      <label className="check"><input type="checkbox" checked={autoRead} onChange={event => setAutoRead(event.target.checked)} />Read new AI responses automatically</label>
      <div className="actions"><button disabled={!result?.answer} onClick={() => { if (result?.answer) speak(result.answer, setError); }}>Read response</button><button onClick={stopSpeech}>Stop reading</button></div>
      <p>Keep this popup open while listening.</p>
    </section>
    <p role="status" aria-atomic="true">{status}</p>
    {error && <p role="alert" className="error">{error}</p>}
    {result && <section aria-labelledby="result-heading"><h2 id="result-heading">{result.title || 'Page results'}</h2>
      {result.truncated && <p>Only the first part of this page was included.</p>}
      {result.answer && <><h3>AI response</h3><p className="answer">{result.answer}</p><p>AI can make mistakes. Check important details on the page.</p></>}
      <h3>Accessibility check</h3>
      <p>{result.issues.length} potential issues. These basic checks are not a complete accessibility audit.</p>
      {result.issues.length > 0 && <ul>{result.issues.map((issue, index) => <li key={`${issue.code}-${index}`}><strong>{issue.element}:</strong> {issue.message}</li>)}</ul>}
    </section>}
    <footer>Open with Alt+Shift+A. Use Tab to move and Enter or Space to activate controls.</footer>
  </main>;
}
