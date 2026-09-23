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
  const box = world.getBBox();
  const clone = world.cloneNode(true) as SVGGElement;
  clone.removeAttribute('transform');
  for (const sel of DROP) clone.querySelectorAll(sel).forEach((n) => n.remove());
  const pad = 24;
  const viewBox = [box.x - pad, box.y - pad, box.width + pad * 2, box.height + pad * 2]
    .map((n) => n.toFixed(0))
    .join(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" class="campus-map-svg portrait-svg">${clone.outerHTML}</svg>`;
  const season = [...map.classList].find((c) => c.startsWith('season-')) ?? 'season-fall';
  return { svg, season };
}
