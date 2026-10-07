import { type RefObject, useEffect, useRef } from 'react';

interface UseSessionKeyboardOptions {
  enabled: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onToggleChecked: (itemId: string) => void;
  onAdd: () => void;
  onBack: () => void;
}

const ROW_SELECTOR = '[data-item-id]';
const TYPING_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const OVERLAY_SELECTOR = '[role="dialog"], [role="menu"], [role="alertdialog"]';

function shouldIgnore(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return true;
  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest(TYPING_SELECTOR)) return true;
  // Radix closes its overlay on Escape; the overlay is still mounted when this listener runs.
  return document.querySelector(OVERLAY_SELECTOR) !== null;
}

function focusRow(row: HTMLElement) {
  row.focus();
  row.scrollIntoView?.({ block: 'nearest' });
}

export function useSessionKeyboard(options: UseSessionKeyboardOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const { enabled } = options;

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;

    const rows = (): HTMLElement[] => {
      const container = optionsRef.current.containerRef.current;
      return container ? Array.from(container.querySelectorAll<HTMLElement>(ROW_SELECTOR)) : [];
    };

    const currentRow = (): HTMLElement | null => {
      const active = document.activeElement;
      return active?.closest<HTMLElement>(ROW_SELECTOR) ?? null;
    };

    const moveFocus = (step: 1 | -1) => {
      const all = rows();
      if (all.length === 0) return false;
      const current = currentRow();
      const index = current ? all.indexOf(current) : -1;
      const next =
        index === -1
          ? all[step === 1 ? 0 : all.length - 1]
          : all[Math.min(Math.max(index + step, 0), all.length - 1)];
      focusRow(next);
      return true;
    };

    const toggleFocusedRow = () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !active.matches(ROW_SELECTOR)) return false;
      const all = rows();
      const index = all.indexOf(active);
      const neighbour = all[index + 1] ?? all[index - 1];
      const neighbourId = neighbour?.dataset.itemId;
      optionsRef.current.onToggleChecked(active.dataset.itemId as string);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = rows().find((r) => r.dataset.itemId === neighbourId);
        if (target) focusRow(target);
      });
      return true;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnore(e)) return;
      let handled = false;
      switch (e.key) {
        case 'ArrowDown':
          handled = moveFocus(1);
          break;
        case 'ArrowUp':
          handled = moveFocus(-1);
          break;
        case ' ':
        case 'Enter':
          handled = toggleFocusedRow();
          break;
        case 'n':
        case 'N':
          optionsRef.current.onAdd();
          handled = true;
          break;
        case 'Escape':
          optionsRef.current.onBack();
          handled = true;
          break;
      }
      if (handled) e.preventDefault();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      cancelAnimationFrame(frame);
    };
  }, [enabled]);
}
