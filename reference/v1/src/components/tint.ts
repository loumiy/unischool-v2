// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
// One place to darken or lighten a hex colour by a factor. Both drawing
// modules need it — buildingMotifs.tsx shades every wall and roof face off
// one material, and groundMarkings.tsx shades a stand's risers off its
// treads — and groundMarkings cannot import from buildingMotifs without a
// cycle, so the helper lives on its own.
export function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n) || hex.length !== 7) return hex;
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => Math.max(0, Math.min(255, Math.round(v * factor))));
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
