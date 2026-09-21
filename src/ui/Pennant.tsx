import { institutionName, type Identity } from '../sim/index.ts';

// THE PENNANT: the identity chip. The school's name, hung from the top-left
// corner of the map in the school's own colours — the one piece of chrome
// that is identity rather than instrument. Inert: clicks fall through.
export default function Pennant({ identity }: { identity: Identity }) {
  return (
    <div className="pennant">
      <div className="pennant-body">
        <span className="pennant-name">{institutionName(identity)}</span>
      </div>
      <div className="pennant-tail" aria-hidden="true" />
    </div>
  );
}
