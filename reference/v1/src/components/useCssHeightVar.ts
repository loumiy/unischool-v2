// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
import { useCallback, useEffect, useState } from 'react';

// Keeps a root CSS custom property synced to one element's REAL rendered
// height, via ResizeObserver. Used by the always-on floating chrome whose
// height isn't a constant: content wraps or grows, so a fixed CSS value
// would either waste map area or, worse, leave a strip of tiles physically
// under an opaque panel — on screen but never reachable.
// `.campus-map-canvas` (see styles.css) insets its interactive area by
// these variables instead of guessing a number.
//
// Returns a CALLBACK ref, not a plain object ref, and owns the DOM node as
// real React state rather than a ref the caller holds — deliberately: the
// element this measures (the toolbar) does not exist on the very first
// render App.tsx makes (the pre-game StartupScreen renders in its place,
// per `s.started`), so an effect keyed to a stable useRef object never
// re-fires once that object's `.current` finally stops being null — a ref
// changing doesn't trigger a re-render or re-run any effect. A callback
// ref does: React calls it (and this hook's setState) every time the node
// attaches OR detaches, which is what lets the effect below actually run
// once there is something real to measure, not just once at an App mount
// that predates the toolbar entirely.
export function useCssHeightVar(varName: string): (el: HTMLElement | null) => void {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const ref = useCallback((el: HTMLElement | null) => setNode(el), []);

  useEffect(() => {
    if (!node) return;
    const sync = () => document.documentElement.style.setProperty(varName, `${node.getBoundingClientRect().height}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, varName]);

  return ref;
}
