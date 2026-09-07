import type { ElementInfo, PageSnapshot } from '../shared/types';

/** Passed to executeScript: keep all runtime helpers inside this function. */
export function extractPage(): PageSnapshot {
  const limit = 16000;
  const clean = (value: string | null) => (value || '').replace(/\s+/g, ' ').trim();
  const visible = (element: Element): boolean => {
    for (let current: Element | null = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (current.matches('[hidden], [inert], [aria-hidden="true"]') ||
        style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    }
    return true;
  };
  const name = (element: Element, allowText = false): string => {
    const references = clean(element.getAttribute('aria-labelledby')).split(' ').filter(Boolean);
    const referenced = clean(references.map(id => document.getElementById(id)?.textContent || '').join(' '));
    if (referenced) return referenced;
    const aria = clean(element.getAttribute('aria-label'));
    if (aria) return aria;
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
      const labels = clean(Array.from(element.labels || []).map(label => label.textContent).join(' '));
      if (labels) return labels;
      if (element instanceof HTMLInputElement) {
        if (element.type === 'image') return clean(element.alt || element.title);
        if (['submit', 'reset', 'button'].includes(element.type)) {
          return clean(element.value || (element.type === 'submit' ? 'Submit' : element.type === 'reset' ? 'Reset' : '') || element.title);
        }
      }
    }
    if (allowText) {
      const text = clean(element.textContent);
      if (text) return text;
      const alt = clean(Array.from(element.querySelectorAll('img[alt]')).map(img => img.getAttribute('alt')).join(' '));
      if (alt) return alt;
    }
    return clean(element.getAttribute('title'));
  };
  const collect = (selector: string, allowText = false): ElementInfo[] =>
    Array.from(document.querySelectorAll(selector)).filter(visible).slice(0, 2000).map(el => ({
      tag: el.tagName.toLowerCase(), name: name(el, allowText).slice(0, 200),
      ...(el.tagName === 'IMG' ? { hasAlt: el.hasAttribute('alt') } : {}),
    }));
  const parts: string[] = [];
  let length = 0;
  let truncated = false;
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || parent.closest('script,style,noscript,template,input,textarea,select,[contenteditable]:not([contenteditable="false"])') || !visible(parent)) continue;
    const text = clean(node.textContent);
    if (!text) continue;
    if (length + text.length + 1 > limit) {
      parts.push(text.slice(0, Math.max(0, limit - length)));
      truncated = true;
      break;
    }
    parts.push(text);
    length += text.length + 1;
  }
  return {
    title: clean(document.title).slice(0, 300), text: parts.join('\n').slice(0, limit), truncated,
    images: collect('img'),
    buttons: collect('button,[role="button"],input[type="button"],input[type="submit"],input[type="reset"],input[type="image"]', true),
    fields: collect('input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]),select,textarea'),
  };
}
