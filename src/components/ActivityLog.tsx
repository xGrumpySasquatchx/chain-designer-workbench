import { Panel } from './Panel';
import { useApp } from '../state/store';

/** Every minted ID in session order — the audit trail behind the loop. */
export function ActivityLog() {
  const state = useApp();
  return (
    <Panel
      title="Activity"
      tip="Session audit trail: every part placed, construct assembled and ID minted, newest first"
      trailing={`${state.log.length} events`}
    >
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
    </Panel>
  );
}
