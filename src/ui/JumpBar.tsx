// A ROUTE FROM THE TOP (Phase 21G). The Students screen kept its campaigns
// 5.3 screens down, behind the classes table, the named students, the
// layout panel and the alumni ledger, and the Faculty screen kept the org
// chart — the machinery that buys the clock speed — 2.9 screens down behind
// the roster. A longer scroll is not a route. This is: a row of the
// screen's own sections at its head, each one a jump.

export interface Jump {
  label: string;
  id: string; // the element to bring into view
}

export default function JumpBar({ jumps, label }: { jumps: Jump[]; label: string }) {
  return (
    <nav className="jump-bar" aria-label={label}>
      {jumps.map((j) => (
        <button
          key={j.id}
          type="button"
          className="jump-bar-link"
          data-target={j.id}
          onClick={() =>
            document.getElementById(j.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          {j.label}
        </button>
      ))}
    </nav>
  );
}
