import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { Panel } from './Panel';
import { PaletteSelect } from './PaletteSelect';
import { wellPieBackground } from '../model/palettes';
import {
  PLATE_COLS,
  PLATE_ROWS,
  uniqueChainIds,
  wellCaption,
  wellElementColors,
} from '../model/plate';
import { useApp, useDispatch } from '../state/store';

const MIN_WELL = 14;
const MAX_WELL = 60;
const DEFAULT_WELL = 18;

function clampWell(size: number) {
  return Math.max(MIN_WELL, Math.min(MAX_WELL, Math.round(size)));
}

function zoomPercent(size: number) {
  return Math.round((size / DEFAULT_WELL) * 100);
}

const MIN_ZOOM_PCT = zoomPercent(MIN_WELL);
const MAX_ZOOM_PCT = zoomPercent(MAX_WELL);

export function Plate() {
  const state = useApp();
  const dispatch = useDispatch();
  const selected = new Set(state.selectedWells);
  const primary = state.lastSelectedWellId;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [wellSize, setWellSize] = useState(DEFAULT_WELL);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setWellSize((size) => {
        const current = zoomPercent(size);
        const next = current + (e.deltaY < 0 ? 10 : -10);
        return clampWell((next / 100) * DEFAULT_WELL);
      });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  function onWellClick(e: MouseEvent<HTMLButtonElement>, wellId: string) {
    const mode = e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'single';
    dispatch({ type: 'select-wells', wellId, mode });
  }

  function fitWidth() {
    const width = viewportRef.current?.clientWidth ?? 0;
    if (!width) return;
    const label = 16;
    const gap = Math.max(2, wellSize * 0.12);
    setWellSize(clampWell((width - label - 11 * gap) / 12));
  }

  function setZoomPct(next: number) {
    const clamped = Math.max(MIN_ZOOM_PCT, Math.min(MAX_ZOOM_PCT, Math.round(next)));
    setWellSize(clampWell((clamped / 100) * DEFAULT_WELL));
  }

  const pct = zoomPercent(wellSize);

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
  const chainOrder = uniqueChainIds(state.plate);

  return (
    <Panel
      title="96-well plate"
      tip="Each well is a Luma molecule drawn as a pie of its chain elements. Click to load its chains on the bench; shift-click a rectangle or cmd-click to add wells. Scroll with ctrl to zoom."
      trailing={
        <span className="plate-trailing">
          <span>{trailing}</span>
          <span className="plate-zoom" role="group" aria-label="Plate zoom">
            <button
              type="button"
              className="plate-tool"
              data-tip={`Zoom out (${MIN_ZOOM_PCT}–${MAX_ZOOM_PCT}%)`}
              disabled={pct <= MIN_ZOOM_PCT}
              onClick={() => setZoomPct(pct - 10)}
            >
              −
            </button>
            <button
              type="button"
              className="plate-zoom-pct"
              data-tip="Reset zoom to 100%"
              onClick={() => setZoomPct(100)}
            >
              {pct}%
            </button>
            <button
              type="button"
              className="plate-tool"
              data-tip={`Zoom in (${MIN_ZOOM_PCT}–${MAX_ZOOM_PCT}%)`}
              disabled={pct >= MAX_ZOOM_PCT}
              onClick={() => setZoomPct(pct + 10)}
            >
              +
            </button>
          </span>
          <button type="button" className="plate-tool" data-tip="Fit the plate to the column" onClick={fitWidth}>
            ⤢
          </button>
        </span>
      }
      defaultHeight={228}
    >
      <div className="plate-stage">
        <div
          ref={viewportRef}
          className="plate-viewport"
          style={{ '--well-size': `${wellSize}px` } as CSSProperties}
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
                chainOrder={chainOrder}
                onWellClick={onWellClick}
              />
            ))}
          </div>
        </div>
        <div className="plate-toolbar">
          <PaletteSelect
            value={state.wellPaletteId}
            onChange={(paletteId) => dispatch({ type: 'set-well-palette', paletteId })}
          />
        </div>
      </div>
    </Panel>
  );
}

function Row({
  row,
  rowIndex,
  selected,
  primary,
  chainOrder,
  onWellClick,
}: {
  row: string;
  rowIndex: number;
  selected: Set<string>;
  primary: string | null;
  chainOrder: string[];
  onWellClick: (e: MouseEvent<HTMLButtonElement>, wellId: string) => void;
}) {
  const state = useApp();
  return (
    <>
      <div className="plate-row-label">{row}</div>
      {PLATE_COLS.map((_, ci) => {
        const well = state.plate[rowIndex * 12 + ci];
        const colors = wellElementColors(
          well,
          state.chains,
          state.registry,
          state.wellComponentColors,
          state.wellPaletteId,
          chainOrder,
        );
        const caption = wellCaption(well, state.chains, state.registry);
        const isOn = selected.has(well.id);
        return (
          <button
            key={well.id}
            type="button"
            className={`plate-well${isOn ? ' selected' : ''}${primary === well.id ? ' primary' : ''}`}
            data-tip={`${well.id} · ${well.lumaUid} — ${caption}. ${well.chainIds.length} elements. Click to select, shift-click for a block, cmd-click to toggle.`}
            onClick={(e) => onWellClick(e, well.id)}
            aria-pressed={isOn}
            aria-label={`Well ${well.id}, ${well.lumaUid}, ${caption}`}
            style={{ background: wellPieBackground(colors) }}
          />
        );
      })}
    </>
  );
}
