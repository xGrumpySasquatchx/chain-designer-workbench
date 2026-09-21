import { useMemo, useState } from 'react';
import { Panel } from './Panel';
import { plateMatches } from '../model/queue';
import { wellsFilled } from '../model/plate';
import { useApp, useDispatch } from '../state/store';
import type { PlateQueueStatus, QueuedPlate } from '../model/types';

const STATUS_LABEL: Record<PlateQueueStatus, string> = {
  queued: 'Queued',
  active: 'Open',
  'in-progress': 'In progress',
  done: 'Done',
};

type Filter = 'all' | 'remaining' | 'done';

function rowTip(plate: QueuedPlate, filled: number, isOpen: boolean, isPrimary: boolean): string {
  const action = isPrimary
    ? 'Selected. Its chains are listed against the registry. Cmd-click to keep it while adding others, or click another row to replace it.'
    : isOpen
      ? `Selected alongside other work. Click one of its chains in the work list to put it on the bench.`
      : `Click to select ${plate.id} and list its chains. Cmd-click to add it beside the work already selected; shift-click to select a range.`;
  return `${plate.barcode} · ${plate.program} · ${plate.formatLabel}. ${filled} of ${plate.wellCount} wells filled. Due ${plate.due}. ${plate.note}. ${action}.`;
}

export function PlateQueue() {
  const state = useApp();
  const dispatch = useDispatch();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(() => {
    return state.plateQueue.filter((p) => {
      if (filter === 'done' && p.status !== 'done') return false;
      if (filter === 'remaining' && p.status === 'done') return false;
      return plateMatches(query, p);
    });
  }, [state.plateQueue, query, filter]);

  const remaining = state.plateQueue.filter((p) => p.status !== 'done').length;

  return (
    <Panel
      title="Work Queue"
      tip="Today’s work as a searchable list. Click a row to select that work and list its chains against the registry. Cmd-click to add or remove work in the view; shift-click to select a range."
      trailing={`${remaining} remaining`}
      defaultHeight={220}
    >
      <input
        className="search"
        placeholder="Search work, barcodes, programs…"
        data-tip="Filter the queue by plate id, barcode, program, operator, format or due time"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="seg full pq-filter" role="radiogroup" aria-label="Queue filter">
        {(
          [
            ['all', 'All'],
            ['remaining', 'Remaining'],
            ['done', 'Done'],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            className={filter === id ? 'active' : ''}
            data-tip={
              id === 'all'
                ? 'Show everything in today’s work queue'
                : id === 'remaining'
                  ? 'Hide work that is already signed off'
                  : 'Show only finished work'
            }
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="pq-list" role="list">
        {rows.length === 0 && <p className="hint">No work matches that search.</p>}
        {rows.map((plate) => {
          const filled = wellsFilled(plate.id === state.activePlateId ? state.plate : plate.wells);
          const isPrimary = plate.id === state.activePlateId;
          const isOpen = state.activePlateIds.includes(plate.id);
          return (
            <button
              key={plate.id}
              type="button"
              role="listitem"
              className={`pq-row${isOpen ? ' open' : ''}${isPrimary ? ' primary' : ''}`}
              data-tip={rowTip(plate, filled, isOpen, isPrimary)}
              onMouseDown={(e) => {
                if (e.shiftKey) e.preventDefault();
              }}
              onClick={(e) => {
                const mode = e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'single';
                dispatch({ type: 'open-queue-plate', plateId: plate.id, mode });
              }}
            >
              <span className={`pq-status ${plate.status}`}>{STATUS_LABEL[plate.status]}</span>
              <span className="pq-id">{plate.id}</span>
              <span className="pq-name">{plate.name}</span>
              <span className="pq-meta">
                {plate.program} · {filled}/{plate.wellCount} · due {plate.due}
              </span>
              <span className="pq-barcode">{plate.barcode}</span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
