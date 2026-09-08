import { handleRequest, handleFocus, isRequest } from './handler';
chrome.runtime.onMessage.addListener((request: unknown, sender, sendResponse) => {
  // Only this extension's popup may trigger extraction or billable requests.
  if (sender.id !== chrome.runtime.id || sender.url?.split('#')[0] !== chrome.runtime.getURL('popup.html')) return false;
  if (!isRequest(request)) { sendResponse({ ok: false, error: 'Invalid request.' }); return false; }
  const response = request.type === 'focus' ? handleFocus(request) : handleRequest(request, { apiKey: __OPENAI_API_KEY__, model: __OPENAI_MODEL__ });
  void response.then(sendResponse);
  return true;
});
