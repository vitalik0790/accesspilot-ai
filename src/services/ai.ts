import type { AIAnswer, PageSnapshot } from '../shared/types';
import { toAIRequest, validatedAnswer, type ErrorCode } from '../shared/api';
export interface AIConfig { backendUrl: string }
const errors: Record<ErrorCode, string> = {
  unauthorized: 'AI access is not authorized. Sign-in is not available in this build; use the documented local backend for testing.',
  invalid_request: 'The page request could not be processed. Try another page.',
  usage_limit: 'Your AI usage limit has been reached. Local checks, speech, and available focus navigation still work.',
  rate_limit: 'Too many AI requests. Please wait and try again.',
  unavailable: 'The AI service is temporarily unavailable. Please try again later.',
  timeout: 'The AI request timed out. Please try again.',
};
export async function askAI(page: PageSnapshot, question: string | undefined, config: AIConfig): Promise<AIAnswer> {
  if (!config.backendUrl) throw new Error('AI backend is not configured. Local accessibility checks still work.');
  if (!page.text.trim() && !page.interactive.some(el => el.name)) throw new Error('No readable page text was found. Try a page with text content.');
  let response: globalThis.Response;
  let data: unknown;
  try {
    response = await fetch(config.backendUrl + '/v1/ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', redirect: 'error',
      signal: AbortSignal.timeout(30000), body: JSON.stringify(toAIRequest(page, question)),
    });
    data = await response.json();
  } catch { throw new Error('Could not reach the AccessPilot backend or the request timed out. Check your connection and try again.'); }
  if (!response.ok) {
    const code = (data as { error?: { code?: string } })?.error?.code;
    throw new Error(code && Object.hasOwn(errors, code) ? errors[code as ErrorCode] : errors.unavailable);
  }
  const result = data && typeof data === 'object' && 'ok' in data && data.ok === true && 'result' in data ?
    validatedAnswer(data.result, question ? page.interactive : []) : undefined;
  if (!result) throw new Error('The AI service returned an invalid answer. Please try again.');
  return result;
}
