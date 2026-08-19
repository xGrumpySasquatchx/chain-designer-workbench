import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { Panel } from './Panel';
import {
  PLATE_COLS,
  PLATE_ROWS,
  componentColor,
  uniqueChainIds,
  wellCaption,
  wellElementColors,
} from '../model/plate';
import { useApp, useDispatch } from '../state/store';

const MIN_WELL = 8;
const MAX_WELL = 36;
const DEFAULT_WELL = 12;

function clampWell(size: number) {
  return Math.max(MIN_WELL, Math.min(MAX_WELL, Math.round(size)));
}

export function Plate() {
  const state = useApp();
  const dispatch = useDispatch();
  const selected = new Set(state.selectedWells);
  const primary = state.lastSelectedWellId;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [wellSize, setWellSize] = useState(DEFAULT_WELL);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [legendAll, setLegendAll] = useState(false);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setWellSize((size) => clampWell(size * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
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
    const label = 14;
    const gap = Math.max(2, wellSize * 0.12);
    setWellSize(clampWell((width - label - 11 * gap) / 12));
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

  const legendIds = uniqueChainIds(legendAll ? state.plate : wells);

  return (
    <Panel
      title="96-well plate"
      tip="Each well is a Luma molecule. Click to load its chains on the bench; shift-click a rectangle or cmd-click to add wells. Scroll with ctrl to zoom."
      trailing={
        <span className="plate-trailing">
          <span>{trailing}</span>
          <button
            type="button"
            className={`plate-tool${colorsOpen ? ' on' : ''}`}
            data-tip="Customize how molecule elements colour on the plate"
            onClick={() => setColorsOpen((open) => !open)}
          >
            Colors
          </button>
          <button
            type="button"
            className="plate-tool"
            data-tip="Zoom in"
            onClick={() => setWellSize((s) => clampWell(s * 1.2))}
          >
            +
          </button>
          <button
            type="button"
            className="plate-tool"
            data-tip="Zoom out"
            onClick={() => setWellSize((s) => clampWell(s / 1.2))}
          >
            −
          </button>
          <button type="button" className="plate-tool" data-tip="Fit the plate to the column" onClick={fitWidth}>
            ⤢
          </button>
        </span>
      }
      defaultHeight={148}
    >
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
              onWellClick={onWellClick}
            />
          ))}
        </div>
      </div>
      {colorsOpen && (
        <div className="plate-legend">
          <div className="plate-legend-head">
            <span>Well component colors</span>
            <label className="plate-legend-all">
              <input
                type="checkbox"
                checked={legendAll}
                onChange={(e) => setLegendAll(e.target.checked)}
              />
              All plate
            </label>
            <button
              type="button"
              className="plate-tool"
              data-tip="Restore default colours from each chain's target"
              onClick={() => dispatch({ type: 'reset-well-colors' })}
            >
              Reset
            </button>
          </div>
          <div className="plate-legend-items">
            {legendIds.map((id) => {
              const chain = state.chains[id];
              if (!chain) return null;
              const color = componentColor(
                id,
                state.chains,
                state.registry,
                state.wellComponentColors,
              );
              return (
                <label key={id} className="plate-swatch" data-tip={`${chain.name} (${id})`}>
                  <input
                    type="color"
                    value={color}
                    aria-label={`Color for ${chain.name}`}
                    onChange={(e) =>
                      dispatch({ type: 'set-well-color', chainId: id, color: e.target.value })
                    }
                  />
                  <span className="plate-swatch-dot" style={{ background: color }} />
                  <span className="plate-swatch-name">{chain.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
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
        const colors = wellElementColors(
          well,
          state.chains,
          state.registry,
          state.wellComponentColors,
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
          >
            {colors.map((color, i) => (
              <span
                key={`${well.chainIds[i]}-${i}`}
                className="plate-well-slice"
                style={{ background: color }}
              />
            ))}
          </button>
        );
      })}
    </>
  );
}
