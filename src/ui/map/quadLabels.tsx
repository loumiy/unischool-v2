import { memo } from 'react';
import { detectQuads, type Campus, type Quad } from '../../sim/index.ts';
import { boxFaces, polyPoints, project, type Camera } from './iso.ts';

// THE QUADS, NAMED ON THE GROUND (DD §6.2): the game detects the spaces the
// buildings enclose and writes their names across them, in the register of
// a map rather than a label — the ground the name belongs to, tinted, with
// the name lying on it. Clicking one opens its card, where the player can
// call it whatever they like.

const FONT = 22;

function QuadPatch({
  quad,
  selected,
  onSelect,
}: {
  quad: Quad;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <g
      className={`campus-quad ${selected ? 'selected' : ''}`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      role="button"
      aria-label={`${quad.name}, ${quad.area} tiles`}
    >
      {quad.tiles.map((key) => {
        const [col, row] = key.split(',').map(Number) as [number, number];
        return (
          <polygon
            key={key}
            className="campus-quad-tile"
            points={polyPoints(boxFaces(col, row, 1, 1, 0, 0).top)}
          />
        );
      })}
    </g>
  );
}

// The names, drawn after everything that stands up: a quad is named for
// the walls around it, and those walls would otherwise cover its name.
function QuadNames({
  campus,
  selectedKey,
  onSelect,
  camera,
}: {
  campus: Campus;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  camera: Camera;
}) {
  void camera;
  return (
    <g className="campus-quad-names">
      {detectQuads(campus).map((q) => {
        const centre = project(q.centre.col, q.centre.row);
        return (
          <text
            key={q.key}
            className={`campus-quad-name ${q.key === selectedKey ? 'selected' : ''}`}
            x={centre.x.toFixed(1)}
            y={centre.y.toFixed(1)}
            fontSize={FONT}
            textAnchor="middle"
            dominantBaseline="central"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(q.key);
            }}
          >
            {q.name}
          </text>
        );
      })}
    </g>
  );
}

export const QuadNameLayer = memo(QuadNames);

function QuadLayer({
  campus,
  selectedKey,
  onSelect,
  camera,
}: {
  campus: Campus;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  camera: Camera;
}) {
  void camera; // the projection reads it; this redraws when it changes
  const quads = detectQuads(campus);
  if (quads.length === 0) return null;
  return (
    <g className="campus-quads">
      {quads.map((q) => (
        <QuadPatch
          key={q.key}
          quad={q}
          selected={q.key === selectedKey}
          onSelect={() => onSelect(q.key)}
        />
      ))}
    </g>
  );
}

export default memo(QuadLayer);
