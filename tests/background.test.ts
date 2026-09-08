import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRequest, handleFocus, isRequest } from '../src/background/handler';
import { askAI } from '../src/services/ai';
vi.mock('../src/services/ai', () => ({ askAI: vi.fn() }));
const config = { apiKey: '', model: 'test' };
const snapshotId = '00000000-0000-4000-8000-000000000001';
const queryTabs = vi.fn();
beforeEach(() => { vi.mocked(askAI).mockResolvedValue({ answer: 'Summary' }); });
function mockChrome(url = 'https://example.com') {
  const executeScript = vi.fn().mockResolvedValue([{ documentId: 'document-1', result: { snapshotId, interactive: [{ id: 'element-1', role: 'button', name: 'Checkout', disabled: false }], title: 'Example', text: 'Text', truncated: false, structure: [], images: [{ hasAlt: false }], buttons: [], fields: [] } }]);
  queryTabs.mockResolvedValue([{ id: 1, url }]);
  vi.stubGlobal('chrome', { tabs: { query: queryTabs }, scripting: { executeScript } });
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
  it('pins focus to the original document and only the offered target', async () => {
    const execute = mockChrome();
    vi.mocked(askAI).mockResolvedValue({ answer: 'Use Checkout.', targetId: 'element-1' });
    const answer = await handleRequest({ type: 'ask', question: 'Where?', consent: true }, config);
    expect(answer).toMatchObject({ target: { id: 'element-1', name: 'Checkout', snapshotId } });
    const calls = execute.mock.calls.length;
    expect(await handleFocus({ type: 'focus', snapshotId, targetId: 'element-2' })).toMatchObject({ ok: false });
    expect(execute).toHaveBeenCalledTimes(calls);
    execute.mockResolvedValueOnce([{ result: { ok: true } }]);
    expect(await handleFocus({ type: 'focus', snapshotId, targetId: 'element-1' })).toEqual({ ok: true });
    expect(execute).toHaveBeenLastCalledWith(expect.objectContaining({ target: { tabId: 1, documentIds: ['document-1'] }, args: [snapshotId, 'element-1'] }));
  });
  it('rejects stale IDs, a changed active tab, and expired snapshots', async () => {
    const execute = mockChrome();
    vi.mocked(askAI).mockResolvedValue({ answer: 'Go.', targetId: 'element-1' });
    await handleRequest({ type: 'ask', question: 'Where?', consent: true }, config);
    expect(await handleFocus({ type: 'focus', snapshotId: 'different', targetId: 'element-1' })).toMatchObject({ ok: false });
    queryTabs.mockResolvedValueOnce([{ id: 2, url: 'https://example.com' }]);
    expect(await handleFocus({ type: 'focus', snapshotId, targetId: 'element-1' })).toMatchObject({ ok: false });
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 300001);
    expect(await handleFocus({ type: 'focus', snapshotId, targetId: 'element-1' })).toMatchObject({ ok: false });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('invalidates the previous offer on a new scan and reports content-script failures', async () => {
    const execute = mockChrome();
    vi.mocked(askAI).mockResolvedValue({ answer: 'Go.', targetId: 'element-1' });
    await handleRequest({ type: 'ask', question: 'Where?', consent: true }, config);
    execute.mockRejectedValueOnce(new Error('Document removed'));
    expect(await handleFocus({ type: 'focus', snapshotId, targetId: 'element-1' })).toMatchObject({ ok: false });
    await handleRequest({ type: 'scan' }, config);
    expect(await handleFocus({ type: 'focus', snapshotId, targetId: 'element-1' })).toMatchObject({ ok: false });
  });
  it('validates focus message syntax', () => {
    expect(isRequest({ type: 'focus', snapshotId, targetId: 'element-1' })).toBe(true);
    expect(isRequest({ type: 'focus', snapshotId, targetId: '#checkout' })).toBe(false);
    expect(isRequest({ type: 'focus', snapshotId: '', targetId: 'element-1' })).toBe(false);
  });
});
