import type { ReactNode } from 'react';

// The compact card a toolbar button pops open above the band. No backdrop:
// the map stays visible and clickable around it, which is the point of
// choosing a building while still seeing where it will go. Escape is App's.
export default function ToolbarPopup({
  title,
  headExtra,
  onClose,
  className,
  children,
}: {
  title: string;
  headExtra?: ReactNode;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`toolbar-popup ${className ?? ''}`} role="dialog" aria-label={title}>
      <div className="toolbar-popup-head">
        <span className="panel-head-title">
          <h2>{title}</h2>
          {headExtra}
        </span>
        <button
          type="button"
          className="toolbar-popup-close"
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          ✕
        </button>
      </div>
      <div className="toolbar-popup-body">{children}</div>
    </div>
  );
}
