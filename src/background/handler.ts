import { extractPage } from '../content/extract';
import { focusElement } from '../content/focus';
import { analyzeAccessibility } from '../accessibility/analyzer';
import { askAI, type AIConfig } from '../services/ai';
import type { Request, Response, FocusResponse, InteractiveElement } from '../shared/types';

interface SnapshotSession { snapshotId: string; documentId: string; url: string; expiresAt: number; target?: InteractiveElement }
const sessions = new Map<number, SnapshotSession>();
const stale = 'This target is no longer available or the page changed. Ask your question again.';

export function isRequest(value: unknown): value is Request {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  if (request.type === 'focus') return typeof request.snapshotId === 'string' && /^[0-9a-f-]{36}$/.test(request.snapshotId) &&
    typeof request.targetId === 'string' && /^element-[1-9][0-9]{0,2}$/.test(request.targetId);
  return request.type === 'scan' || (request.consent === true && (request.type === 'summarize' ||
    (request.type === 'ask' && typeof request.question === 'string' && request.question.trim().length > 0 && request.question.length <= 1000)));
}

export async function handleFocus(request: Extract<Request, { type: 'focus' }>): Promise<FocusResponse> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const session = tab?.id === undefined ? undefined : sessions.get(tab.id);
    if (!session || session.snapshotId !== request.snapshotId || session.url !== tab.url || Date.now() >= session.expiresAt ||
      session.target?.id !== request.targetId || session.target.disabled || !session.target.name.trim()) return { ok: false, error: stale };
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id!, documentIds: [session.documentId] },
      func: focusElement, args: [request.snapshotId, request.targetId],
    });
    return result?.result || { ok: false, error: stale };
  } catch { return { ok: false, error: stale }; }
}

export async function handleRequest(request: Exclude<Request, { type: 'focus' }>, config: AIConfig): Promise<Response> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:\/\//i.test(tab.url)) throw new Error('Open a regular HTTP or HTTPS webpage first. Browser settings, new tabs, and local files cannot be analyzed.');
    sessions.delete(tab.id);
    for (const [id, session] of sessions) if (Date.now() >= session.expiresAt) sessions.delete(id);
    let results: chrome.scripting.InjectionResult<ReturnType<typeof extractPage>>[];
    try {
      results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPage });
    } catch {
      throw new Error('This page does not allow access. Try a regular webpage and reopen AccessPilot AI.');
    }
    const page = results[0]?.result;
    if (!page) throw new Error('Could not read this page. Reload it and try again.');
    const session: SnapshotSession = { snapshotId: page.snapshotId, documentId: results[0].documentId, url: tab.url, expiresAt: Date.now() + 300000 };
    // Bound memory to at most 20 recent tab sessions. Worker suspension loses
    // this authorization state; focus then fails safely and requires a new Q&A.
    if (sessions.size >= 20) sessions.delete(sessions.keys().next().value!);
    sessions.set(tab.id, session);
    const issues = analyzeAccessibility(page);
    const ai = request.type === 'scan' ? undefined : await askAI(page, request.type === 'ask' ? request.question.trim() : undefined, config);
    const target = request.type === 'ask' && sessions.get(tab.id) === session ?
      page.interactive.find(el => el.id === ai?.targetId && !el.disabled && el.name.trim()) : undefined;
    session.target = target;
    return { ok: true, title: page.title, issues, truncated: page.truncated, answer: ai?.answer,
      ...(target ? { target: { id: target.id, name: target.name, snapshotId: page.snapshotId } } : {}),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Something went wrong. Please try again.' };
  }
}
