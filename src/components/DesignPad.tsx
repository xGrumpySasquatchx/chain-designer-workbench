import { useRef, useState, type DragEvent, type ReactElement } from 'react';
import { BB_LIBRARY, bbDef, canFuse, chainTarget, symmetry, type BbShape } from '../model/bioglyph';
import { COLORS, NEUTRAL_DOMAIN, PART_LABELS, lengthIn, targetColor } from '../model/parts';
import { suppliedByVector } from '../model/combinatorics';
import { useApp, useDispatch } from '../state/store';
import { PART_DRAG_TYPE } from './RegistryRail';
import type { ArmId, BbKind, ChainDesign, PartType } from '../model/types';

export const BB_DRAG_TYPE = 'application/x-msab-bb';

/**
 * BioGlyph Design Pad (docs.bioglyph.app):
 *
 * - Building blocks come from a curated palette and are connected by proximity —
 *   dropping one on an arm position fuses it there, mirroring genetic fusion.
 * - Connectivity is controlled: a tag fuses onto a block, arms occupy positions.
 * - Shape encodes the building block; color encodes the sequence / target.
 * - Symmetry across the Y-axis through the Fc decides homodimer vs. heterodimer.
 * - A format that already exists keeps its identifier rather than gaining a new one.
 */

const CENTER = 110;
/** Top of the Fc stem, where both arms converge. */
const FC_TOP = 108;

function dirOf(arm: ArmId) {
  return arm === 'left' ? -1 : 1;
}

interface DomainSpec {
  type: PartType;
  /** Distance from the arm tip: 0 is the N-terminal domain. */
  slot: number;
  /** Which chain carries it, and which lane of the arm it draws in. */
  side: 'heavy' | 'light';
}

/** Domains an arm shows at domain zoom, tip first. */
function domainLayout(bb: BbKind): DomainSpec[] {
  switch (bb) {
    case 'fab':
    case 'scfab':
      return [
        { type: 'vh', slot: 0, side: 'heavy' },
        { type: 'vl', slot: 0, side: 'light' },
        { type: 'ch1', slot: 1, side: 'heavy' },
        { type: 'cl', slot: 1, side: 'light' },
      ];
    case 'xfab':
      // Crossover: the heavy chain carries CL, the light chain carries CH1.
      return [
        { type: 'vh', slot: 0, side: 'heavy' },
        { type: 'vl', slot: 0, side: 'light' },
        { type: 'cl', slot: 1, side: 'heavy' },
        { type: 'ch1', slot: 1, side: 'light' },
      ];
    case 'scfv':
      return [
        { type: 'vh', slot: 0, side: 'heavy' },
        { type: 'vl', slot: 1, side: 'heavy' },
      ];
    case 'vhh':
      return [{ type: 'vh', slot: 0, side: 'heavy' }];
    case 'mutein':
    case 'miniprotein':
    case 'denovo':
    case 'reagent':
      return [{ type: 'payload', slot: 0, side: 'heavy' }];
    default:
      return [];
  }
}

/**
 * Arms run up and outward from the Fc, so slot 0 sits at the outer tip and the
 * light-chain lane is offset perpendicular to the arm axis.
 */
function domainPos(arm: ArmId, spec: DomainSpec) {
  const dir = dirOf(arm);
  const lane = spec.side === 'light' ? 14 : 0;
  return {
    cx: CENTER + dir * (54 - spec.slot * 25) + dir * lane,
    cy: 30 + spec.slot * 22 + lane,
    rot: dir * 45,
  };
}

interface GlyphTarget {
  chain?: ChainDesign;
  slotIndex: number;
}

function findSlot(chain: ChainDesign | undefined, type: PartType): number {
  return chain ? chain.slots.findIndex((s) => s.type === type) : -1;
}

