import { extractPage } from '../content/extract';
import { analyzeAccessibility } from '../accessibility/analyzer';
import { askAI, type AIConfig } from '../services/ai';
import type { Request, Response } from '../shared/types';

export function isRequest(value: unknown): value is Request {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  return request.type === 'scan' || (request.consent === true && (request.type === 'summarize' ||
    (request.type === 'ask' && typeof request.question === 'string' && request.question.trim().length > 0 && request.question.length <= 1000)));
}

export async function handleRequest(request: Request, config: AIConfig): Promise<Response> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:\/\//i.test(tab.url)) throw new Error('Open a regular HTTP or HTTPS webpage first. Browser settings, new tabs, and local files cannot be analyzed.');
    let results: chrome.scripting.InjectionResult<ReturnType<typeof extractPage>>[];
    try {
      results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPage });
    } catch {
      throw new Error('This page does not allow access. Try a regular webpage and reopen AccessPilot AI.');
    }
    const page = results[0]?.result;
    if (!page) throw new Error('Could not read this page. Reload it and try again.');
    const issues = analyzeAccessibility(page);
    const answer = request.type === 'scan' ? undefined : await askAI(page, request.type === 'ask' ? request.question.trim() : undefined, config);
    return { ok: true, title: page.title, issues, truncated: page.truncated, answer };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Something went wrong. Please try again.' };
  }
}
