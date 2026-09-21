import { afterEach, expect, it, vi } from 'vitest';
import { askAI } from '../src/services/ai';
import type { PageSnapshot } from '../src/shared/types';
const page: PageSnapshot = { snapshotId: 'private', title: 'Example', text: 'Facts', truncated: false, structure: [],
  interactive: [{ id: 'element-1', role: 'button', name: 'Checkout', disabled: false }, { id: 'element-2', role: 'button', name: 'Disabled', disabled: true }],
  images: [], buttons: [], fields: [] };
const config = { backendUrl: 'https://backend.example' };
afterEach(() => vi.unstubAllGlobals());
it.each([undefined, 'Where is checkout?'])('sends only the compact contract for %s', async question => {
  const mock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { answer: 'Facts', targetId: 'element-1' } }) });
  vi.stubGlobal('fetch', mock);
  expect(await askAI(page, question, config)).toEqual({ answer: 'Facts', ...(question ? { targetId: 'element-1' } : {}) });
  const [url, options] = mock.mock.calls[0];
  expect(url).toBe(config.backendUrl + '/v1/ai');
  expect(options.credentials).toBe('omit');
  expect(options.redirect).toBe('error');
  expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
  const body = JSON.parse(options.body);
  expect(Object.keys(body.page).sort()).toEqual((question ? ['title','text','truncated','structure','interactive'] : ['title','text','truncated','structure']).sort());
  expect(body.page.snapshotId).toBeUndefined();
  expect(body.model).toBeUndefined();
});
it.each(['element-2', 'invented', '#checkout'])('discards unsafe target %s', async targetId => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { answer: 'Answer', targetId } }) }));
  expect(await askAI(page, 'Where?', config)).toEqual({ answer: 'Answer' });
});
it.each(['unauthorized','usage_limit','rate_limit','timeout','unavailable','invalid_request'])('uses safe messages for %s', async code => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { code, message: 'private upstream data' } }) }));
  await expect(askAI(page, undefined, config)).rejects.not.toThrow('private upstream');
});
it('rejects missing backend/content before networking', async () => {
  const mock = vi.fn(); vi.stubGlobal('fetch', mock);
  await expect(askAI(page, undefined, { backendUrl: '' })).rejects.toThrow('not configured');
  await expect(askAI({ ...page, text: '', interactive: [] }, undefined, config)).rejects.toThrow('No readable');
  expect(mock).not.toHaveBeenCalled();
});
it('handles unreachable backend and invalid response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private')));
  await expect(askAI(page, undefined, config)).rejects.toThrow('Could not reach');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, result: { answer: '' } }) }));
  await expect(askAI(page, undefined, config)).rejects.toThrow('invalid answer');
});
