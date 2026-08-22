// FILE: editableEventTarget.ts
// Purpose: Detect when a keyboard event targets (or descends from) a native
// text-editing surface — input, textarea, select, or a contenteditable
// element — so global keyboard-shortcut handlers can avoid hijacking regular
// text editing (e.g. native OS text-navigation bindings like macOS Ctrl+B).
// Layer: Web DOM utilities (no React, no app state).

const EDITABLE_TAG_SELECTOR = "input, textarea, select";

function elementIsEditableSurface(element: Element): boolean {
  if (element.closest(EDITABLE_TAG_SELECTOR) !== null) return true;
  return element instanceof HTMLElement && element.isContentEditable;
}

export function isEditableEventTarget(event: globalThis.KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (elementIsEditableSurface(target)) return true;
  // Decorations around dialog/picker fields can receive the event while focus
  // remains on the real control underneath.
  const active = target.ownerDocument?.activeElement;
  if (active instanceof Element && active !== target && elementIsEditableSurface(active)) {
    return true;
  }
  return false;
}
