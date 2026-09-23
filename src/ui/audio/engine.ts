import {
  AMBIENCE,
  chordNotes,
  midiToHz,
  sfxById,
  themeById,
  type ThemeDef,
  type ThemeId,
  type VoiceDef,
} from '../../content/audio.ts';
import type { AmbienceLevels } from './director.ts';
import {
  DEFAULT_AUDIO,
  loadAudioSettings,
  saveAudioSettings,
  type AudioSettings,
} from './settings.ts';

// THE SYNTHESISER (DD §13.4). One AudioContext, made on the player's first
// gesture (browsers refuse sound before one), four buses — master, and
// under it music, ambience and effects — and everything synthesised: the
// themes are scheduled a fraction of a second ahead from content/audio.json,
// the ambience is looped noise through filters whose gains follow the
// campus, and an effect is a few enveloped oscillators. Where there is no
// Web Audio (tests, old browsers) every call is a no-op.

type Listener = () => void;

const LOOKAHEAD_S = 0.25;
const SCHEDULE_MS = 60;
const FADE_S = 0.4;

type Ctx = AudioContext;

export class AudioEngine {
  private ctx: Ctx | null = null;
  private buses: { master: GainNode; music: GainNode; ambience: GainNode; sfx: GainNode } | null =
    null;
  private noise: AudioBuffer | null = null;
  private settings: AudioSettings = { ...DEFAULT_AUDIO };
  private listeners = new Set<Listener>();

  // Music
  private theme: ThemeId = 'founding';
  private playing: ThemeDef | null = null;
  private step = 0; // eighths since the theme began
  private nextAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  // Ambience
  private crowd: GainNode | null = null;
  private wind: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private birdsPerSecond = 0;
  private roaring = false;
  private ambience: AmbienceLevels | null = null;
  private lastSfx = new Map<string, number>();

  constructor() {
    this.settings = loadAudioSettings();
  }

  get available(): boolean {
    return typeof globalThis.AudioContext === 'function';
  }

  get started(): boolean {
    return this.ctx !== null;
  }

