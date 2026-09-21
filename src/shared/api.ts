import type { AIAnswer, InteractiveElement, PageStructureItem, PageSnapshot } from './types';
export interface AIPage {
  title: string; text: string; truncated: boolean;
  structure: PageStructureItem[]; interactive?: InteractiveElement[];
}
export type AIRequest = { version: 1; consent: true; page: AIPage } &
  ({ operation: 'summary' } | { operation: 'question'; question: string });
export type ErrorCode = 'unauthorized' | 'invalid_request' | 'usage_limit' | 'rate_limit' | 'unavailable' | 'timeout';
export type AIResponse = { ok: true; result: AIAnswer } | { ok: false; error: { code: ErrorCode } };
export function toAIRequest(page: PageSnapshot, question?: string): AIRequest {
  const safe: AIPage = { title: page.title, text: page.text, truncated: page.truncated,
    structure: page.structure.map(({ kind, name }) => ({ kind, name })) };
  if (question !== undefined) return { version: 1, consent: true, operation: 'question', question,
    page: { ...safe, interactive: page.interactive.map(({ id, role, name, disabled }) => ({ id, role, name, disabled })) } };
  return { version: 1, consent: true, operation: 'summary', page: safe };
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
export function isAIRequest(v: unknown): v is AIRequest {
  if (!object(v) || v.version !== 1 || v.consent !== true || !keys(v, ['version', 'consent', 'operation', 'page', 'question'])) return false;
  if (v.operation !== 'summary' && v.operation !== 'question') return false;
  if (v.operation === 'question' ? !str(v.question, 1000) || !v.question.trim() : 'question' in v) return false;
  const p = v.page;
  if (!object(p) || !keys(p, ['title', 'text', 'truncated', 'structure', 'interactive']) || !str(p.title, 300) || !str(p.text, 16000) || typeof p.truncated !== 'boolean') return false;
  if (!Array.isArray(p.structure) || p.structure.length > 40 || !p.structure.every(s => object(s) && keys(s, ['kind', 'name']) &&
    ['heading', 'landmark', 'link', 'button', 'form-label', 'image'].includes(s.kind as string) && str(s.name, 160))) return false;
  if (v.operation === 'summary') return !('interactive' in p);
  if (!Array.isArray(p.interactive) || p.interactive.length > 100) return false;
  const ids = new Set<string>();
  for (const e of p.interactive) {
    if (!object(e) || !keys(e, ['id', 'role', 'name', 'disabled']) || !str(e.id, 20) || !/^element-[1-9][0-9]{0,2}$/.test(e.id) || ids.has(e.id) ||
      !str(e.role, 40) || !e.role.trim() || !str(e.name, 160) || typeof e.disabled !== 'boolean') return false;
    ids.add(e.id);
  }
  return true;
}
export function validatedAnswer(value: unknown, elements: InteractiveElement[] = []): AIAnswer | undefined {
  if (!object(value) || !str(value.answer, 12000) || !value.answer.trim() ||
    (value.targetId !== undefined && value.targetId !== null && typeof value.targetId !== 'string')) return;
  const target = elements.find(e => e.id === value.targetId && !e.disabled && e.name.trim());
  return { answer: value.answer.trim(), ...(target ? { targetId: target.id } : {}) };
}
