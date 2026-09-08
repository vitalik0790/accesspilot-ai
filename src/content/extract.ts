import type { ElementInfo, PageSnapshot, PageStructureItem, InteractiveElement, ElementRegistry } from '../shared/types';

/** Passed to executeScript: keep all runtime helpers inside this function. */
export function extractPage(): PageSnapshot {
  // getRandomValues also works on HTTP pages; randomUUID is secure-context only.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const snapshotId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const registry: ElementRegistry = { snapshotId, url: location.href, expiresAt: Date.now() + 300000, targets: new Map() };
  window.__accessPilotElements = registry;
  const limit = 16000;
  const privateRegion = '[contenteditable]:not([contenteditable="false"]),[role~="textbox"],[role~="searchbox"],[role~="combobox"],[role~="spinbutton"],[role~="slider"],[role~="listbox"]';
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
  const roles = ['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'textbox', 'searchbox', 'combobox', 'listbox', 'switch', 'slider', 'spinbutton'];
  const roleOf = (el: HTMLElement): string => {
    const explicit = clean(el.getAttribute('role')).split(' ').find(role => roles.includes(role));
    if (explicit) return explicit;
    if (el instanceof HTMLInputElement) {
      if (['submit', 'reset', 'button', 'image'].includes(el.type)) return 'button';
      if (['checkbox', 'radio'].includes(el.type)) return el.type;
      if (el.type === 'search') return 'searchbox';
      if (el.type === 'range') return 'slider';
      if (el.type === 'number') return 'spinbutton';
      return 'textbox';
    }
    if (el instanceof HTMLSelectElement) return el.multiple || el.size > 1 ? 'listbox' : 'combobox';
    if (el instanceof HTMLTextAreaElement) return 'textbox';
    return el.tagName === 'A' ? 'link' : 'button';
  };
  const disabled = (el: HTMLElement) => el.matches(':disabled') || !!el.closest('[aria-disabled="true"]');
  const eligible = (el: HTMLElement): boolean => visible(el) &&
    !el.closest('[contenteditable]:not([contenteditable="false"])') &&
    !el.parentElement?.closest(privateRegion) &&
    !(el instanceof HTMLInputElement && ['password', 'hidden'].includes(el.type));
  const interactive: InteractiveElement[] = [];
  const controls = `button,a[href],input,select,textarea,${roles.map(role => `[role~="${role}"]`).join(',')}`;
  let interactiveTruncated = false;
  for (const el of document.querySelectorAll(controls)) {
    if (!(el instanceof HTMLElement) || !eligible(el)) continue;
    if (interactive.length === 100) { interactiveTruncated = true; break; }
    const role = roleOf(el);
    // Editable widget text is excluded by readableText; only its label is used.
    const fullName = name(el, !['textbox', 'searchbox', 'combobox', 'spinbutton', 'slider', 'listbox'].includes(role));
    const id = `element-${interactive.length + 1}`;
    const inputType = el instanceof HTMLInputElement ? el.type : '';
    const destination = el.getAttribute('href');
    interactive.push({ id, role, name: fullName.slice(0, 160), disabled: disabled(el) });
    registry.targets.set(id, { element: el, isCurrent: () =>
      el.isConnected && eligible(el) && !disabled(el) && roleOf(el) === role &&
      (el instanceof HTMLInputElement ? el.type : '') === inputType &&
      el.getAttribute('href') === destination &&
      name(el, !['textbox', 'searchbox', 'combobox', 'spinbutton', 'slider', 'listbox'].includes(role)) === fullName,
    });
  }
  const parts: string[] = [];
  let length = 0;
  let truncated = interactiveTruncated;
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
    snapshotId, interactive,
    title: clean(document.title).slice(0, 300), text: parts.join('\n').slice(0, limit), truncated,
    structure, images: collect('img'),
    buttons: collect('button,[role="button"],input[type="button"],input[type="submit"],input[type="reset"],input[type="image"]', true),
    fields: collect('input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]),select,textarea'),
  };
}
