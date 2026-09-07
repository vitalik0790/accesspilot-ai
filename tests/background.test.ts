import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRequest, isRequest } from '../src/background/handler';
import { askAI } from '../src/services/ai';
vi.mock('../src/services/ai', () => ({ askAI: vi.fn().mockResolvedValue('Summary') }));
const config = { apiKey: '', model: 'test' };
beforeEach(() => { vi.mocked(askAI).mockResolvedValue('Summary'); });
function mockChrome(url = 'https://example.com') {
  const executeScript = vi.fn().mockResolvedValue([{ result: { title: 'Example', text: 'Text', truncated: false, structure: [], images: [{ hasAlt: false }], buttons: [], fields: [] } }]);
  vi.stubGlobal('chrome', { tabs: { query: vi.fn().mockResolvedValue([{ id: 1, url }]) }, scripting: { executeScript } });
  return executeScript;
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('background flow', () => {
  it('validates message types, consent, and question length', () => {
    expect(isRequest({ type: 'scan' })).toBe(true);
    expect(isRequest({ type: 'summarize' })).toBe(false);
    expect(isRequest({ type: 'ask', consent: true, question: ' ' })).toBe(false);
    expect(isRequest({ type: 'ask', consent: true, question: 'x'.repeat(1001) })).toBe(false);
    expect(isRequest({ type: 'ask', consent: true, question: 'Why?' })).toBe(true);
    expect(isRequest(null)).toBe(false);
  });
  it('scans locally without calling AI', async () => {
    mockChrome();
    const result = await handleRequest({ type: 'scan' }, config);
    expect(result.ok && result.issues).toHaveLength(1);
    expect(askAI).not.toHaveBeenCalled();
  });
  it('extracts fresh content and returns summaries and answers', async () => {
    const execute = mockChrome();
    expect(await handleRequest({ type: 'summarize', consent: true }, config)).toMatchObject({ ok: true, answer: 'Summary' });
    await handleRequest({ type: 'ask', consent: true, question: ' Why? ' }, config);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(askAI).toHaveBeenLastCalledWith(expect.any(Object), 'Why?', config);
  });
  it('reports restricted tabs and injection failures', async () => {
    const execute = mockChrome('chrome://settings');
    expect(await handleRequest({ type: 'scan' }, config)).toMatchObject({ ok: false, error: expect.stringContaining('regular HTTP') });
    expect(execute).not.toHaveBeenCalled();
    mockChrome().mockRejectedValue(new Error('Cannot access'));
    expect(await handleRequest({ type: 'scan' }, config)).toMatchObject({ ok: false, error: expect.stringContaining('does not allow') });
  });
});
