import { buildMap, rulerTicks, type ConstructMapModel, type MapFeature } from '../model/geneious';
import { flatOrder, useApp, useDispatch } from '../state/store';
import type { ChainDesign } from '../model/types';

/**
 * Construct map, following Geneious Prime conventions (manual.geneious.com):
 *
 * - Annotations are directional arrows over a coordinate ruler, labelled outside
 *   the feature, and grouped into tracks stacked under the sequence.
 * - A circular sequence defaults to the circular view; "linear view on circular
 *   sequences" lays the same construct out linearly without converting it.
 * - Clicking an annotation selects the region it covers, and that selection is
 *   shared with the other viewers.
 * - Several selected sequences are shown stacked, names at the left, on a common
 *   coordinate scale.
 */

const CX = 96;
const CY = 96;
const RING = 62;

function polar(bp: number, totalBp: number, radius: number) {
  const angle = (bp / totalBp) * 2 * Math.PI - Math.PI / 2;
  return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle), angle };
}

/** Feature arc with an arrow head at its 3' end, on the strand's own radius. */
function arcPath(feature: MapFeature, totalBp: number, radius: number) {
  const head = Math.min((feature.end - feature.start) * 0.35, totalBp * 0.012);
  const tipBp = feature.strand === 1 ? feature.end : feature.start;
  const bodyEndBp = feature.strand === 1 ? feature.end - head : feature.start + head;
  const from = feature.strand === 1 ? feature.start : feature.end;

  const a = polar(from, totalBp, radius);
  const b = polar(bodyEndBp, totalBp, radius);
  const large = Math.abs(bodyEndBp - from) / totalBp > 0.5 ? 1 : 0;
  const sweep = feature.strand === 1 ? 1 : 0;
  const body = `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${radius} ${radius} 0 ${large} ${sweep} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;

  const tip = polar(tipBp, totalBp, radius);
  const outer = polar(bodyEndBp, totalBp, radius + 4.5);
  const inner = polar(bodyEndBp, totalBp, radius - 4.5);
  const arrow = `M ${outer.x.toFixed(1)} ${outer.y.toFixed(1)} L ${tip.x.toFixed(1)} ${tip.y.toFixed(1)} L ${inner.x.toFixed(1)} ${inner.y.toFixed(1)} Z`;
  return { body, arrow };
}

interface ViewProps {
  model: ConstructMapModel;
  activeFeatureId?: string;
  onSelect: (feature: MapFeature) => void;
}

function CircularView({ model, activeFeatureId, onSelect }: ViewProps) {
  const ticks = rulerTicks(model.totalBp);

  return (
    <svg className="pad" viewBox="0 0 192 196" role="img" aria-label={`${model.name} plasmid map`}>
      <circle cx={CX} cy={CY} r={RING} fill="none" stroke="#639922" strokeWidth={1.6} />

      {ticks.map((bp) => {
        const inner = polar(bp, model.totalBp, RING - 4);
        const outer = polar(bp, model.totalBp, RING + 4);
        const label = polar(bp, model.totalBp, RING + 12);
        return (
          <g key={bp}>
            <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="var(--border-strong)" strokeWidth={0.8} />
            <text
              x={label.x}
              y={label.y + 2}
              textAnchor="middle"
              fontSize="5.5"
              fill="var(--text-muted)"
            >
              {bp >= 1000 ? `${(bp / 1000).toFixed(1)}k` : bp}
            </text>
          </g>
        );
      })}

      {model.features.map((feature) => {
        // Insert annotations sit on the sequence; backbone features form a track
        // on their own radius inside it.
        const radius = feature.track === 'insert' ? RING : RING - 13;
        const { body, arrow } = arcPath(feature, model.totalBp, radius);
        const active = feature.id === activeFeatureId;
        return (
          <g
            key={feature.id}
            style={{ cursor: feature.chainId ? 'pointer' : 'default' }}
            onClick={() => onSelect(feature)}
          >
            <path
              d={body}
              fill="none"
              stroke={active ? 'var(--border-accent)' : feature.color}
              strokeOpacity={feature.empty ? 0.45 : feature.fromVector ? 0.6 : 1}
              strokeWidth={active ? 8.5 : 6.5}
              strokeDasharray={feature.empty ? '2 3' : undefined}
            />
            <path
              d={arrow}
              fill={active ? 'var(--border-accent)' : feature.color}
              fillOpacity={feature.empty ? 0.45 : feature.fromVector ? 0.6 : 1}
            />
            <title>{`${feature.name} · ${feature.start.toLocaleString()}–${feature.end.toLocaleString()} (${feature.strand === 1 ? '+' : '−'})`}</title>
          </g>
        );
      })}

      <text x={CX} y={CY - 4} textAnchor="middle" fontSize="9" fill="var(--text-primary)">
        {model.ccId ?? 'unassembled'}
      </text>
      <text x={CX} y={CY + 8} textAnchor="middle" fontSize="7.5" fill="var(--text-muted)">
        {model.totalBp.toLocaleString()} bp
      </text>
      <text x={CX} y={CY + 19} textAnchor="middle" fontSize="7" fill="var(--text-muted)">
        {model.circular ? 'circular' : 'linear insert only'}
      </text>
    </svg>
  );
}

const LANE_H = 15;
const LEFT_GUTTER = 84;
const TRACK_W = 250;

/**
 * One construct laid out linearly: ruler on top, insert then backbone track.
 * Every row in a stack shares `scaleBp`, so lengths are directly comparable.
 */
function LinearRow({
  model,
  activeFeatureId,
  onSelect,
  showRuler,
  scaleBp,
}: ViewProps & { showRuler: boolean; scaleBp: number }) {
  const scale = (bp: number) => LEFT_GUTTER + (bp / scaleBp) * TRACK_W;
  const tracks: Array<'insert' | 'backbone'> = ['insert', 'backbone'];
  const height = LANE_H * tracks.length + (showRuler ? 14 : 4);
  const ticks = rulerTicks(scaleBp);

  return (
    <svg
      className="linear-row"
      viewBox={`0 0 ${LEFT_GUTTER + TRACK_W + 8} ${height}`}
      role="img"
      aria-label={`${model.name} linear map`}
    >
      {showRuler && (
        <g>
          <line
            x1={LEFT_GUTTER}
            y1={9}
            x2={scale(scaleBp)}
            y2={9}
            stroke="var(--border-strong)"
            strokeWidth={0.6}
          />
          {ticks.map((bp) => (
            <g key={bp}>
              <line x1={scale(bp)} y1={6} x2={scale(bp)} y2={9} stroke="var(--border-strong)" strokeWidth={0.6} />
              <text x={scale(bp)} y={5} textAnchor="middle" fontSize="4.6" fill="var(--text-muted)">
                {bp >= 1000 ? `${(bp / 1000).toFixed(1)}k` : bp}
              </text>
            </g>
          ))}
        </g>
      )}

      <text x={0} y={(showRuler ? 14 : 4) + 9} fontSize="6.4" fill="var(--text-primary)">
        {model.name.length > 20 ? `${model.name.slice(0, 19)}…` : model.name}
      </text>
      <text x={0} y={(showRuler ? 14 : 4) + 17} fontSize="5.4" fill="var(--text-muted)">
        {model.ccId ?? 'unassembled'} · {(model.totalBp / 1000).toFixed(1)} kb
      </text>

      {tracks.map((track, laneIndex) => {
        const y = (showRuler ? 14 : 4) + laneIndex * LANE_H;
        return (
          <g key={track}>
            {/* The sequence line stops at this construct's own end. */}
            <line
              x1={LEFT_GUTTER}
              y1={y + LANE_H / 2}
              x2={scale(model.totalBp)}
              y2={y + LANE_H / 2}
              stroke="var(--border)"
              strokeWidth={track === 'insert' ? 1.2 : 0.6}
            />
            {model.features
              .filter((f) => f.track === track)
              .map((feature) => {
                const x0 = scale(feature.start);
                const x1 = scale(feature.end);
                const w = Math.max(x1 - x0, 1.6);
                const head = Math.min(w * 0.4, 3.4);
                const top = y + 3;
                const h = LANE_H - 8;
                const active = feature.id === activeFeatureId;
                // Directional arrow, per Geneious "show arrow tips".
                const points =
                  feature.strand === 1
                    ? `${x0},${top} ${x0 + w - head},${top} ${x0 + w},${top + h / 2} ${x0 + w - head},${top + h} ${x0},${top + h}`
                    : `${x0 + w},${top} ${x0 + head},${top} ${x0},${top + h / 2} ${x0 + head},${top + h} ${x0 + w},${top + h}`;
                return (
                  <g
                    key={feature.id}
                    style={{ cursor: feature.chainId ? 'pointer' : 'default' }}
                    onClick={() => onSelect(feature)}
                  >
                    <polygon
                      points={points}
                      fill={feature.empty ? 'none' : feature.color}
                      fillOpacity={feature.fromVector ? 0.55 : 1}
                      stroke={active ? 'var(--border-accent)' : feature.color}
                      strokeWidth={active ? 1.5 : 0.5}
                      strokeDasharray={feature.empty ? '1.5 1.5' : undefined}
                    />
                    <title>{`${feature.name} · ${feature.start.toLocaleString()}–${feature.end.toLocaleString()} (${feature.strand === 1 ? '+' : '−'})`}</title>
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

  const stack = (
    <div className="linear-stack">
      {models.map((model, i) => (
        <LinearRow
          key={model.chainId}
          model={model}
          activeFeatureId={activeFeatureId}
          onSelect={select}
          showRuler={i === 0}
          scaleBp={scaleBp}
        />
      ))}
    </div>
  );

  return (
    <div className="panel">
      <p className="panel-title">
        Construct map
        <span className="count">
          {multi ? `${models.length} constructs selected` : models[0].name}
        </span>
      </p>

      <div className="pad-controls">
        <div className="seg">
          {(['circular', 'linear'] as const).map((view) => (
            <button
              key={view}
              className={(multi ? view === 'linear' : state.constructView === view) ? 'active' : ''}
              disabled={multi || (view === 'circular' && !models[0].circular)}
              title={
                multi
                  ? 'Multiple constructs are always compared linearly'
                  : view === 'circular'
                    ? 'Circular view'
                    : 'Linear view on circular sequence'
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
          title="Open the map full width"
        >
          Expand
        </button>
      </div>

      {linear ? (
        stack
      ) : (
        <CircularView model={models[0]} activeFeatureId={activeFeatureId} onSelect={select} />
      )}

      {!multi && (
        <>
          <div className="kv">
            <span>Backbone</span>
            <span>{models[0].vectorName ?? '—'}</span>
          </div>
          <div className="kv">
            <span>Insert</span>
            <span>{models[0].insertBp.toLocaleString()} bp</span>
          </div>
          <div className="kv">
            <span>Registered</span>
            <span className="mono">{models[0].regId ?? '—'}</span>
          </div>
        </>
      )}

      <p className="pair-note">
        {multi
          ? 'Selected constructs share one coordinate scale, insert annotations on the sequence and backbone features on the track below. Click any annotation to select that component everywhere.'
          : 'Annotations are directional; the backbone track sits inside the insert. Click an annotation to select the component on the bench and the design pad.'}
      </p>

      {state.mapExpanded && (
        <div className="overlay" onClick={() => dispatch({ type: 'expand-map', expanded: false })}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <h2>Construct map — {multi ? `${models.length} constructs` : models[0].name}</h2>
              <span style={{ marginLeft: 'auto' }} />
              <button className="btn" onClick={() => dispatch({ type: 'expand-map', expanded: false })}>
                Close
              </button>
            </div>
            <div className="sheet-body wide">{stack}</div>
          </div>
        </div>
      )}
    </div>
  );
}
