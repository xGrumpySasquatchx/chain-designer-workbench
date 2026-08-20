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
import type { PlateWell, QueuedPlate } from '../model/types';

const BASE_WELL = 18;
const ZOOM_STEP = 10;
const START_ZOOM_PCT = 194;
const EXTRA_ZOOMS = 3;
const MIN_ZOOM_PCT = Math.round((14 / BASE_WELL) * 100);
const MAX_ZOOM_PCT = START_ZOOM_PCT + ZOOM_STEP * EXTRA_ZOOMS;

function zoomPercent(size: number) {
  return Math.round((size / BASE_WELL) * 100);
}

function wellFromZoom(pct: number) {
  const clamped = Math.max(MIN_ZOOM_PCT, Math.min(MAX_ZOOM_PCT, Math.round(pct)));
  return (clamped / 100) * BASE_WELL;
}

function wellsForPlate(plate: QueuedPlate, livePlateId: string, liveWells: PlateWell[]): PlateWell[] {
  return plate.id === livePlateId ? liveWells : plate.wells;
}

export function Plate() {
  const state = useApp();
  const dispatch = useDispatch();
  const selected = new Set(state.selectedWells);
  const primary = state.lastSelectedWellId;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [wellSize, setWellSize] = useState(() => wellFromZoom(START_ZOOM_PCT));

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setWellSize((size) => {
        const current = zoomPercent(size);
        const next = current + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
        return wellFromZoom(next);
      });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  function onWellClick(e: MouseEvent<HTMLButtonElement>, wellId: string, plateId: string) {
    const mode = e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'single';
    dispatch({ type: 'select-wells', wellId, mode, plateId });
  }

  function fitWidth() {
    const width = viewportRef.current?.clientWidth ?? 0;
    if (!width) return;
    const label = 16;
    const gap = Math.max(2, wellSize * 0.12);
    setWellSize(wellFromZoom(zoomPercent((width - label - 11 * gap) / 12)));
  }

  function setZoomPct(next: number) {
    setWellSize(wellFromZoom(next));
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
  const openPlates = state.activePlateIds
    .map((id) => state.plateQueue.find((p) => p.id === id))
    .filter((p): p is QueuedPlate => !!p);
  const current = openPlates.find((p) => p.id === state.activePlateId) ?? openPlates[0];
  const many = openPlates.length > 1;

  return (
    <Panel
      title={many ? `${openPlates.length} plates` : (current?.name ?? '96-well plate')}
      tip={
        many
          ? `Cmd-click queue rows to keep several plates in this view, then scroll between them. Click a well to work that plate on the bench. Shift-click a rectangle or cmd-click to add wells. Scroll with ctrl to zoom.`
          : current
            ? `${current.id} · ${current.barcode}. Each well is a Luma molecule drawn as a pie of its chain elements. Click to load its chains on the bench; shift-click a rectangle or cmd-click to add wells. Scroll with ctrl to zoom.`
            : 'Each well is a Luma molecule drawn as a pie of its chain elements. Click to load its chains on the bench; shift-click a rectangle or cmd-click to add wells. Scroll with ctrl to zoom.'
      }
      trailing={
        <span className="plate-trailing">
          <span
            data-tip={
              many
                ? openPlates.map((p) => `${p.id} · ${p.barcode}`).join(' · ')
                : current
                  ? `${current.barcode} · ${current.formatLabel}`
                  : undefined
            }
          >
            {many ? `${openPlates.map((p) => p.id).join(' · ')}` : current ? `${current.id} · ${trailing}` : trailing}
          </span>
          <span className="plate-zoom" role="group" aria-label="Plate zoom">
            <button
              type="button"
              className="plate-tool"
              data-tip={`Zoom out (${MIN_ZOOM_PCT}–${MAX_ZOOM_PCT}%)`}
              disabled={pct <= MIN_ZOOM_PCT}
              onClick={() => setZoomPct(pct - ZOOM_STEP)}
            >
              −
            </button>
            <button
              type="button"
              className="plate-zoom-pct"
              data-tip={`Reset zoom to ${START_ZOOM_PCT}%`}
              onClick={() => setZoomPct(START_ZOOM_PCT)}
            >
              {pct}%
            </button>
            <button
              type="button"
              className="plate-tool"
              data-tip={`Zoom in (${MIN_ZOOM_PCT}–${MAX_ZOOM_PCT}%)`}
              disabled={pct >= MAX_ZOOM_PCT}
              onClick={() => setZoomPct(pct + ZOOM_STEP)}
            >
              +
            </button>
          </span>
          <button type="button" className="plate-tool" data-tip="Fit the plate to the column" onClick={fitWidth}>
            ⤢
          </button>
        </span>
      }
      defaultHeight={464}
    >
      <div className="plate-stage" style={{ '--well-size': `${wellSize}px` } as CSSProperties}>
        <div ref={viewportRef} className="plate-viewport">
          <div className="plate-stack">
            {openPlates.map((plate) => {
              const isPrimary = plate.id === state.activePlateId;
              const gridWells = wellsForPlate(plate, state.activePlateId, state.plate);
              return (
                <div key={plate.id} className={`plate-card${isPrimary ? ' primary' : ''}`}>
                  {many && (
                    <div className="plate-card-head">
                      <span className="plate-card-id">{plate.id}</span>
                      <span className="plate-card-barcode">{plate.barcode}</span>
                      <span className="plate-card-name">{plate.name}</span>
                      {isPrimary && <span className="plate-card-flag">bench</span>}
                    </div>
                  )}
                  <PlateGrid
                    wells={gridWells}
                    selected={isPrimary ? selected : new Set()}
                    primary={isPrimary ? primary : null}
                    interactive
                    onWellClick={(e, wellId) => onWellClick(e, wellId, plate.id)}
                  />
                </div>
              );
            })}
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

function PlateGrid({
  wells,
  selected,
  primary,
  interactive,
  onWellClick,
}: {
  wells: PlateWell[];
  selected: Set<string>;
  primary: string | null;
  interactive: boolean;
  onWellClick: (e: MouseEvent<HTMLButtonElement>, wellId: string) => void;
}) {
  const chainOrder = uniqueChainIds(wells);
  return (
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
          wells={wells}
          selected={selected}
          primary={primary}
          chainOrder={chainOrder}
          interactive={interactive}
          onWellClick={onWellClick}
        />
      ))}
    </div>
  );
}

function Row({
  row,
  rowIndex,
  wells,
  selected,
  primary,
  chainOrder,
  interactive,
  onWellClick,
}: {
  row: string;
  rowIndex: number;
  wells: PlateWell[];
  selected: Set<string>;
  primary: string | null;
  chainOrder: string[];
  interactive: boolean;
  onWellClick: (e: MouseEvent<HTMLButtonElement>, wellId: string) => void;
}) {
  const state = useApp();
  return (
    <>
      <div className="plate-row-label">{row}</div>
      {PLATE_COLS.map((_, ci) => {
        const well = wells[rowIndex * 12 + ci];
        if (!well) return <div key={`${row}-${ci}`} className="plate-well" />;
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
            disabled={!interactive}
            style={{ background: wellPieBackground(colors) }}
          />
        );
      })}
    </>
  );
}
