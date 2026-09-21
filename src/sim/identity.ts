// The school's identity (DD §13.1): chosen once at founding, worn everywhere,
// changed never. The five motifs are v1's vernaculars; the colour pair is
// what the whole chrome is themed from (see ui/theme.ts).

export const MOTIFS = ['georgian', 'gothic', 'classical', 'mission', 'modern'] as const;
export type Motif = (typeof MOTIFS)[number];

export interface SchoolColors {
  primary: string;
  secondary: string;
}

export interface Identity {
  name: string; // the typed half: "Blackmoor"
  motif: Motif;
  paletteId: string; // which authored pair (content/palettes.json)
  colors: SchoolColors; // the pair itself, so a save is self-describing
}

// Every school opens as a College. The word is fixed rather than typed: it
// is the thing a later phase may offer to change.
export const INSTITUTION_SUFFIX = 'College';

export function institutionName(identity: Identity): string {
  return `${identity.name} ${INSTITUTION_SUFFIX}`;
}

export const MAX_NAME_LENGTH = 60;

export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH;
}