export function DesignPad() {
  const state = useApp();
  const dispatch = useDispatch();
  const [overArm, setOverArm] = useState<ArmId | null>(null);
  const flashTimer = useRef<number | null>(null);
  const verdict = symmetry(state.format, state.chains, state.registry);

  function flash(chainId: string) {
    dispatch({ type: 'flash-chain', chainId });
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(
      () => dispatch({ type: 'flash-chain', chainId: null }),
      700,
    );
  }

  function armChains(arm: ArmId) {
    const design = state.format.arms[arm];
    return {
      design,
      heavy: design.heavyChainId ? state.chains[design.heavyChainId] : undefined,
      light: design.lightChainId ? state.chains[design.lightChainId] : undefined,
    };
  }

  function glyphTarget(arm: ArmId, spec: DomainSpec): GlyphTarget {
    const { design, heavy, light } = armChains(arm);
    // Single-chain formats keep every domain on the heavy-side chain.
    const chain = bbDef(design.bb).needsLightChain && spec.side === 'light' ? light : heavy;
    return { chain, slotIndex: findSlot(chain, spec.type) };
  }

  function colorFor(type: PartType, chain: ChainDesign | undefined): string {
    if (state.padColor === 'part') return COLORS[type];
    const carriesTarget = type === 'vh' || type === 'vl' || type === 'payload';
    return carriesTarget ? targetColor(chainTarget(chain, state.registry)) : NEUTRAL_DOMAIN;
  }

  function isSelected(chain: ChainDesign | undefined, slotIndex: number) {
    return (
      !!chain && state.activeSlot?.chainId === chain.id && state.activeSlot.slotIndex === slotIndex
    );
  }

  function handleDomainDrop(e: DragEvent<SVGElement>, target: GlyphTarget, type: PartType) {
    const blockId = e.dataTransfer.getData(PART_DRAG_TYPE);
    if (!blockId || !target.chain || target.slotIndex < 0) return;
    e.preventDefault();
    const block = state.registry.blocks[blockId];
    if (!block || block.type !== type) return;
    dispatch({
      type: 'place-block',
      chainId: target.chain.id,
      slotIndex: target.slotIndex,
      blockId,
      stack: e.shiftKey,
    });
  }

  function selectDomain(target: GlyphTarget) {
    if (!target.chain || target.slotIndex < 0) return;
    dispatch({ type: 'select-component', chainId: target.chain.id, slotIndex: target.slotIndex });
    flash(target.chain.id);
  }

  interface DomainShapeProps {
    target: GlyphTarget;
    type: PartType;
    cx: number;
    cy: number;
    w: number;
    h: number;
    rot: number;
  }

  /** One domain: a drop target, a selection handle and a live readout in one. */
  function Domain({ target, type, cx, cy, w, h, rot }: DomainShapeProps) {
    const chain = target.chain;
    const slot = chain && target.slotIndex >= 0 ? chain.slots[target.slotIndex] : undefined;
    if (!slot) return null;
    const block = slot.blockIds[0] ? state.registry.blocks[slot.blockIds[0]] : undefined;
    const fromVector = chain ? suppliedByVector(chain, state.registry).includes(type) : false;
    const filled = !!block || fromVector;
    const selected = isSelected(chain, target.slotIndex);
    const color = colorFor(type, chain);

    return (
      <rect
        x={cx - w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={Math.min(w, h) / 2}
        fill={filled ? color : 'none'}
        fillOpacity={block ? 1 : fromVector ? 0.32 : 1}
        stroke={selected ? 'var(--border-accent)' : filled ? color : 'var(--border-strong)'}
        strokeWidth={selected ? 2.4 : 1.4}
        strokeDasharray={filled ? undefined : '3 3'}
        transform={`rotate(${rot} ${cx} ${cy})`}
        style={{ cursor: 'pointer' }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(PART_DRAG_TYPE)) e.preventDefault();
        }}
        onDrop={(e) => handleDomainDrop(e, target, type)}
        onClick={() => selectDomain(target)}
      >
        <title>
          {`${PART_LABELS[type]} — ${chain?.name ?? 'unassigned'}: ${
            block?.name ?? (fromVector ? 'supplied by backbone' : 'empty')
          }${block ? ` · ${lengthIn(block.lengthBp, state.alphabet)}` : ''}${
            slot.blockIds.length > 1 ? ` (+${slot.blockIds.length - 1} stacked)` : ''
          }`}
        </title>
      </rect>
    );
  }

  /** Shape-only silhouette of a building block, drawn at format zoom. */
  function BbGlyph({ arm }: { arm: ArmId }) {
    const dir = dirOf(arm);
    const x = CENTER + dir * 44;
    const y = 74;
    const { design, heavy } = armChains(arm);
    const def = bbDef(design.bb);
    const empty = design.bb === 'empty';
    const color = state.padColor === 'part' ? COLORS.vh : targetColor(chainTarget(heavy, state.registry));
    const focused = state.focusChainId === design.heavyChainId;
    const fill = {
      fill: empty ? 'none' : color,
      stroke: empty ? 'var(--border-strong)' : focused ? 'var(--border-accent)' : color,
      strokeWidth: focused ? 2.4 : 1.4,
      strokeDasharray: empty ? '4 3' : undefined,
    };

    const shapes: Record<BbShape, ReactElement> = {
      fab: (
        <g {...fill}>
          <rect x={x - 21} y={y - 44} width={18} height={26} rx={9} />
          <rect x={x + 3} y={y - 44} width={18} height={26} rx={9} />
          <rect x={x - 21} y={y - 18} width={18} height={22} rx={9} fillOpacity={0.45} />
          <rect x={x + 3} y={y - 18} width={18} height={22} rx={9} fillOpacity={0.45} />
        </g>
      ),
      crossfab: (
        <g {...fill}>
          <rect x={x - 21} y={y - 44} width={18} height={26} rx={9} />
          <rect x={x + 3} y={y - 44} width={18} height={26} rx={9} />
          <rect x={x - 21} y={y - 18} width={18} height={22} rx={9} fillOpacity={0.45} />
          <rect x={x + 3} y={y - 18} width={18} height={22} rx={9} fillOpacity={0.45} />
          <line x1={x - 14} y1={y - 16} x2={x + 14} y2={y + 2} stroke="var(--surface-2)" strokeWidth={2.5} />
        </g>
      ),
      scfv: (
        <g {...fill}>
          <rect x={x - 10} y={y - 46} width={20} height={20} rx={9} />
          <rect x={x - 10} y={y - 22} width={20} height={20} rx={9} fillOpacity={0.55} />
          <line x1={x} y1={y - 26} x2={x} y2={y - 22} stroke="var(--border-strong)" strokeWidth={1.2} />
        </g>
      ),
      single: (
        <g {...fill}>
          <rect x={x - 11} y={y - 40} width={22} height={24} rx={11} />
        </g>
      ),
      ball: (
        <g {...fill}>
          <circle cx={x} cy={y - 28} r={14} />
        </g>
      ),
      wedge: (
        <g {...fill}>
          <path d={`M ${x} ${y - 44} L ${x + 14} ${y - 14} L ${x - 14} ${y - 14} Z`} />
        </g>
      ),
      flag: (
        <g {...fill}>
          <path d={`M ${x - 10} ${y - 40} h 20 v 16 l -10 8 l -10 -8 Z`} />
        </g>
      ),
      stem: <g {...fill} />,
      none: (
        <g {...fill}>
          <rect x={x - 16} y={y - 40} width={32} height={26} rx={9} />
        </g>
      ),
    };

    return (
      <g
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(BB_DRAG_TYPE)) {
            e.preventDefault();
            setOverArm(arm);
          }
        }}
        onDragLeave={() => setOverArm(null)}
        onDrop={(e) => handleArmDrop(e, arm)}
        onClick={() =>
          design.heavyChainId && dispatch({ type: 'focus-chain', chainId: design.heavyChainId })
        }
        style={{ cursor: 'pointer' }}
      >
        {overArm === arm && (
          <rect
            x={x - 27}
            y={y - 50}
            width={54}
            height={62}
            rx={10}
            fill="var(--bg-accent)"
            stroke="var(--border-accent)"
            strokeDasharray="4 3"
          />
        )}
        {/* Fusion by proximity: the connection down into the Fc scaffold. */}
        <line x1={x} y1={y + 4} x2={CENTER + dir * 12} y2={FC_TOP} stroke="var(--border-strong)" strokeWidth={1.3} />
        {shapes[def.shape]}
        <text x={x} y={y + 16} textAnchor="middle" fontSize="8.5" fill="var(--text-secondary)">
          {def.label}
        </text>
        {design.fused.map((kind, i) => (
          <g key={kind}>
            <rect
              x={x - 9}
              y={y + 22 + i * 12}
              width={18}
              height={9}
              rx={2}
              fill={COLORS.tag}
              fillOpacity={0.85}
            />
            <title>{`${bbDef(kind).label} fused to this arm`}</title>
          </g>
        ))}
        <title>{`${def.label} — ${def.description}`}</title>
      </g>
    );
  }

  function handleArmDrop(e: DragEvent<SVGElement>, arm: ArmId) {
    setOverArm(null);
    const kind = e.dataTransfer.getData(BB_DRAG_TYPE) as BbKind;
    if (!kind) return;
    e.preventDefault();
    if (bbDef(kind).fusesOnly) {
      if (canFuse(kind, state.format.arms[arm].bb)) dispatch({ type: 'fuse-bb', arm, bb: kind });
      return;
    }
    dispatch({ type: 'set-arm-bb', arm, bb: kind });
  }

  const formatRecord = state.format.formatId
    ? state.registry.formats[state.format.formatId]
    : undefined;

  return (
    <div className="panel">
      <p className="panel-title">
        Design pad
        <span className="count">{formatRecord ? formatRecord.id : 'unregistered format'}</span>
      </p>

      <div className="pad-controls">
        <div className="seg">
          {(['format', 'domain'] as const).map((z) => (
            <button
              key={z}
              className={state.padZoom === z ? 'active' : ''}
              title={
                z === 'format'
                  ? 'Building blocks as shapes — the format level'
                  : 'Individual domains, each a drop target'
              }
              onClick={() => dispatch({ type: 'set-pad-zoom', zoom: z })}
            >
              {z === 'format' ? 'Format' : 'Domain'}
            </button>
          ))}
        </div>
        <div className="seg">
          {(['target', 'part'] as const).map((c) => (
            <button
              key={c}
              className={state.padColor === c ? 'active' : ''}
              title={
                c === 'target'
                  ? 'Color by sequence / target, the BioGlyph convention'
                  : 'Color by part category, per the color taxonomy'
              }
              onClick={() => dispatch({ type: 'set-pad-color', mode: c })}
            >
              {c === 'target' ? 'By target' : 'By part'}
            </button>
          ))}
        </div>
      </div>

      <div className="bb-palette">
        {BB_LIBRARY.filter((b) => b.kind !== 'empty' && b.kind !== 'fc').map((def) => (
          <button
            key={def.kind}
            className="bb-chip"
            draggable
            title={`${def.description}${def.fusesOnly ? ' — fuses onto an existing block' : ''}`}
            onDragStart={(e) => {
              e.dataTransfer.setData(BB_DRAG_TYPE, def.kind);
              e.dataTransfer.effectAllowed = 'copy';
            }}
          >
            {def.label}
          </button>
        ))}
      </div>

      <svg className="pad" viewBox="0 0 220 210" role="img" aria-label="Molecule design pad">
        {/* The Y-axis through the Fc: the line symmetry is judged against. */}
        <line
          x1={CENTER}
          y1={6}
          x2={CENTER}
          y2={204}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray="2 4"
        />

        {state.padZoom === 'format' ? (
          <>
            <BbGlyph arm="left" />
            <BbGlyph arm="right" />
          </>
        ) : (
          (['left', 'right'] as ArmId[]).map((arm) => {
            const dir = dirOf(arm);
            const layout = domainLayout(state.format.arms[arm].bb);
            const inner = layout.reduce((max, s) => Math.max(max, s.slot), 0);
            const innerPos = domainPos(arm, { type: 'vh', slot: inner, side: 'heavy' });
            return (
              <g key={arm}>
                {/* The arm axis, from its innermost domain down to the Fc. */}
                {layout.length > 0 && (
                  <line
                    x1={innerPos.cx}
                    y1={innerPos.cy}
                    x2={CENTER + dir * 12}
                    y2={FC_TOP}
                    stroke="var(--border-strong)"
                    strokeWidth={1.2}
                  />
                )}
                {layout.map((spec) => {
                  const pos = domainPos(arm, spec);
                  return (
                    <Domain
                      key={`${spec.type}-${spec.slot}-${spec.side}`}
                      target={glyphTarget(arm, spec)}
                      type={spec.type}
                      cx={pos.cx}
                      cy={pos.cy}
                      w={25}
                      h={11}
                      rot={pos.rot}
                    />
                  );
                })}
                <Domain
                  target={{ chain: armChains(arm).heavy, slotIndex: findSlot(armChains(arm).heavy, 'hinge') }}
                  type="hinge"
                  cx={CENTER + dir * 13}
                  cy={98}
                  w={22}
                  h={10}
                  rot={dir * 58}
                />
              </g>
            );
          })
        )}

        {/* The Fc is a dimer: CH2 and CH3 each render once per heavy chain. */}
        {(['ch2', 'ch3'] as const).map((type, row) =>
          (['left', 'right'] as ArmId[]).map((arm) => {
            const heavy = armChains(arm).heavy;
            return (
              <Domain
                key={`${type}-${arm}`}
                target={{ chain: heavy, slotIndex: findSlot(heavy, type) }}
                type={type}
                cx={CENTER + dirOf(arm) * 12}
                cy={132 + row * 38}
                w={18}
                h={32}
                rot={0}
              />
            );
          }),
        )}

        <text x={CENTER} y={204} textAnchor="middle" fontSize="8.5" fill="var(--text-muted)">
          {verdict.fc === 'none' ? 'Fc' : `${verdict.fc} Fc`}
        </text>
      </svg>

      <div className={`status-banner ${verdict.symmetric ? 'pass' : 'warn'}`}>{verdict.detail}</div>

      <div className="kv">
        <span>Format</span>
        <span>{formatRecord?.name ?? 'not registered'}</span>
      </div>

      <div className="toolbar" style={{ marginTop: 8, marginBottom: 0 }}>
        <button className="btn primary" onClick={() => dispatch({ type: 'register-format' })}>
          {formatRecord ? 'Re-check format identity' : 'Register format'}
        </button>
        {(['left', 'right'] as ArmId[]).map((arm) => (
          <button
            key={arm}
            className="btn"
            disabled={!state.format.arms[arm].fused.length}
            title="Remove blocks fused onto this arm"
            onClick={() => dispatch({ type: 'set-arm-bb', arm, bb: state.format.arms[arm].bb })}
          >
            Clear {arm} fusions
          </button>
        ))}
      </div>

      <p className="pair-note">
        Drag a building block onto an arm to fuse it there; drag a sequence component from the
        registry straight onto a domain. Shape is the building block, color is the sequence it
        carries. Symmetry across the Fc decides homodimer against heterodimer, and registering a
        format that already exists reuses its identifier rather than minting a new one.
      </p>
    </div>
  );
}
