import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normaliseSettings } from './settings.ts';

// THE PLAYER'S SETTINGS (Phase 34): whatever was stored reads back as
// settings the game can use.

describe('the settings', () => {
  it('defaults to standard text, standard colour and a yearly autosave', () => {
    expect(normaliseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({ textScale: 1, vision: 'standard', autosave: 'year' });
  });

  it('keeps what it knows and drops what it does not', () => {
    expect(normaliseSettings({ textScale: 1.3, vision: 'safe', autosave: 'term', x: 1 })).toEqual({
      textScale: 1.3,
      vision: 'safe',
      autosave: 'term',
    });
    expect(normaliseSettings({ textScale: 7, vision: 'purple', autosave: 'hourly' })).toEqual(
      DEFAULT_SETTINGS,
    );
  });
});
