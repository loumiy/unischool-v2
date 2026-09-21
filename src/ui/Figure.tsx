import type { ReactNode } from 'react';

// THE ONE-TOOLTIP RULE (DD §5.3, §13.2): any number explained in one
// sentence on hover. A Figure is a label, a value, and that sentence,
// shown on hover or focus; every number on a management screen is one.

export default function Figure({
  label,
  value,
  hint,
  tone,
  size = 'md',
  note,
}: {
  label: string;
  value: ReactNode;
  hint: string;
  tone?: 'good' | 'bad' | 'muted';
  size?: 'md' | 'lg';
  note?: ReactNode;
}) {
  return (
    <div className={`figure figure-${size} ${tone ?? ''}`} tabIndex={0}>
      <span className="figure-label">{label}</span>
      <span className="figure-value">{value}</span>
      {note && <span className="figure-note">{note}</span>}
      <span className="figure-hint" role="tooltip">
        {hint}
      </span>
    </div>
  );
}
