import { afterEach, expect, it, vi } from 'vitest';
import { speak, stopSpeech } from '../src/services/speech';
afterEach(() => vi.unstubAllGlobals());
it('replaces existing speech, queues short utterances, and stops', () => {
  const synthesis = { cancel: vi.fn(), speak: vi.fn() };
  vi.stubGlobal('speechSynthesis', synthesis);
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
  speak('A summary. Another sentence.', vi.fn());
  expect(synthesis.cancel).toHaveBeenCalledOnce();
  expect(synthesis.speak).toHaveBeenCalledTimes(2);
  stopSpeech();
  expect(synthesis.cancel).toHaveBeenCalledTimes(2);
});
