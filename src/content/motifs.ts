import { MOTIFS, type Motif } from '../sim/identity.ts';
import raw from './motifs.json' with { type: 'json' };
import { arr, ContentError, obj, oneOf, str, uniqueBy, validate } from './schema.ts';

// What the founding screen calls each motif, and the order it offers them
// in. The label and the palette are two halves of one fact: a motif the
// renderer knows (sim/identity.ts's MOTIFS) must be offered here, and vice
// versa, or the file fails to load.

export interface MotifChoice {
  id: Motif;
  label: string;
  blurb: string;
}

const schema = obj({ motifs: arr(obj({ id: oneOf(MOTIFS), label: str, blurb: str })) });

function load(): MotifChoice[] {
  const file = validate(schema, raw, 'content/motifs.json');
  const list = uniqueBy(file.motifs, (m) => m.id, 'content/motifs.json.motifs');
  for (const id of MOTIFS) {
    if (!list.some((m) => m.id === id)) {
      throw new ContentError('content/motifs.json.motifs', `motif "${id}" is not offered`);
    }
  }
  return list;
}

export const MOTIF_CHOICES: readonly MotifChoice[] = load();

export const DEFAULT_MOTIF: Motif = 'georgian';
