import { useMemo, useState } from 'react';
import { Panel } from './Panel';
import { PaletteSelect } from './PaletteSelect';
import { locationLine, stockLine } from '../model/inventory';
import { componentColor, uniqueChainIds } from '../model/plate';
import {
  matchLengthBp,
  plateWorkItems,
  workSummary,
  type WorkItem,
  type WorkStatus,
} from '../model/worksearch';
import { useApp, useDispatch } from '../state/store';
import type { PlateWell, QueuedPlate } from '../model/types';

const STATUS_LABEL: Record<WorkStatus, string> = {
  registered: 'Registered',
  assembled: 'Assembled',
  new: 'New',
};

type Filter = 'all' | 'registered' | 'new';

function basisLine(item: WorkItem): string {
  switch (item.match.basis) {
    case 'chain':
      return 'registered from this bench chain';
    case 'composition':
      return 'matched on every component';
    case 'v-region':
      return 'matched on its variable region';
    default:
      return 'no match in the registry';
  }
}

function itemTip(item: WorkItem, plate: QueuedPlate | undefined, sizeBp: number): string {
  const where = `${item.wells.length} ${item.wells.length === 1 ? 'well' : 'wells'} on ${
    plate ? `${plate.id} (${plate.barcode})` : item.plateId
  }: ${item.wells.slice(0, 12).join(', ')}${item.wells.length > 12 ? '…' : ''}`;
  const searched = `Searched the registry for ${item.match.query} — ${basisLine(item)}.`;
  const found =
    item.match.status === 'registered'
      ? `${item.match.regId} maps to ${item.match.constructId} (${item.match.insertId} in ${
          item.match.vectorId
        }${sizeBp ? `, ${sizeBp.toLocaleString()} bp` : ''}). ${stockLine(
          item.match.inventory,
        )}, at ${locationLine(item.match.inventory)}.`
      : item.match.status === 'assembled'
        ? `${item.match.constructId} exists but was never checked into inventory, so there is nothing on a shelf yet.`
        : 'Nothing in the registry matches, so this chain has to be built and registered.';
  return `${item.name} · ${item.chainId}. ${where}. ${searched} ${found} Click to bring its molecule to the bench; cmd-click to add this entity to the bench, shift-click for a range.`;
}

function matches(query: string, item: WorkItem): boolean {
  if (!query.trim()) return true;
  return [
    item.name,
    item.chainId,
    item.target ?? '',
    item.kind,
    item.match.regId ?? '',
    item.match.constructId ?? '',
    item.match.insertId ?? '',
    item.match.vectorId ?? '',
    item.match.inventory?.location ?? '',
    STATUS_LABEL[item.match.status],
  ]
    .join(' ')
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}

function wellsForPlate(plate: QueuedPlate, livePlateId: string, liveWells: PlateWell[]): PlateWell[] {
  return plate.id === livePlateId ? liveWells : plate.wells;
}

/**
 * The work that was selected in the queue, chain by chain, after every one of
 * them has been searched against the registry. The question this answers is the
 * one that comes before any cloning: is this something we already have?
 *
 * Picking rows here decides what the bench works on: a plain click opens the
 * well the entity sits in, so its whole molecule comes across, and cmd- or
 * shift-click gathers entities from anywhere in the job onto the bench.
 */
