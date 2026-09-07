import { afterEach, describe, expect, it, vi } from 'vitest';
import { askAI } from '../src/services/ai';
import type { PageSnapshot } from '../src/shared/types';
const page: PageSnapshot = { title: 'Example', text: 'Page facts', truncated: false, structure: [{ kind: 'heading', name: 'Overview' }], images: [], buttons: [], fields: [] };
const config = { apiKey: 'test-placeholder', model: 'test-model' };
afterEach(() => vi.unstubAllGlobals());
describe('AI service', () => {
  it('sends only page text metadata and question, disables response storage, and parses output', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [
      { type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: 'A short answer.' }] },
    ] }) });
    vi.stubGlobal('fetch', fetchMock);
    expect(await askAI(page, 'What is this?', config)).toBe('A short answer.');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    expect(body.store).toBe(false);
    expect(body.instructions).toContain('untrusted');
    expect(JSON.parse(body.input)).toEqual({ task: 'What is this?', page: { title: 'Example', text: 'Page facts', truncated: false, structure: [{ kind: 'heading', name: 'Overview' }] } });
  });
  it('fails before network access when key or content is missing', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(askAI(page, undefined, { ...config, apiKey: '' })).rejects.toThrow('not configured');
    await expect(askAI({ ...page, text: '' }, undefined, config)).rejects.toThrow('No readable');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([[401, 'rejected'], [429, 'limit'], [500, 'failed']])('handles HTTP %s safely', async (status, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }));
    await expect(askAI(page, undefined, config)).rejects.toThrow(message as string);
  });
  it('handles network failures and empty or incomplete answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    await expect(askAI(page, undefined, config)).rejects.toThrow('Could not reach');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [] }) }));
    await expect(askAI(page, undefined, config)).rejects.toThrow('no readable answer');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'incomplete' }) }));
    await expect(askAI(page, undefined, config)).rejects.toThrow('did not complete');
  });
});
