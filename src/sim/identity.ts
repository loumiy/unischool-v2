import { charterById, type CharterId } from '../content/charters.ts';

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
  // What the founders meant it to be (Phase 43); null for a college founded
  // before charters, or founded without one.
  charter: CharterId | null;
}

// Every school opens as a College. The word is fixed rather than typed: it
// is the thing a later phase may offer to change.
export const INSTITUTION_SUFFIX = 'College';

// ...unless its charter names it otherwise (Phase 43): a research
// university is founded as one, and a polytechnic as one. The word is still
// fixed at founding and carved into the facade.
export function institutionSuffix(charter: CharterId | null | undefined): string {
  return charter ? charterById(charter).suffix : INSTITUTION_SUFFIX;
}

export function institutionName(identity: Identity): string {
  return `${identity.name} ${institutionSuffix(identity.charter)}`;
}

export const MAX_NAME_LENGTH = 60;

export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH;
}
