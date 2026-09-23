import { useSyncExternalStore } from 'react';

// THE PLAYER'S SETTINGS (DD §13, Phase 34): text size, a colour-vision-safe
// set of signal colours, and how often the game saves itself. Sound has its
// own store (audio/settings.ts). Per-browser conveniences, so localStorage,
// read and written defensively: a browser that refuses storage plays at
// the defaults.

export const TEXT_SCALES = [1, 1.15, 1.3] as const;
export type TextScale = (typeof TEXT_SCALES)[number];
export type ColourVision = 'standard' | 'safe';
export type AutosaveCadence = 'year' | 'term';

export interface GameSettings {
  textScale: TextScale;
  vision: ColourVision;
  autosave: AutosaveCadence;
  // A cosmetic unlock (Phase 49, DD §12.3): winter lights on the lamp posts,
  // once enough colleges hang in the hall. Changes nothing the sim reads.
  winterLights: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  textScale: 1,
  vision: 'standard',
  autosave: 'year',
  winterLights: false,
};

// How many finished colleges unlock the winter lights.
export const WINTER_LIGHTS_AFTER = 2;

const KEY = 'unischool.settings.v1';

export function normaliseSettings(raw: unknown): GameSettings {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    textScale: TEXT_SCALES.includes(o.textScale as TextScale)
      ? (o.textScale as TextScale)
      : DEFAULT_SETTINGS.textScale,
    vision: o.vision === 'safe' ? 'safe' : 'standard',
    autosave: o.autosave === 'term' ? 'term' : 'year',
    winterLights: o.winterLights === true,
  };
}

function load(): GameSettings {
  try {
    const text = globalThis.localStorage?.getItem(KEY);
    return normaliseSettings(text ? JSON.parse(text) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let current: GameSettings = load();
const listeners = new Set<() => void>();

export function getSettings(): GameSettings {
  return current;
}

export function setSettings(patch: Partial<GameSettings>): void {
  current = normaliseSettings({ ...current, ...patch });
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(current));
  } catch {
    // The settings last the session.
  }
  applySettings(current);
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSettings(): GameSettings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}

// Onto the page: the text scale multiplies every --text-* token
// (tokens.css), and the colour-vision set swaps the signal colours.
export function applySettings(s: GameSettings = current): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--text-scale', String(s.textScale));
  root.dataset.vision = s.vision;
}
