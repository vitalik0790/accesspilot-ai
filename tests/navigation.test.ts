import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractPage } from '../src/content/extract';
import { focusElement } from '../src/content/focus';
afterEach(() => { delete window.__accessPilotElements; });
describe('interactive discovery', () => {
  it('discovers native and ARIA controls with names, roles, and disabled states', () => {
    document.body.innerHTML = `<button>Schedule</button><a href="/checkout">Checkout</a>
      <label for="q">Search</label><input id="q" type="search" value="private">
      <div role="checkbox" aria-label="Remember me" aria-disabled="true"></div>
      <div role="radio" aria-labelledby="radio-name"></div><span id="radio-name">Delivery</span>
      <div role="tab">Details</div><div role="menuitem">Help</div>
      <fieldset disabled><input aria-label="Unavailable"></fieldset>`;
    const page = extractPage();
    expect(page.interactive.map(({ role, name, disabled }) => ({ role, name, disabled }))).toEqual([
      { role: 'button', name: 'Schedule', disabled: false }, { role: 'link', name: 'Checkout', disabled: false },
      { role: 'searchbox', name: 'Search', disabled: false }, { role: 'checkbox', name: 'Remember me', disabled: true },
      { role: 'radio', name: 'Delivery', disabled: false }, { role: 'tab', name: 'Details', disabled: false },
      { role: 'menuitem', name: 'Help', disabled: false }, { role: 'textbox', name: 'Unavailable', disabled: true },
    ]);
    expect(new Set(page.interactive.map(el => el.id)).size).toBe(8);
    expect(JSON.stringify(page)).not.toContain('private');
  });
  it('excludes hidden/password/editable elements and never copies entered values into names', () => {
    document.body.innerHTML = `<input type="password" aria-label="Password" value="secret-password"><button hidden>Hidden</button>
      <div aria-hidden="true"><a href="/">Hidden link</a></div><button style="display:none">CSS hidden</button>
      <div contenteditable><button>Editable</button></div><label>Message<textarea>secret-draft</textarea></label>
      <div role="textbox" aria-label="Search">secret-typed</div><select aria-label="Country"><option>secret-selected</option></select>
      <button><img alt="Search icon"></button><div role="unknown spinbutton" aria-label="Quantity">secret-number</div>`;
    const page = extractPage();
    expect(page.interactive.map(el => el.name)).toEqual(['Message', 'Search', 'Country', 'Search icon', 'Quantity']);
    expect(JSON.stringify(page)).not.toContain('secret-');
  });
  it('bounds discovery and replaces the snapshot registry without touching page IDs', () => {
    document.body.innerHTML = Array.from({ length: 102 }, (_, i) => `<button id="native-${i}">Go</button>`).join('');
    const first = extractPage();
    const second = extractPage();
    expect(first.interactive).toHaveLength(100);
    expect(first.truncated).toBe(true);
    expect(second.snapshotId).not.toBe(first.snapshotId);
    expect(document.querySelector('button')?.id).toBe('native-0');
    expect(focusElement(first.snapshotId, first.interactive[0].id).ok).toBe(false);
  });
  it('creates snapshot IDs without the secure-context-only randomUUID API', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('Unavailable on HTTP'); });
    const page = extractPage();
    expect(page.snapshotId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
describe('focus-only navigation', () => {
  function setup(markup = '<button>Schedule</button>') {
    document.body.innerHTML = markup;
    const element = document.body.firstElementChild as HTMLElement;
    element.scrollIntoView = vi.fn();
    const page = extractPage();
    return { element, page, focus: () => focusElement(page.snapshotId, page.interactive[0].id) };
  }
  it('scrolls and focuses without clicking or submitting', () => {
    const { element, focus } = setup();
    const click = vi.fn(); const submit = vi.fn();
    element.addEventListener('click', click); document.addEventListener('submit', submit, { once: true });
    expect(focus()).toEqual({ ok: true });
    expect(document.activeElement).toBe(element);
    expect(element.scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'nearest', behavior: 'instant' });
    expect(click).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
  });
  it('temporarily focuses a custom widget without adding a tab stop', () => {
    const { element, focus } = setup('<div role="tab">Details</div>');
    expect(focus().ok).toBe(true);
    expect(element.tabIndex).toBe(-1);
    element.blur();
    expect(element.hasAttribute('tabindex')).toBe(false);
  });
  it.each(['remove', 'replace', 'hide', 'disable', 'rename', 'expire'])('rejects a target after %s', action => {
    const { element, focus } = setup();
    if (action === 'remove') element.remove();
    if (action === 'replace') element.replaceWith(element.cloneNode(true));
    if (action === 'hide') element.hidden = true;
    if (action === 'disable') element.setAttribute('aria-disabled', 'true');
    if (action === 'rename') element.textContent = 'Different';
    if (action === 'expire') window.__accessPilotElements!.expiresAt = 0;
    expect(focus()).toMatchObject({ ok: false, error: expect.stringContaining('no longer available') });
  });
  it('rejects arbitrary selectors, URL changes, and changed link destinations', () => {
    const { element, page, focus } = setup('<a href="/checkout">Checkout</a>');
    expect(focusElement(page.snapshotId, 'a[href]')).toMatchObject({ ok: false });
    element.setAttribute('href', '/different');
    expect(focus().ok).toBe(false);
    element.setAttribute('href', '/checkout');
    window.__accessPilotElements!.url = 'https://different.example';
    expect(focus().ok).toBe(false);
  });
});
