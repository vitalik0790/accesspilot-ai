import type { ElementInfo, PageSnapshot, PageStructureItem } from '../shared/types';

/** Passed to executeScript: keep all runtime helpers inside this function. */
export function extractPage(): PageSnapshot {
  const limit = 16000;
  const privateRegion = '[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="searchbox"],[role="combobox"]';
  const excludedText = `script,style,noscript,template,input,textarea,select,${privateRegion}`;
  const clean = (value: string | null) => (value || '').replace(/\s+/g, ' ').trim();
  const visible = (element: Element): boolean => {
    for (let current: Element | null = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (current.matches('[hidden], [inert], [aria-hidden="true"]') ||
        style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
      if (current instanceof HTMLDetailsElement && !current.open) {
        const summary = current.querySelector(':scope > summary');
        if (!summary?.contains(element)) return false;
      }
    }
    return true;
  };
  // Use the same exclusions for labels and headings as for body text. Never
  // read an input's value or an entire label's unfiltered textContent.
  const readableText = (element: Element): string => {
    const parts: string[] = [];
    let length = 0;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode()) && length < 200) {
      const parent = node.parentElement;
      if (!parent || parent.closest(excludedText) || !visible(parent)) continue;
      const text = clean(node.textContent).slice(0, 200 - length);
      if (text) { parts.push(text); length += text.length + 1; }
    }
    return clean(parts.join(' ')).slice(0, 200);
  };
  const name = (element: Element, allowText = false): string => {
    const references = clean(element.getAttribute('aria-labelledby')).split(' ').filter(Boolean);
    const referenced = clean(references.map(id => {
      const label = document.getElementById(id);
      return label ? readableText(label) : '';
    }).join(' '));
    if (referenced) return referenced;
    const aria = clean(element.getAttribute('aria-label'));
    if (aria) return aria;
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
      const labels = clean(Array.from(element.labels || []).map(readableText).join(' '));
      if (labels) return labels;
      if (element instanceof HTMLInputElement) {
        if (element.type === 'image') return clean(element.alt || element.title);
        if (['submit', 'reset', 'button'].includes(element.type)) {
          return clean(element.title || (element.type === 'submit' ? 'Submit' : element.type === 'reset' ? 'Reset' : ''));
        }
      }
    }
    if (allowText) {
      const text = readableText(element);
      if (text) return text;
      const alt = clean(Array.from(element.querySelectorAll('img[alt]')).filter(img => visible(img) && !img.closest(privateRegion)).map(img => img.getAttribute('alt')).join(' '));
      if (alt) return alt;
    }
    return clean(element.getAttribute('title'));
  };
  const collect = (selector: string, allowText = false): ElementInfo[] =>
    Array.from(document.querySelectorAll(selector)).filter(el => visible(el) && !el.closest(privateRegion)).slice(0, 2000).map(el => ({
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
    if (!parent || parent.closest(excludedText) || !visible(parent)) continue;
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
  // Document-order hints supplement text without URLs, attributes, or raw DOM.
  const structure: PageStructureItem[] = [];
  const selector = 'h1,h2,h3,h4,h5,h6,main,nav,aside,[role="main"],[role="navigation"],a,button,label,img';
  for (const element of document.querySelectorAll(selector)) {
    if (!visible(element) || element.closest(excludedText)) continue;
    const tag = element.tagName.toLowerCase();
    const kind: PageStructureItem['kind'] = /^h[1-6]$/.test(tag) ? 'heading' :
      tag === 'a' ? 'link' : tag === 'button' ? 'button' : tag === 'label' ? 'form-label' : tag === 'img' ? 'image' : 'landmark';
    const value = kind === 'image' ? clean(element.getAttribute('alt')) :
      kind === 'landmark' ? clean(element.getAttribute('aria-label')) || element.getAttribute('role') || tag : name(element, true);
    if (!value) continue;
    if (structure.length === 40) { truncated = true; break; }
    structure.push({ kind, name: value.slice(0, 160) });
  }
  return {
    title: clean(document.title).slice(0, 300), text: parts.join('\n').slice(0, limit), truncated,
    structure, images: collect('img'),
    buttons: collect('button,[role="button"],input[type="button"],input[type="submit"],input[type="reset"],input[type="image"]', true),
    fields: collect('input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]),select,textarea'),
  };
}
