import { Panel } from './Panel';
import { buildMap, rulerTicks, type ConstructMapModel, type MapFeature } from '../model/geneious';
import {
  BAND_H,
  BAR_H,
  BLOCK_RULE,
  CARET,
  GUTTER_BG,
  HEAD,
  LABEL_FONT,
  NAME_FONT,
  OUTLINE_W,
  RING_STROKE,
  RING_W,
  ROW_PITCH,
  RULER_FONT,
  RULER_TEXT,
  RULER_TICK_H,
  SELECT_BLUE,
  SELECT_BORDER,
  SELECT_FILL,
  SEQUENCE_LINE,
  SEQUENCE_W,
  SHADOW_FAR,
  SHADOW_NEAR,
  arrowPath,
  bandArcPath,
  coordinate,
  dim,
  polar,
  shading,
  tangential,
  textOn,
  textWidth,
  truncate,
} from '../model/mapview';
import { flatOrder, useApp, useDispatch } from '../state/store';
import type { ChainDesign } from '../model/types';

/**
 * Construct map, drawn to Geneious Prime's conventions (manual.geneious.com)
 * with the geometry and shading measured from the published viewer:
 *
 * - Annotations are gradient-shaded bars with a 45° point on the directional
 *   end, a darker outline in their own hue and a two-row drop shadow. Labels sit
 *   inside when they fit and are hidden rather than clipped when they do not.
 * - The ruler has no baseline: grey numbers with a short tick below each.
 * - Zoomed out the sequence collapses to a thin grey line the annotations
 *   overlay, with the backbone as a track beneath it, named in the gutter.
 * - Selecting a component dims everything outside it to half alpha over white,
 *   and marks the boundaries with carets, bold blue coordinates and a length
 *   callout.
 * - A circular sequence draws a black backbone with the annotation band centred
 *   on it, tangential ruler labels outside, and the name and length in the
 *   middle. The linear view lays the same plasmid out without converting it.
 */

const GUTTER = 96;
/**
 * The viewer keeps bar heights and fonts fixed and spends extra width on the
 * coordinate axis, so the wide layout lengthens the track instead of scaling up.
 */
const TRACK_INSPECTOR = 236;
const TRACK_WIDE = 700;
/** Kept clear for the selection length callout, so the layout does not jump. */
const CALLOUT_H = 12;
const RULER_H = 15;
const LANE_LABEL_H = 11;

interface ViewProps {
  model: ConstructMapModel;
  activeFeatureId?: string;
  onSelect: (feature: MapFeature) => void;
}

/** Fill, outline and label colour for one annotation in its current state. */
function paint(feature: MapFeature, dimmed: boolean) {
  const base = dimmed ? dim(feature.color) : feature.color;
  return { ...shading(base), base };
}

function Shadow({ d }: { d: string }) {
  return (
    <>
      <path d={d} fill={SHADOW_FAR} transform="translate(0 2)" />
      <path d={d} fill={SHADOW_NEAR} transform="translate(0 1)" />
    </>
  );
}

const CIRCLE = { cx: 168, cy: 172, r: 108 };

/** How many characters fit between a label's anchor and the canvas edge. */
function labelRoom(anchorX: number): number {
  return Math.max(6, Math.floor((336 - anchorX - 6) / (LABEL_FONT * 0.55)));
}

