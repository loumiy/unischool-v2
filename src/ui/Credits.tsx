import { useHotkeys } from './hotkeys.ts';

// THE CREDITS (Phase 34).

export default function Credits({ onClose }: { onClose: () => void }) {
  useHotkeys((e) => {
    if (e.key === 'Escape') onClose();
  });
  return (
    <div className="letter-backdrop" role="dialog" aria-modal="true" aria-label="Credits">
      <article className="letter credits">
        <header className="letter-head">
          <div className="letter-letterhead">UniSchool</div>
          <button
            type="button"
            className="toolbar-popup-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <p className="letter-para credits-lede">One evening. Fifty years. One patch of land.</p>
        <dl className="credits-list">
          <dt>Design and direction</dt>
          <dd>The UniSchool author, from the design document in this repository</dd>
          <dt>Built with</dt>
          <dd>Claude Code, phase by phase against that document</dd>
          <dt>Type</dt>
          <dd>Bricolage Grotesque, Archivo and Azeret Mono, under the SIL Open Font License</dd>
          <dt>Made with</dt>
          <dd>React, TypeScript, Vite and the Web Audio API; every sound is synthesised</dd>
          <dt>With thanks to</dt>
          <dd>Every college that ever sent a letter about the car park</dd>
        </dl>
        <p className="settings-note">
          Your runs, your settings and your hall of fame live in this browser and nowhere else.
        </p>
      </article>
    </div>
  );
}
