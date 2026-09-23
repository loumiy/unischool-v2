// THE CAMPUS PORTRAIT (DD §12.3, Phase 28): the map as it stands, taken
// from the live SVG — the ground, the trees, the buildings in their motif
// and colours — without the labels, the walkers or the pan and zoom. It is
// kept as SVG markup and shown again inside the same styles, so what hangs
// in the hall is the campus the player built, not a screenshot of the
// screen they built it on.

const DROP = ['.campus-label', '.campus-ambient', '.campus-refusal', '.campus-quad-names', 'title'];

export function capturePortrait(): { svg: string; season: string } | null {
  const world = document.querySelector<SVGGElement>('.campus-map-svg > g');
  const map = document.querySelector<HTMLElement>('.campus-map');
  if (!world || !map) return null;
  // Framed on the campus, not on the parcel's empty corners (Phase 49): the
  // union of what stands, with a margin of lawn.
  const box = campusBox(world) ?? world.getBBox();
  const clone = world.cloneNode(true) as SVGGElement;
  clone.removeAttribute('transform');
  for (const sel of DROP) clone.querySelectorAll(sel).forEach((n) => n.remove());
  const pad = 48;
  const viewBox = [box.x - pad, box.y - pad, box.width + pad * 2, box.height + pad * 2]
    .map((n) => n.toFixed(0))
    .join(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" class="campus-map-svg portrait-svg">${clone.outerHTML}</svg>`;
  const season = [...map.classList].find((c) => c.startsWith('season-')) ?? 'season-fall';
  // At golden hour, whatever the week (Phase 49).
  return { svg, season: `${season} portrait-golden` };
}

function campusBox(
  world: SVGGElement,
): { x: number; y: number; width: number; height: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const el of world.querySelectorAll<SVGGraphicsElement>('.campus-building')) {
    const b = el.getBBox();
    if (b.width === 0 && b.height === 0) continue;
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width);
    y1 = Math.max(y1, b.y + b.height);
  }
  if (!Number.isFinite(x0)) return null;
  // No narrower than a landscape frame wants.
  const w = x1 - x0;
  const h = y1 - y0;
  const want = Math.max(w, h * 1.6);
  const cx = (x0 + x1) / 2;
  return { x: cx - want / 2, y: y0, width: want, height: Math.max(h, want / 1.6) };
}
