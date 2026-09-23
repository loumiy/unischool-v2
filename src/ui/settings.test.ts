import { describe, expect, it } from 'vitest';
import { defaultResolution } from '../sim/beats.ts';
import { opened } from '../sim/colleges.ts';
import { tickRunWeeks } from '../sim/run.ts';
import { DEFAULT_SETTINGS, normaliseSettings, setSettings } from './settings.ts';

// THE PLAYER'S SETTINGS (Phase 34): whatever was stored reads back as
// settings the game can use.

describe('the settings', () => {
  it('defaults to standard text, standard colour and a yearly autosave', () => {
    expect(normaliseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({
      textScale: 1,
      vision: 'standard',
      autosave: 'year',
      winterLights: false,
    });
  });

  it('keeps what it knows and drops what it does not', () => {
    expect(normaliseSettings({ textScale: 1.3, vision: 'safe', autosave: 'term', x: 1 })).toEqual({
      textScale: 1.3,
      vision: 'safe',
      autosave: 'term',
      winterLights: false,
    });
    expect(normaliseSettings({ textScale: 7, vision: 'purple', autosave: 'hourly' })).toEqual(
      DEFAULT_SETTINGS,
    );
  });
});

describe('the cosmetic unlocks (Phase 49)', () => {
  it('keeps the winter lights once chosen', () => {
    expect(normaliseSettings({ winterLights: true }).winterLights).toBe(true);
    expect(normaliseSettings({ winterLights: 'yes' }).winterLights).toBe(false);
  });

  it('changes nothing the sim reads', () => {
    // The sim never imports the settings (architecture.test.ts); a run
    // stepped with the lights on and off is the same run.
    const a = tickRunWeeks(opened(4), 40, defaultResolution).state;
    setSettings({ winterLights: true });
    const b = tickRunWeeks(opened(4), 40, defaultResolution).state;
    setSettings({ winterLights: false });
    expect(b).toEqual(a);
  });
});
