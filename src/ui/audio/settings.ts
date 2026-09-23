// The player's sound levels (DD §13.4, "audio settings"): a per-browser
// convenience, so localStorage, and every read and write survives the
// storage being absent or refusing — the game plays at the defaults then.

export interface AudioSettings {
  muted: boolean;
  master: number; // 0–1
  music: number;
  ambience: number;
  sfx: number;
}

export const DEFAULT_AUDIO: AudioSettings = {
  muted: false,
  master: 0.7,
  music: 0.5,
  ambience: 0.5,
  sfx: 0.7,
};

const KEY = 'unischool.audio.v1';
const LEVELS = ['master', 'music', 'ambience', 'sfx'] as const;

const unit = (n: unknown, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;

// Whatever was stored, made into settings: unknown fields dropped, levels
// clamped, anything unreadable replaced by its default.
export function normaliseAudio(raw: unknown): AudioSettings {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const out: AudioSettings = { ...DEFAULT_AUDIO, muted: o.muted === true };
  for (const k of LEVELS) out[k] = unit(o[k], DEFAULT_AUDIO[k]);
  return out;
}

export function loadAudioSettings(): AudioSettings {
  try {
    const text = globalThis.localStorage?.getItem(KEY);
    return normaliseAudio(text ? JSON.parse(text) : null);
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}

export function saveAudioSettings(s: AudioSettings): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private windows and blocked storage: the levels last the session.
  }
}
