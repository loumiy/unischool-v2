// Darken or lighten a hex colour by a factor. Every shade on a building is
// derived from one material this way rather than authored by hand.
export function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n) || hex.length !== 7) return hex;
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(v * factor))),
  );
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// Mix two hex colours: 0 is all `a`, 1 is all `b`. Snow on a roof is the
// roof's own colour, going white (Phase 21E).
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  if (Number.isNaN(pa) || Number.isNaN(pb) || a.length !== 7 || b.length !== 7) return a;
  const k = Math.max(0, Math.min(1, t));
  const ch = [16, 8, 0].map((sh) => {
    const x = (pa >> sh) & 255;
    const y = (pb >> sh) & 255;
    return Math.round(x + (y - x) * k);
  });
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
