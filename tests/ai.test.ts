import { afterEach, describe, expect, it, vi } from 'vitest';
import { askAI } from '../src/services/ai';
import type { PageSnapshot } from '../src/shared/types';
const page: PageSnapshot = { snapshotId: 'test-snapshot', interactive: [], title: 'Example', text: 'Page facts', truncated: false, structure: [{ kind: 'heading', name: 'Overview' }], images: [], buttons: [], fields: [] };
const config = { apiKey: 'test-placeholder', model: 'test-model' };
afterEach(() => vi.unstubAllGlobals());
describe('AI service', () => {
  it('sends only page text metadata and question, disables response storage, and parses output', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [
      { type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ answer: 'A short answer.', targetId: null }) }] },
    ] }) });
    vi.stubGlobal('fetch', fetchMock);
    expect(await askAI(page, 'What is this?', config)).toEqual({ answer: 'A short answer.' });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    expect(body.store).toBe(false);
    expect(body.instructions).toContain('untrusted');
    expect(body.text.format.type).toBe('json_schema');
    expect(body.text.format.strict).toBe(true);
    expect(JSON.parse(body.input).page).toEqual({ title: 'Example', text: 'Page facts', truncated: false, structure: [{ kind: 'heading', name: 'Overview' }], interactive: [] });
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
  it.each(['element-1', 'element-2', 'invented', '#checkout', null])('validates suggested target %s against the snapshot', async targetId => {
    const interactive = [{ id: 'element-1', role: 'button', name: 'Checkout', disabled: false }, { id: 'element-2', role: 'button', name: 'Disabled', disabled: true }];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ answer: 'Use Checkout.', targetId }) }] }] }) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await askAI({ ...page, interactive }, 'Where is checkout?', config);
    expect(result).toEqual({ answer: 'Use Checkout.', ...(targetId === 'element-1' ? { targetId } : {}) });
    const sent = JSON.parse(JSON.parse(fetchMock.mock.calls[0][1].body).input);
    expect(sent.page.interactive).toEqual(interactive);
    expect(sent.page).not.toHaveProperty('snapshotId');
    expect(sent.page).not.toHaveProperty('fields');
  });
  it('preserves plain-text summaries without sending interactive records', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Summary.' }] }] }) });
    vi.stubGlobal('fetch', fetchMock);
    expect(await askAI(page, undefined, config)).toEqual({ answer: 'Summary.' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('text');
    expect(JSON.parse(body.input).page).not.toHaveProperty('interactive');
  });
  it.each(['not JSON', '{}', '{"answer":"","targetId":null}', '{"answer":"Hello","targetId":42}'])('handles malformed structured answers', async text => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text }] }] }) }));
    await expect(askAI(page, 'Where?', config)).rejects.toThrow('invalid navigation answer');
  });
});
