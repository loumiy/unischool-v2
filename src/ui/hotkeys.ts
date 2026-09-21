import { useEffect, useRef } from 'react';

// The one place the game's keyboard rules live (ported from v1). Nothing
// here knows what a key means — that stays with the component that owns
// the thing the key does. This only decides WHEN a keypress is the game's
// to act on at all.

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

// True when the keypress belongs to a text control the player is typing in.
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return TYPING_TAGS.has(el.tagName) || el.isContentEditable === true;
}

// Which device the player is driving with: a pointer press means the mouse,
// Tab means the keyboard. Space and Enter deliberately do not vote — they
// are the keys being arbitrated.
let keyboardModality = false;
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    () => {
      keyboardModality = false;
    },
    true,
  );
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Tab') keyboardModality = true;
    },
    true,
  );
}

// True when the keypress is already going to activate a focused control on
// its own — a Tab-focused button answers Space and Enter natively, and a
// hotkey that also fired would double-act on it.
export function isActivationTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.matches !== 'function') return false;
  if (el.tagName !== 'BUTTON' && el.tagName !== 'A') return false;
  return keyboardModality && el.matches(':focus-visible');
}

// Subscribe to global keydown for as long as `enabled` holds. Chords are
// never game hotkeys: anything held with Ctrl/Meta/Alt is the browser's.
export function useHotkeys(onKeyDown: (e: KeyboardEvent) => void, enabled = true): void {
  const handlerRef = useRef(onKeyDown);
  useEffect(() => {
    handlerRef.current = onKeyDown;
  });

  useEffect(() => {
    if (!enabled) return;
    function handle(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      handlerRef.current(e);
    }
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [enabled]);
}
