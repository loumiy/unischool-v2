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
