// The map's tools, besides picking up a building: the four paint tools the
// sim knows (paths and trees), and demolition, which is a click on a
// building. Exactly one of a picked-up building and a tool is ever live.
export type CampusTool = 'path' | 'erasePath' | 'plant' | 'fell' | 'demolish';

export const PAINT_TOOL_OF: Record<
  Exclude<CampusTool, 'demolish'>,
  'path' | 'erasePath' | 'plant' | 'fell'
> = {
  path: 'path',
  erasePath: 'erasePath',
  plant: 'plant',
  fell: 'fell',
};

// What the secondary mouse button paints with, given the armed tool: the
// opposite, so fixing a stroke never means going back to the menu.
export function otherTool(tool: CampusTool): CampusTool {
  switch (tool) {
    case 'path':
      return 'erasePath';
    case 'erasePath':
      return 'path';
    case 'plant':
      return 'fell';
    case 'fell':
      return 'plant';
    default:
      return tool;
  }
}