function CircularView({ model, activeFeatureId, onSelect }: ViewProps) {
  const ticks = rulerTicks(model.totalBp);
  const anySelected = model.features.some((f) => f.id === activeFeatureId);
  const labelR = CIRCLE.r + BAND_H / 2 + 26;

  return (
    <svg
      className="gmap-svg"
      viewBox="0 0 336 348"
      role="img"
      aria-label={`${model.name} plasmid map`}
    >
      <circle
        cx={CIRCLE.cx}
        cy={CIRCLE.cy}
        r={CIRCLE.r}
        fill="none"
        stroke={RING_STROKE}
        strokeWidth={RING_W}
      />

      {ticks.map((bp) => {
        const from = polar(bp, model.totalBp, CIRCLE.r + BAND_H / 2, CIRCLE.cx, CIRCLE.cy);
        const to = polar(bp, model.totalBp, CIRCLE.r + BAND_H / 2 + 4, CIRCLE.cx, CIRCLE.cy);
        const at = polar(bp, model.totalBp, CIRCLE.r + BAND_H / 2 + 11, CIRCLE.cx, CIRCLE.cy);
        return (
          <g key={bp}>
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={RULER_TEXT} strokeWidth={1} />
            <text
              transform={`translate(${at.x} ${at.y}) rotate(${tangential(at.deg)})`}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={RULER_FONT}
              fill={RULER_TEXT}
            >
              {coordinate(bp)}
            </text>
          </g>
        );
      })}

      {model.features.map((feature) => {
        const selected = feature.id === activeFeatureId;
        const colors = paint(feature, anySelected && !selected);
        const d = bandArcPath(
          feature.start,
          feature.end,
          model.totalBp,
          CIRCLE.r,
          BAND_H,
          feature.strand,
          CIRCLE.cx,
          CIRCLE.cy,
        );
        const span = ((feature.end - feature.start) / model.totalBp) * 360;
        const mid = polar(
          (feature.start + feature.end) / 2,
          model.totalBp,
          CIRCLE.r + BAND_H / 2,
          CIRCLE.cx,
          CIRCLE.cy,
        );
        const label = polar(
          (feature.start + feature.end) / 2,
          model.totalBp,
          labelR,
          CIRCLE.cx,
          CIRCLE.cy,
        );
        // Crowded labels are dropped rather than clipped, per "hide excessive
        // labels"; the selected one is always drawn.
        const showLabel = span >= 26 || selected;
        const right = label.x >= CIRCLE.cx;

        return (
          <g
            key={feature.id}
            data-tip={`${feature.name} · ${coordinate(feature.start)}–${coordinate(feature.end)} (${
              feature.strand === 1 ? '+' : '−'
            })${feature.chainId ? ' — click to select this component everywhere' : ''}`}
            style={{ cursor: feature.chainId ? 'pointer' : 'default' }}
            onClick={() => onSelect(feature)}
          >
            <path
              d={d}
              fill={feature.empty ? 'none' : colors.mid}
              stroke={selected ? SELECT_BLUE : colors.outline}
              strokeWidth={selected ? 2 : OUTLINE_W}
              strokeDasharray={feature.empty ? '2 2' : undefined}
            />
            {showLabel && (
              <>
                <line
                  x1={mid.x}
                  y1={mid.y}
                  x2={label.x}
                  y2={label.y}
                  stroke={colors.outline}
                  strokeWidth={1}
                />
                <text
                  x={right ? Math.min(label.x + 3, 332) : Math.max(label.x - 3, 4)}
                  y={label.y}
                  textAnchor={right ? 'start' : 'end'}
                  dominantBaseline="middle"
                  fontSize={LABEL_FONT}
                  fontWeight={selected ? 600 : 400}
                  fill={colors.outline}
                >
                  {truncate(feature.name, right ? labelRoom(label.x) : labelRoom(336 - label.x))}
                </text>
              </>
            )}
          </g>
        );
      })}

      <text
        x={CIRCLE.cx}
        y={CIRCLE.cy - 4}
        textAnchor="middle"
        fontSize={NAME_FONT}
        fill="#404040"
      >
        {model.ccId ?? model.name}
      </text>
      <text
        x={CIRCLE.cx}
        y={CIRCLE.cy + 11}
        textAnchor="middle"
        fontSize={NAME_FONT}
        fill="#404040"
      >
        {coordinate(model.totalBp)} bp
      </text>
    </svg>
  );
}

/**
 * One construct laid out linearly: ruler, then the sequence line with its
 * annotations, then the backbone as its own track. Every row in a stack shares
 * `scaleBp`, so lengths are directly comparable.
 */
