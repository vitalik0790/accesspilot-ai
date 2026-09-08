import type { FocusResponse } from '../shared/types';

/** Serialized by executeScript: only access the isolated world's registry. */
export function focusElement(snapshotId: string, targetId: string): FocusResponse {
  const stale = 'This target is no longer available or the page changed. Ask your question again.';
  const registry = window.__accessPilotElements;
  if (!registry || registry.snapshotId !== snapshotId || registry.url !== location.href || Date.now() >= registry.expiresAt) {
    return { ok: false, error: stale };
  }
  const target = registry.targets.get(targetId);
  if (!target || !target.isCurrent()) return { ok: false, error: stale };
  const element = target.element;
  // Some ARIA widgets are not focusable. A temporary negative tabindex allows
  // programmatic focus without adding a tab stop or altering positive order.
  const temporary = !element.hasAttribute('tabindex') && element.tabIndex < 0;
  if (temporary) element.setAttribute('tabindex', '-1');
  const restore = () => {
    if (temporary && element.getAttribute('tabindex') === '-1') element.removeAttribute('tabindex');
  };
  try {
    element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    element.focus({ preventScroll: true });
    if (document.activeElement !== element || !target.isCurrent()) {
      restore();
      return { ok: false, error: 'The page could not keep focus on this element. Ask again or navigate with your screen reader.' };
    }
    if (temporary) element.addEventListener('blur', restore, { once: true });
    return { ok: true };
  } catch {
    restore();
    return { ok: false, error: 'Could not focus this element. Ask your question again.' };
  }
}