  getSettings = (): AudioSettings => this.settings;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  setSettings(patch: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...patch };
    saveAudioSettings(this.settings);
    this.applyLevels();
    for (const l of this.listeners) l();
  }

  toggleMute(): void {
    this.setSettings({ muted: !this.settings.muted });
  }

  // The first gesture: make the context and start the loops. Safe to call
  // on every gesture; only the first does anything.
  unlock(): void {
    if (this.ctx || !this.available) {
      if (this.ctx?.state === 'suspended' && !document.hidden) void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.connect(ctx.destination);
    const bus = () => {
      const g = ctx.createGain();
      g.connect(master);
      return g;
    };
    this.buses = { master, music: bus(), ambience: bus(), sfx: bus() };
    this.noise = makeNoise(ctx);
    this.applyLevels();
    this.startAmbience();
    this.nextAt = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), SCHEDULE_MS);
    document.addEventListener('visibilitychange', this.onVisibility);
    for (const l of this.listeners) l();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    void this.ctx?.close();
    this.ctx = null;
    this.buses = null;
  }

  private onVisibility = () => {
    if (!this.ctx) return;
    if (document.hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  };

  private applyLevels(): void {
    if (!this.ctx || !this.buses) return;
    const s = this.settings;
    const now = this.ctx.currentTime;
    const set = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, now, 0.08);
    set(this.buses.master, s.muted ? 0 : s.master);
    set(this.buses.music, s.music);
    set(this.buses.ambience, s.ambience);
    set(this.buses.sfx, s.sfx);
  }

  // ---------- music ----------

  setTheme(id: ThemeId): void {
    this.theme = id;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.buses) return;
    while (this.nextAt < ctx.currentTime + LOOKAHEAD_S) {
      // Themes change on a chord boundary, so a switch is a new phrase
      // rather than a cut: the old pad rings out under the new one.
      if (this.step % 16 === 0 && this.playing?.id !== this.theme) {
        this.playing = themeById(this.theme);
        this.step = 0;
      }
      const theme = this.playing ?? themeById(this.theme);
      this.playing = theme;
      const eighth = 60 / theme.bpm / 2;
      this.playStep(theme, this.step, this.nextAt, eighth);
      this.step += 1;
      this.nextAt += eighth;
      this.maybeBird(this.nextAt, eighth);
    }
  }

  private playStep(theme: ThemeDef, step: number, at: number, eighth: number): void {
    const bar = Math.floor(step / 8);
    const chord = chordNotes(
      theme,
      theme.progression[Math.floor(bar / 2) % theme.progression.length]!,
    );
    if (step % 16 === 0) {
      const length = eighth * 16;
      for (const note of chord.slice(0, 3)) this.pad(theme, midiToHz(note), at, length);
      if (theme.bass) this.pad(theme, midiToHz(chord[0]! - 12), at, length, 1.3);
    }
    const tone = theme.pattern[step % 8]!;
    if (tone >= 0) {
      const note = chord[tone]! + 12 * theme.arp.octave;
      this.pluck(theme.arp.wave, midiToHz(note), at, theme.arp.decay, theme.arp.gain);
    }
  }

  private pad(theme: ThemeDef, hz: number, at: number, length: number, weight = 1): void {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = theme.pad.cutoff;
    const env = ctx.createGain();
    const peak = theme.pad.gain * weight;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + theme.pad.attack);
    env.gain.setValueAtTime(peak, at + length - FADE_S);
    env.gain.linearRampToValueAtTime(0, at + length + theme.pad.attack);
    filter.connect(env).connect(this.buses!.music);
    for (const detune of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = theme.pad.wave;
      osc.frequency.value = hz;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(at);
      osc.stop(at + length + theme.pad.attack + 0.05);
    }
  }

  private pluck(wave: OscillatorType, hz: number, at: number, decay: number, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = hz;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(env).connect(this.buses!.music);
    osc.start(at);
    osc.stop(at + decay + 0.05);
  }

  // ---------- ambience ----------

  private startAmbience(): void {
    const ctx = this.ctx!;
    const loop = () => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.start();
      return src;
    };
    // The crowd: noise in the band a room of voices fills, with a slow
    // swell so it breathes rather than hisses.
    const crowdBand = ctx.createBiquadFilter();
    crowdBand.type = 'bandpass';
    crowdBand.frequency.value = 520;
    crowdBand.Q.value = 0.8;
    this.crowd = ctx.createGain();
    this.crowd.gain.value = 0;
    loop().connect(crowdBand).connect(this.crowd).connect(this.buses!.ambience);
    // The wind: low noise under a filter an LFO sweeps.
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 400;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const depth = ctx.createGain();
    depth.gain.value = 220;
    lfo.connect(depth).connect(this.windFilter.frequency);
    lfo.start();
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    loop().connect(this.windFilter).connect(this.wind).connect(this.buses!.ambience);
    // Whatever the campus sounded like before the first gesture, it
    // sounds like now.
    if (this.ambience) this.setAmbience(this.ambience);
  }

  setAmbience(a: AmbienceLevels): void {
    this.ambience = a;
    this.birdsPerSecond = a.birds;
    if (!this.ctx || !this.crowd || !this.wind) return;
    const now = this.ctx.currentTime;
    this.crowd.gain.setTargetAtTime(a.crowd * AMBIENCE.crowd.gain, now, 1.5);
    this.wind.gain.setTargetAtTime(a.wind * AMBIENCE.wind.gain, now, 2);
    if (a.roar && !this.roaring) this.roar();
    this.roaring = a.roar;
  }

  private maybeBird(at: number, span: number): void {
    if (Math.random() > this.birdsPerSecond * span) return;
    const ctx = this.ctx!;
    const start = 2400 + Math.random() * 1800;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
      const t = at + i * 0.11;
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(start, t);
      osc.frequency.exponentialRampToValueAtTime(start * 1.35, t + 0.06);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(AMBIENCE.birds.gain, t + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      osc.connect(env).connect(this.buses!.ambience);
      osc.start(t);
      osc.stop(t + 0.1);
    }
  }

  // A stadium somewhere past the trees: a swell of broad noise.
  private roar(): void {
    this.voice(
      { wave: 'noise', freq: 900, attack: 1.2, decay: 3, gain: AMBIENCE.roar.gain },
      this.buses!.ambience,
    );
  }

  // ---------- effects ----------

  play(id: string): void {
    if (!this.ctx || !this.buses || this.settings.muted) return;
    const def = sfxById(id);
    if (!def) return;
    // The same effect twice inside a tenth of a second is one effect.
    const now = this.ctx.currentTime;
    if (now - (this.lastSfx.get(id) ?? -1) < 0.1) return;
    this.lastSfx.set(id, now);
    for (const v of def.voices) this.voice(v, this.buses.sfx);
  }

  private voice(v: VoiceDef, out: AudioNode): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime + 0.01 + (v.delay ?? 0);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(v.gain, at + v.attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + v.attack + v.decay);
    env.connect(out);
    const end = at + v.attack + v.decay + 0.05;
    if (v.wave === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = v.freq;
      band.Q.value = 0.9;
      src.connect(band).connect(env);
      src.start(at, Math.random());
      src.stop(end);
      return;
    }
    const osc = ctx.createOscillator();
    osc.type = v.wave;
    osc.frequency.setValueAtTime(v.freq, at);
    if (v.to) osc.frequency.exponentialRampToValueAtTime(v.to, at + v.attack + v.decay);
    osc.connect(env);
    osc.start(at);
    osc.stop(end);
  }
}

// Two seconds of white noise, shared by every loop and burst.
function makeNoise(ctx: Ctx): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export const audio = new AudioEngine();

// The dev server's handle on the engine, for listening in from a console.
if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__audio = audio;
