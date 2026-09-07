import { handleRequest, isRequest } from './handler';
chrome.runtime.onMessage.addListener((request: unknown, sender, sendResponse) => {
  // Only this extension's popup may trigger extraction or billable requests.
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return false;
  if (!isRequest(request)) { sendResponse({ ok: false, error: 'Invalid request.' }); return false; }
  void handleRequest(request, { apiKey: __OPENAI_API_KEY__, model: __OPENAI_MODEL__ }).then(sendResponse);
  return true;
});
