import { useHotkeys } from './hotkeys.ts';
import SoundControls from './audio/SoundControls.tsx';
import { useEffect, useState } from 'react';
import { readHall } from './persistence.ts';
import {
  setSettings,
  TEXT_SCALES,
  useSettings,
  WINTER_LIGHTS_AFTER,
  type GameSettings,
} from './settings.ts';

// THE SETTINGS (Phase 34): sound, text size, colour vision and how often the
// game saves itself. Every choice applies at once and is kept in this
// browser.

function Choice<K extends keyof GameSettings>({
  field,
  value,
  label,
}: {
  field: K;
  value: GameSettings[K];
  label: string;
}) {
  const s = useSettings();
  const on = s[field] === value;
  return (
    <button
      type="button"
      className={`species-chip ${on ? 'active' : ''}`}
      aria-pressed={on}
      onClick={() => setSettings({ [field]: value } as Partial<GameSettings>)}
    >
      {label}
    </button>
  );
}

// A cosmetic unlock (Phase 49): lights on the lamp posts in winter, once
// enough colleges hang in the hall.
function WinterLights() {
  const [hung, setHung] = useState<number | null>(null);
  useEffect(() => {
    void readHall()
      .then((h) => setHung(h.length))
      .catch(() => setHung(0));
  }, []);
  const locked = (hung ?? 0) < WINTER_LIGHTS_AFTER;
  return (
    <fieldset className="settings-group">
      <legend>Winter lights</legend>
      <div className="settings-choices">
        {locked ? (
          <span className="settings-note">
            Unlocks when {WINTER_LIGHTS_AFTER} colleges hang in the hall of fame
            {hung !== null ? ` (${hung} so far)` : ''}.
          </span>
        ) : (
          <>
            <Choice field="winterLights" value={true} label="Lights on" />
            <Choice field="winterLights" value={false} label="Off" />
          </>
        )}
      </div>
      <p className="settings-note">
        Strings of lights on the lamp posts in winter. For looks only.
      </p>
    </fieldset>
  );
}

const SCALE_LABELS: Record<number, string> = { 1: 'Standard', 1.15: 'Larger', 1.3: 'Largest' };

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  useHotkeys((e) => {
    if (e.key === 'Escape') onClose();
  });
  return (
    <div className="letter-backdrop" role="dialog" aria-modal="true" aria-label="Settings">
      <article className="letter settings-panel">
        <header className="letter-head">
          <div className="letter-letterhead">Settings</div>
          <button
            type="button"
            className="toolbar-popup-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <SoundControls />
        <fieldset className="settings-group">
          <legend>Text size</legend>
          <div className="settings-choices">
            {TEXT_SCALES.map((v) => (
              <Choice key={v} field="textScale" value={v} label={SCALE_LABELS[v]!} />
            ))}
          </div>
        </fieldset>
        <fieldset className="settings-group">
          <legend>Colour</legend>
          <div className="settings-choices">
            <Choice field="vision" value="standard" label="Standard" />
            <Choice field="vision" value="safe" label="Colour-blind safe" />
          </div>
          <p className="settings-note">
            Good and bad news in blue and orange rather than green and red. Your school's own
            colours are yours to choose when you found it.
          </p>
        </fieldset>
        <WinterLights />
        <fieldset className="settings-group">
          <legend>Autosave</legend>
          <div className="settings-choices">
            <Choice field="autosave" value="year" label="Every year" />
            <Choice field="autosave" value="term" label="Every term" />
          </div>
          <p className="settings-note">
            The game also saves when you found the college, at every decision that matters, and when
            you leave the tab.
          </p>
        </fieldset>
      </article>
    </div>
  );
}
