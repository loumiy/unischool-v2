import { useCallback, useEffect, useState } from 'react';

// Keeps a root CSS custom property synced to one element's REAL rendered
// height, via ResizeObserver. The toolbar's height is not a constant — it
// wraps at narrow widths — and the map insets by it, so a fixed value would
// leave tiles on screen but unreachable under an opaque band.
//
// A callback ref, so the effect runs when the element attaches (it does not
// exist while the startup screen is up).
export function useCssHeightVar(varName: string): (el: HTMLElement | null) => void {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const ref = useCallback((el: HTMLElement | null) => setNode(el), []);

  useEffect(() => {
    if (!node) return;
    const sync = () =>
      document.documentElement.style.setProperty(
        varName,
        `${node.getBoundingClientRect().height}px`,
      );
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, varName]);

  return ref;
}
