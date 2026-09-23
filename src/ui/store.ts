import {
  advanceWeekProgress,
  canApply,
  clockAdvances,
  clockHeld,
  clockRuns,
  dispatch as dispatchAction,
  isYearTurn,
  MAX_SAMPLE_MS,
  msPerWeek,
  newRun,
  speedAllowed,
  tickRun,
  type Action,
  type Run,
  type Speed,
} from '../sim/index.ts';

// The external store the UI subscribes to (useSyncExternalStore in useGame.ts)
// and the real-time driver that samples the clock. The sim never sees any of
// this: it receives ticks and actions, and hands back states.

export interface Snapshot {
  run: Run | null; // null while booting
  speed: Speed;
  weekProgress: number; // 0..1 through the current week
  lastAutosave: string | null; // ISO timestamp, informational
  // What the clock will be doing once the thing holding it lets go, or null
  // when nothing holds it. While a beat waits, `speed` is Paused, because
  // that is the truth about the campus; this is the promise about after.
  queuedSpeed: Speed | null;
}

type Listener = () => void;

// How often the accumulator samples the real clock. Only the granularity a
// week boundary can land on; 50 ms is 5% of a week at 8×.
const SAMPLE_MS = 50;

export class GameStore {
  private snap: Snapshot = {
    run: null,
    speed: 'paused',
    weekProgress: 0,
    lastAutosave: null,
    queuedSpeed: null,
  };
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSample = 0;

  // Set by the app: called after any tick that crosses a year boundary, so
  // the autosave policy (DD §15: every year-turn) lives with the storage.
  onYearTurn: ((run: Run) => void) | null = null;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Snapshot => this.snap;

  private set(patch: Partial<Snapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }

  newGame(seed: number): void {
    this.set({ run: newRun(seed), speed: 'paused', weekProgress: 0, queuedSpeed: null });
  }

  loadRun(run: Run, savedAt: string | null = null): void {
    this.set({
      run,
      speed: 'paused',
      weekProgress: 0,
      lastAutosave: savedAt,
      queuedSpeed: null,
    });
  }

  // Applies an action if the sim accepts it. Returns whether it did, so a
  // caller can follow a founding action with a save.
  dispatch(action: Action): boolean {
    const { run } = this.snap;
    if (!run || !canApply(run.state, action).ok) return false;
    const next = dispatchAction(run, action);
    this.set({ run: next, ...this.clockPatch(next) });
    return true;
  }

  // The clock runs only once Founders Hall stands (DD §2.4). Speed changes
  // before that are refused, and the sampler below stays idle.
  setSpeed(speed: Speed): void {
    const { run } = this.snap;
    if (!run || !clockRuns(run.state) || !speedAllowed(run.state, speed)) return;
    // DD §3.3 keeps the speed control live while a beat waits, but the week
    // is not moving and no pill may claim it is: a press during a hold sets
    // what the clock resumes at, and the control says so rather than lying
    // about now.
    // Asked of the sim, not of the snapshot: a save loaded mid-hold has not
    // been through a tick yet, so nothing has queued (Phase 21K).
    if (clockHeld(run.state)) this.set({ speed: 'paused', queuedSpeed: speed });
    else this.set({ speed });
  }

  // Advance whole weeks immediately, regardless of speed (debug and tests).
  stepWeeks(weeks: number): void {
    const { run } = this.snap;
    if (!run || weeks <= 0 || !clockRuns(run.state)) return;
    this.applyTicks(run, weeks);
  }

  markAutosaved(at: string): void {
    this.set({ lastAutosave: at });
  }

  private applyTicks(run: Run, ticks: number): void {
    let next = run;
    let yearTurned = false;
    for (let i = 0; i < ticks; i++) {
      const after = tickRun(next);
      // A held clock (a beat awaiting the player) refuses the week: stop
      // here rather than spin on it.
      if (after.state === next.state) break;
      if (isYearTurn(next.state.clock, after.state.clock)) yearTurned = true;
      next = after;
    }
    this.set({ run: next, ...this.clockPatch(next) });
    if (yearTurned) this.onYearTurn?.(next);
  }

  // THE CLOCK CONTROL ACROSS A HOLD (DD §3.3). A beat, a letter or a seismic
  // event stops the week in the sim, and the speed control is where the
  // player reads the clock's state: it goes to Paused for as long as the
  // hold lasts, carrying what it was doing as the speed to come back to.
  // Four beats a year for fifty years is not a restart to perform two
  // hundred times, so resolving the beat puts the speed back. A seat lost
  // while the beat waited can make that speed unearned (DD §3.2); there the
  // gate wins and the clock stays where the hold left it.
  private clockPatch(run: Run): Partial<Snapshot> {
    const { speed, queuedSpeed } = this.snap;
    if (clockRuns(run.state) && clockHeld(run.state)) {
      return queuedSpeed === null ? { speed: 'paused', queuedSpeed: speed } : { speed: 'paused' };
    }
    if (queuedSpeed === null) return {};
    return {
      speed: speedAllowed(run.state, queuedSpeed) ? queuedSpeed : speed,
      queuedSpeed: null,
    };
  }

  start(): void {
    if (this.timer) return;
    this.lastSample = performance.now();
    this.timer = setInterval(() => this.sample(), SAMPLE_MS);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private sample(): void {
    const now = performance.now();
    const delta = Math.min(now - this.lastSample, MAX_SAMPLE_MS);
    this.lastSample = now;
    const { run, speed, weekProgress } = this.snap;
    if (!run || !clockAdvances(run.state)) return;
    const { progress, ticks } = advanceWeekProgress(weekProgress, delta, msPerWeek(speed));
    if (ticks === 0 && progress === weekProgress) return;
    if (ticks > 0) this.applyTicks(run, ticks);
    this.set({ weekProgress: progress });
  }
}

export const store = new GameStore();
