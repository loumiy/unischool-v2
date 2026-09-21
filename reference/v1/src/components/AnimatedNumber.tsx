// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
import { useEffect, useRef, useState } from 'react';

// Ticks from whatever is currently on screen to a new `value` instead of
// snapping straight to it — the "quick animation" the admissions form
// wants whenever a lever moves a downstream number (the freshman class,
// incoming quality). Purely cosmetic: the settled display always equals
// `value` exactly, and interrupting mid-tween (dragging a slider quickly)
// just re-tweens from wherever the animation currently is, never fights
// or resets.
const DEFAULT_DURATION_MS = 450;

// This tween is driven by requestAnimationFrame, not by CSS, so the
// stylesheet's blanket prefers-reduced-motion rule cannot reach it — it has
// to ask for itself. A reader who has asked for less motion gets the settled
// figure immediately, which is the same number either way.
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function AnimatedNumber({
  value,
  format = defaultFormat,
  durationMs = DEFAULT_DURATION_MS,
  revealFrom,
}: {
  value: number;
  format?: (n: number) => string;
  // Longer than the default for a number that is the point of the screen
  // rather than a consequence of a slider — see the summer admissions
  // reveal (Plan 05's PR F).
  durationMs?: number;
  // Where to start counting from ON MOUNT. Without it a freshly mounted
  // number has nothing to tween from — it initialises to its own final
  // value and simply appears, which is the right behaviour everywhere
  // except a reveal, whose whole content is the climb.
  revealFrom?: number;
}) {
  const [displayed, setDisplayed] = useState(revealFrom ?? value);
  const displayedRef = useRef(revealFrom ?? value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = displayedRef.current;
    const to = value;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    if (from === to) return;
    if (prefersReducedMotion()) {
      displayedRef.current = to;
      setDisplayed(to);
      return;
    }

    let start: number | null = null;
    function tick(now: number) {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3; // ease-out: settles gently, doesn't slide linearly
      const next = from + (to - from) * eased;
      displayedRef.current = next;
      setDisplayed(next);
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); };
    // `durationMs` is deliberately NOT a dependency: re-running this on a
    // duration change would restart a tween mid-flight, and nothing in the
    // app changes a number's duration while it is moving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <>{format(displayed)}</>;
}

function defaultFormat(n: number): string {
  return Math.round(n).toLocaleString();
}