function LinearRow({
  model,
  activeFeatureId,
  onSelect,
  showRuler,
  scaleBp,
  separator,
  trackW,
}: ViewProps & {
  showRuler: boolean;
  scaleBp: number;
  separator: boolean;
  trackW: number;
}) {
  const rowW = GUTTER + trackW + 10;
  const x = (bp: number) => GUTTER + (bp / scaleBp) * trackW;
  const lanes: Array<'insert' | 'backbone'> = ['insert', 'backbone'];
  const top = CALLOUT_H + (showRuler ? RULER_H : 4);
  const height = top + lanes.length * (ROW_PITCH + LANE_LABEL_H) + 4;
  const ticks = rulerTicks(scaleBp, Math.round(trackW / 76));
  const selected = model.features.find((f) => f.id === activeFeatureId);
  const anySelected = !!selected;

  return (
    <svg
      className="gmap-svg"
      viewBox={`0 0 ${rowW} ${height}`}
      role="img"
      aria-label={`${model.name} linear map`}
    >
      <rect x={0} y={0} width={GUTTER} height={height} fill={GUTTER_BG} />
      {/* Stacked blocks are separated by a hairline across the full width. */}
      {separator && <line x1={0} y1={0.5} x2={rowW} y2={0.5} stroke={BLOCK_RULE} strokeWidth={1} />}

      {/* The ruler carries no baseline: numbers, then a tick under each. */}
      {showRuler && (
        <g>
          {ticks
            // A boundary label takes precedence over a round one it would sit on.
            .filter(
              (bp) =>
                !selected ||
                [selected.start, selected.end].every((edge) => Math.abs(x(bp) - x(edge)) > 15),
            )
            .map((bp) => (
              <g key={bp}>
                <text
                  x={x(bp)}
                  y={CALLOUT_H + 8}
                  textAnchor="middle"
                  fontSize={RULER_FONT}
                  fill={RULER_TEXT}
                >
                  {coordinate(bp)}
                </text>
                <line
                  x1={x(bp)}
                  y1={CALLOUT_H + 11}
                  x2={x(bp)}
                  y2={CALLOUT_H + 11 + RULER_TICK_H}
                  stroke={RULER_TEXT}
                  strokeWidth={1}
                />
              </g>
            ))}
          {/* Selection boundaries add their own coordinate, bold and blue. */}
          {selected &&
            [selected.start, selected.end].map((bp) => (
              <text
                key={bp}
                x={x(bp)}
                y={CALLOUT_H + 8}
                textAnchor="middle"
                fontSize={RULER_FONT}
                fontWeight={700}
                fill={SELECT_BLUE}
              >
                {coordinate(bp)}
              </text>
            ))}
        </g>
      )}

      {selected && (
        <g>
          {[selected.start, selected.end].map((bp) => (
            <line
              key={bp}
              x1={x(bp)}
              y1={CALLOUT_H}
              x2={x(bp)}
              y2={height}
              stroke={CARET}
              strokeWidth={1}
            />
          ))}
          <rect
            x={Math.max(x(selected.start), 2)}
            y={0}
            width={54}
            height={11}
            rx={2}
            fill={SELECT_FILL}
            stroke={SELECT_BORDER}
            strokeWidth={1}
          />
          <text
            x={Math.max(x(selected.start), 2) + 27}
            y={8}
            textAnchor="middle"
            fontSize={RULER_FONT}
            fill={SELECT_BORDER}
          >
            {coordinate(selected.end - selected.start + 1)} bp
          </text>
        </g>
      )}

      {/* Sequence name in the gutter, kept inside it. */}
      <text x={4} y={top + 9} fontSize={NAME_FONT} fill="#1A1A1A">
        {truncate(model.name, Math.floor((GUTTER - 8) / (NAME_FONT * 0.55)))}
      </text>
      <text x={4} y={top + 20} fontSize={RULER_FONT} fill={RULER_TEXT}>
        {coordinate(model.totalBp)} bp
      </text>

      {lanes.map((lane, laneIndex) => {
        const laneTop = top + LANE_LABEL_H + laneIndex * (ROW_PITCH + LANE_LABEL_H);
        const centre = laneTop + BAR_H / 2;
        const features = model.features.filter((f) => f.track === lane);
        if (lane === 'backbone' && !features.length) return null;

        return (
          <g key={lane}>
            {/* Track name in the gutter, as Geneious labels each track. */}
            {lane === 'backbone' && (
              <text x={4} y={laneTop - 3} fontSize={RULER_FONT} fill={RULER_TEXT}>
                {model.vectorName ?? 'backbone'}
              </text>
            )}
            <line
              x1={GUTTER}
              y1={centre}
              x2={x(model.totalBp)}
              y2={centre}
              stroke={anySelected ? dim(SEQUENCE_LINE) : SEQUENCE_LINE}
              strokeWidth={lane === 'insert' ? SEQUENCE_W : SEQUENCE_W - 1}
            />

            {features.map((feature) => {
              const x0 = x(feature.start);
              const w = Math.max(x(feature.end) - x0, 2);
              const isSelected = feature.id === activeFeatureId;
              const colors = paint(feature, anySelected && !isSelected);
              const d = arrowPath(x0, laneTop, w, feature.strand);
              const gradientId = `g-${feature.id}-${colors.mid.slice(1)}`;
              const fits = textWidth(feature.name, LABEL_FONT) + 8 <= w - HEAD;

              return (
                <g
                  key={feature.id}
                  data-tip={`${feature.name} · ${coordinate(feature.start)}–${coordinate(
                    feature.end,
                  )} (${feature.strand === 1 ? '+' : '−'})${
                    feature.fromVector ? ' — supplied by the backbone' : ''
                  }${feature.chainId ? ' — click to select this component everywhere' : ''}`}
                  style={{ cursor: feature.chainId ? 'pointer' : 'default' }}
                  onClick={() => onSelect(feature)}
                >
                  {!feature.empty && (
                    <>
                      <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={colors.top} />
                          <stop offset="45%" stopColor={colors.mid} />
                          <stop offset="100%" stopColor={colors.bottom} />
                        </linearGradient>
                      </defs>
                      <Shadow d={d} />
                    </>
                  )}
                  <path
                    d={d}
                    fill={feature.empty ? 'none' : `url(#${gradientId})`}
                    stroke={isSelected ? SELECT_BLUE : colors.outline}
                    strokeWidth={isSelected ? 2 : OUTLINE_W}
                    strokeDasharray={feature.empty ? '2 2' : undefined}
                  />
                  {fits && !feature.empty && (
                    <text
                      x={x0 + (w - HEAD) / 2}
                      y={laneTop + BAR_H / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={LABEL_FONT}
                      fontWeight={isSelected ? 700 : 400}
                      fill={textOn(colors.mid)}
                    >
                      {feature.name}
                    </text>
                  )}
                  {/* Too narrow to letter: the label moves outside, with a leader. */}
                  {!fits && isSelected && (
                    <>
                      <line
                        x1={x0 + w / 2}
                        y1={laneTop + BAR_H + 2}
                        x2={x0 + w / 2}
                        y2={laneTop + BAR_H + 7}
                        stroke={colors.outline}
                        strokeWidth={1}
                      />
                      <text
                        x={Math.min(Math.max(x0 + w / 2, GUTTER + 40), GUTTER + trackW - 40)}
                        y={laneTop + BAR_H + 15}
                        textAnchor="middle"
                        fontSize={LABEL_FONT}
                        fontWeight={700}
                        fill={colors.outline}
                      >
                        {truncate(feature.name, 30)}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

export function ConstructMap() {
  const state = useApp();
  const dispatch = useDispatch();

  const selectedChainIds = flatOrder(state.bench).filter(
    (id) => state.chains[id] && state.selection.includes(id),
  );
  // Several selected constructs are compared linearly; one is shown either way.
  const multi = selectedChainIds.length > 1;
  const chains: ChainDesign[] = multi
    ? selectedChainIds.map((id) => state.chains[id])
    : [state.chains[state.focusChainId]].filter(Boolean);

  if (!chains.length) return null;

  const models = chains.map((chain) => buildMap(chain, state.registry));
  // A linear sequence cannot be shown circular; only a plasmid can go either way.
  const linear = multi || state.constructView === 'linear' || !models[0].circular;

  const activeFeatureId = state.activeSlot
    ? `${state.activeSlot.chainId}-${state.activeSlot.slotIndex}`
    : undefined;

  function select(feature: MapFeature) {
    if (feature.chainId === undefined || feature.slotIndex === undefined) return;
    dispatch({ type: 'select-component', chainId: feature.chainId, slotIndex: feature.slotIndex });
  }

  const scaleBp = Math.max(...models.map((m) => m.totalBp));

  const stackAt = (trackW: number) => (
    <div className="gmap">
      {models.map((model, i) => (
        <LinearRow
          key={model.chainId}
          model={model}
          activeFeatureId={activeFeatureId}
          onSelect={select}
          showRuler={i === 0}
          scaleBp={scaleBp}
          separator={i > 0}
          trackW={trackW}
        />
      ))}
    </div>
  );

  return (
    <Panel
      title="Construct map"
      tip="The DNA that codes the design: directional annotations over a coordinate ruler, with the backbone on its own track"
      trailing={multi ? `${models.length} constructs selected` : models[0].name}
    >
      <div className="pad-controls">
        <div className="seg">
          {(['circular', 'linear'] as const).map((view) => (
            <button
              key={view}
              className={(multi ? view === 'linear' : state.constructView === view) ? 'active' : ''}
              disabled={multi || (view === 'circular' && !models[0].circular)}
              data-tip={
                multi
                  ? 'Several selected constructs are always compared linearly, on one shared scale'
                  : view === 'circular'
                    ? models[0].circular
                      ? 'Plasmid view: the whole construct as a circle'
                      : 'No backbone assigned yet, so there is no plasmid to draw — assign a vector first'
                    : 'Lay the same plasmid out linearly, without converting the sequence'
              }
              onClick={() => dispatch({ type: 'set-construct-view', view })}
            >
              {view === 'circular' ? 'Circular' : 'Linear'}
            </button>
          ))}
        </div>
        <button
          className="btn"
          onClick={() => dispatch({ type: 'expand-map', expanded: true })}
          data-tip="Open the linear map full width, where long constructs are easier to read"
        >
          Expand
        </button>
      </div>

      {linear ? (
        stackAt(TRACK_INSPECTOR)
      ) : (
        <div className="gmap">
          <CircularView model={models[0]} activeFeatureId={activeFeatureId} onSelect={select} />
        </div>
      )}

      {!multi && (
        <>
          <div className="kv">
            <span>Backbone</span>
            <span>{models[0].vectorName ?? '—'}</span>
          </div>
          <div className="kv">
            <span>Insert</span>
            <span>{coordinate(models[0].insertBp)} bp</span>
          </div>
          <div className="kv">
            <span>Construct</span>
            <span className="mono">{models[0].ccId ?? 'unassembled'}</span>
          </div>
          <div className="kv">
            <span>Registered</span>
            <span className="mono">{models[0].regId ?? '—'}</span>
          </div>
        </>
      )}

      <p className="pair-note">
        {multi
          ? 'Selected constructs share one coordinate scale, insert annotations on the sequence line and backbone features on the track below. Click any annotation to select that component everywhere.'
          : 'Annotations point in their strand direction. Clicking one selects the component on the bench and the design pad, dims everything outside it and marks the boundaries on the ruler. Labels that would not fit their annotation are hidden rather than clipped.'}
      </p>

      {state.mapExpanded && (
        <div className="overlay" onClick={() => dispatch({ type: 'expand-map', expanded: false })}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <h2>Construct map — {multi ? `${models.length} constructs` : models[0].name}</h2>
              <span style={{ marginLeft: 'auto' }} />
              <button
                className="btn"
                data-tip="Return the map to the inspector column"
                onClick={() => dispatch({ type: 'expand-map', expanded: false })}
              >
                Close
              </button>
            </div>
            <div className="sheet-body wide">{stackAt(TRACK_WIDE)}</div>
          </div>
        </div>
      )}
    </Panel>
  );
}
