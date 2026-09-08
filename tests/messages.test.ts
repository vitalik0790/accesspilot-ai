import { afterEach, expect, it, vi } from 'vitest';
import { handleRequest, handleFocus } from '../src/background/handler';
vi.mock('../src/background/handler', async importOriginal => {
  const original = await importOriginal<typeof import('../src/background/handler')>();
  return { ...original, handleRequest: vi.fn().mockResolvedValue({ ok: true }), handleFocus: vi.fn().mockResolvedValue({ ok: true }) };
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('rejects webpage and foreign messages before extraction or AI work', async () => {
  const addListener = vi.fn();
  vi.stubGlobal('chrome', { runtime: { id: 'own-id', getURL: (path: string) => `chrome-extension://own-id/${path}`, onMessage: { addListener } } });
  vi.stubGlobal('__OPENAI_API_KEY__', '');
  vi.stubGlobal('__OPENAI_MODEL__', 'test');
  await import('../src/background/index');
  const listener = addListener.mock.calls[0][0];
  const respond = vi.fn();
  expect(listener({ type: 'scan' }, { id: 'own-id', url: 'https://example.com' }, respond)).toBe(false);
  expect(listener({ type: 'scan' }, { id: 'foreign', url: 'chrome-extension://own-id/popup.html' }, respond)).toBe(false);
  expect(handleRequest).not.toHaveBeenCalled();
  expect(listener({ type: 'ask', question: 'Hi' }, { id: 'own-id', url: 'chrome-extension://own-id/popup.html' }, respond)).toBe(false);
  expect(respond).toHaveBeenCalledWith({ ok: false, error: 'Invalid request.' });
  const focusRequest = { type: 'focus', snapshotId: '00000000-0000-4000-8000-000000000001', targetId: 'element-1' };
  vi.mocked(handleFocus).mockResolvedValue({ ok: true });
  expect(listener(focusRequest, { id: 'own-id', url: 'https://example.com/#popup.html' }, respond)).toBe(false);
  expect(listener(focusRequest, { id: 'own-id', url: 'chrome-extension://own-id/other.html' }, respond)).toBe(false);
  expect(handleFocus).not.toHaveBeenCalled();
  expect(listener(focusRequest, { id: 'own-id', url: 'chrome-extension://own-id/popup.html#result-heading' }, respond)).toBe(true);
  expect(handleFocus).toHaveBeenCalledWith(focusRequest);
});
