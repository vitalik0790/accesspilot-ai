export function stopSpeech(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
export function speak(text: string, onError: (message: string) => void): void {
  if (!('speechSynthesis' in window)) { onError('Speech is unavailable in this browser. The response is available as text.'); return; }
  stopSpeech();
  // Short utterances avoid long-utterance stalls in browser speech engines.
  const chunks = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
  for (const chunk of chunks.flatMap(part => part.match(/[\s\S]{1,180}(?:\s|$)|[\s\S]{1,180}/g) || [])) {
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = document.documentElement.lang || 'en';
    utterance.onerror = event => {
      if (event.error !== 'canceled' && event.error !== 'interrupted') onError('Speech could not be played. The response is available as text.');
    };
    window.speechSynthesis.speak(utterance);
  }
}
