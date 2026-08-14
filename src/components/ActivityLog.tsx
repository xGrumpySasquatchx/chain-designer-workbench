import { useApp } from '../state/store';

/** Every minted ID in session order — the audit trail behind the loop. */
export function ActivityLog() {
  const state = useApp();
  return (
    <div className="panel">
      <p className="panel-title">
        Activity
        <span className="count">{state.log.length} events</span>
      </p>
      {state.log.length === 0 ? (
        <p className="hint" style={{ marginTop: 0 }}>
          Placing parts, assembling constructs and registering chains all show up here with the IDs
          they mint.
        </p>
      ) : (
        <div className="log-list">
          {state.log.map((entry) => (
            <div className="log-item" key={entry.id}>
              <span className="log-kind">{entry.kind}</span>
              <span>{entry.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