export function WorkSearch() {
  const state = useApp();
  const dispatch = useDispatch();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const plates = state.activePlateIds
    .map((id) => state.plateQueue.find((p) => p.id === id))
    .filter((p): p is QueuedPlate => !!p);

  const items = useMemo(
    () =>
      plates.flatMap((plate) =>
        plateWorkItems(
          plate.id,
          wellsForPlate(plate, state.activePlateId, state.plate),
          state.chains,
          state.registry,
        ),
      ),
    [plates, state.activePlateId, state.plate, state.chains, state.registry],
  );

  const summary = workSummary(items);
  const shown = items.filter((item) => {
    if (filter === 'registered' && item.match.status !== 'registered') return false;
    if (filter === 'new' && item.match.status === 'registered') return false;
    return matches(query, item);
  });

  const order = shown.map((item) => item.chainId);
  const onBench = state.workSelection.filter((id) => order.includes(id)).length;
  const many = plates.length > 1;
  const title = many ? `Selected work · ${plates.length} jobs` : (plates[0]?.name ?? 'Selected work');

  return (
    <Panel
      title={title}
      tip="Every chain in the selected work, each one searched against the registry first: whether it already exists, the construct it maps to if it does, and what is left of it in the freezer. Click an entity to bring its molecule to the bench; cmd-click or shift-click to gather entities across wells onto the bench."
      trailing={
        <span className="wl-trailing">
          <span
            data-tip={`${summary.total} chains searched · ${summary.registered} already registered · ${summary.assembled} assembled but not in inventory · ${summary.fresh} to build. ${onBench} of them are on the bench.`}
          >
            {summary.registered}/{summary.total} registered · {onBench} on the bench
          </span>
          <PaletteSelect
            align="end"
            value={state.wellPaletteId}
            onChange={(paletteId) => dispatch({ type: 'set-well-palette', paletteId })}
          />
        </span>
      }
      defaultHeight={464}
    >
      <input
        className="search"
        placeholder="Search chains, REG, CC, targets, freezer…"
        data-tip="Filter this work list by chain name, identifier, target, status or freezer location"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="seg full pq-filter" role="radiogroup" aria-label="Work list filter">
        {(
          [
            ['all', `All ${summary.total}`],
            ['registered', `Registered ${summary.registered}`],
            ['new', `To build ${summary.assembled + summary.fresh}`],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            className={filter === id ? 'active' : ''}
            data-tip={
              id === 'all'
                ? 'Every chain in the selected work'
                : id === 'registered'
                  ? 'Only chains the registry already has, with the construct and inventory behind them'
                  : 'Only chains with nothing registered yet — the actual cloning to do'
            }
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="wq-note">
        Searched against the registry by components, not by name — {summary.total} chains,{' '}
        {summary.registered} already on a shelf.
      </p>

      <div className="wq-list" role="list">
        {shown.length === 0 && (
          <p className="hint">
            {items.length === 0
              ? 'No work selected. Pick a row in the work queue.'
              : 'Nothing in this work matches that search.'}
          </p>
        )}
        {plates.map((plate) => {
          const rows = shown.filter((item) => item.plateId === plate.id);
          if (!rows.length) return null;
          return (
            <div key={plate.id} className="wq-group">
              {many && (
                <p className="wq-group-head">
                  <span className="mono">{plate.id}</span> {plate.name}
                  <span className="wq-group-count">{rows.length}</span>
                </p>
              )}
              {rows.map((item) => (
                <WorkRow key={`${plate.id}-${item.chainId}`} item={item} plate={plate} order={order} />
              ))}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function WorkRow({ item, plate, order }: { item: WorkItem; plate: QueuedPlate; order: string[] }) {
  const state = useApp();
  const dispatch = useDispatch();
  const sizeBp = matchLengthBp(item.match, state.registry);
  const focused = state.focusChainId === item.chainId;
  const picked = state.workSelection.includes(item.chainId);
  const { match } = item;
  const color = componentColor(
    item.chainId,
    state.chains,
    state.registry,
    state.wellComponentColors,
    state.wellPaletteId,
    uniqueChainIds(state.plate),
  );

  return (
    <button
      type="button"
      role="listitem"
      aria-pressed={picked}
      className={`wq-row ${match.status}${focused ? ' focused' : ''}${picked ? ' picked' : ''}`}
      data-tip={itemTip(item, plate, sizeBp)}
      onMouseDown={(e) => {
        if (e.shiftKey) e.preventDefault();
      }}
      onClick={(e) => {
        dispatch({
          type: 'select-work',
          chainId: item.chainId,
          mode: e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'single',
          order,
          wellId: item.wells[0],
          plateId: item.plateId,
        });
      }}
    >
      <span className={`wq-status ${match.status}`}>{STATUS_LABEL[match.status]}</span>

      <span className="wq-name">
        <span className="wq-chain">
          <span className="wq-dot" style={{ background: color }} aria-hidden />
          {item.name}
        </span>
        <span className="wq-sub">
          {item.chainId} · {item.kind}
          {item.target ? ` · binds ${item.target}` : ''} · {basisLine(item)}
        </span>
      </span>

      <span className="wq-wells">
        {item.wells.length}
        <span className="wq-unit">{item.wells.length === 1 ? 'well' : 'wells'}</span>
      </span>

      <span className="wq-map">
        {match.status === 'new' ? (
          <span className="wq-none">no construct yet</span>
        ) : (
          <>
            <span className="wq-ids">{match.regId ?? match.constructId}</span>
            <span className="wq-sub">
              {match.regId ? `${match.constructId} · ` : ''}
              {match.insertId} in {match.vectorId}
              {sizeBp ? ` · ${sizeBp.toLocaleString()} bp` : ''}
            </span>
          </>
        )}
      </span>

      <span className="wq-stock">
        {match.status === 'registered' ? (
          <>
            <span className="wq-amount">{stockLine(match.inventory)}</span>
            <span className="wq-sub">{locationLine(match.inventory)}</span>
          </>
        ) : (
          <span className="wq-none">
            {match.status === 'assembled' ? 'not in inventory' : 'to build and register'}
          </span>
        )}
      </span>
    </button>
  );
}
