import type { MouseEvent } from 'react';
import { Panel } from './Panel';
import {
  PLATE_COLS,
  PLATE_ROWS,
  wellCaption,
  wellColors,
} from '../model/plate';
import { useApp, useDispatch } from '../state/store';

export function Plate() {
  const state = useApp();
  const dispatch = useDispatch();
  const selected = new Set(state.selectedWells);
  const primary = state.lastSelectedWellId;

  function onWellClick(e: MouseEvent<HTMLButtonElement>, wellId: string) {
    const mode = e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'single';
    dispatch({ type: 'select-wells', wellId, mode });
  }

  const wells = state.selectedWells
    .map((id) => state.plate.find((w) => w.id === id))
    .filter((w): w is NonNullable<typeof w> => !!w);
  const uniqueChains = [...new Set(wells.flatMap((w) => w.chainIds))];
  const trailing =
    selected.size === 0
      ? 'none selected'
      : selected.size === 1
        ? `${primary} · ${uniqueChains.length} chains`
        : `${selected.size} wells · ${uniqueChains.length} unique chains`;

  return (
    <Panel
      title="96-well plate"
      tip="Each well is a unique molecule. Click to load its chains on the bench; shift-click a rectangle or cmd-click to add wells. Shared chains (a row heavy, a column heavy, the common light chain) appear once."
      trailing={trailing}
      defaultHeight={248}
    >
      <div className="plate">
        <div className="plate-corner" />
        {PLATE_COLS.map((col) => (
          <div key={col} className="plate-col-label">
            {col}
          </div>
        ))}
        {PLATE_ROWS.map((row, ri) => (
          <Row
            key={row}
            row={row}
            rowIndex={ri}
            selected={selected}
            primary={primary}
            onWellClick={onWellClick}
          />
        ))}
      </div>
      <p className="hint">
        Wells in a row share a heavy chain; wells in a column share the partner heavy chain; every
        well shares the universal light chain. Selecting several wells is how you do bulk work on
        those shared chains.
      </p>
    </Panel>
  );
}

function Row({
  row,
  rowIndex,
  selected,
  primary,
  onWellClick,
}: {
  row: string;
  rowIndex: number;
  selected: Set<string>;
  primary: string | null;
  onWellClick: (e: MouseEvent<HTMLButtonElement>, wellId: string) => void;
}) {
  const state = useApp();
  return (
    <>
      <div className="plate-row-label">{row}</div>
      {PLATE_COLS.map((_, ci) => {
        const well = state.plate[rowIndex * 12 + ci];
        const colors = wellColors(well, state.chains, state.registry);
        const caption = wellCaption(well, state.chains, state.registry);
        const isOn = selected.has(well.id);
        return (
          <button
            key={well.id}
            type="button"
            className={`plate-well${isOn ? ' selected' : ''}${primary === well.id ? ' primary' : ''}`}
            data-tip={`${well.id} — ${caption}. ${well.chainIds.length} chains. Click to select, shift-click for a block, cmd-click to toggle.`}
            onClick={(e) => onWellClick(e, well.id)}
            aria-pressed={isOn}
            aria-label={`Well ${well.id}, ${caption}`}
          >
            <span className="plate-well-half" style={{ background: colors.left }} />
            <span className="plate-well-half" style={{ background: colors.right }} />
          </button>
        );
      })}
    </>
  );
}
