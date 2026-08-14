import { useRef, useState, type DragEvent } from 'react';
import { Panel } from './Panel';
import { BB_LIBRARY, bbDef, canFuse, chainTarget, symmetry } from '../model/bioglyph';
import {
  ARM_TILT,
  BAR_T,
  CORNER_R,
  COL_PITCH,
  DOMAIN_H,
  DOMAIN_W,
  FC,
  GAP,
  GLYPH_STROKE,
  HINGE_ORANGE,
  LOZENGE_R,
  NEUTRAL,
  PAD_VIEW,
  SELECTION,
  STAPLE_GRAY,
  STAPLE_W,
  STEM_GRAY,
  STEM_W,
  STROKE_W,
  TARGET_SLOTS,
  U,
  armAnchor,
  cellBox,
  colX,
  domainPath,
  lattice,
  latticeBox,
  rowTop,
  slotColors,
  staplePath,
  targetSlots,
  type Box,
  type Cell,
  type ColorPair,
  type Lattice,
} from '../model/dpad';
import { COLORS, PART_LABELS, lengthIn } from '../model/parts';
import { armsNeedingLight, lightChainMode, moleculeName, moleculeReadiness } from '../model/molecule';
import { suppliedByVector } from '../model/combinatorics';
import { useApp, useDispatch } from '../state/store';
import { PART_DRAG_TYPE } from './RegistryRail';
import type { ArmId, BbKind, ChainDesign, PartType } from '../model/types';

export const BB_DRAG_TYPE = 'application/x-msab-bb';

/**
 * The BioGlyph Design Pad (docs.bioglyph.app), drawn to the proportions
 * measured from the published pad: one rounded-rectangle primitive per domain,
 * notched for variable domains, composed into blocks on a flat dark canvas.
 * Shape is the building block, colour is the target, and the Fc's two shades
 * are what homodimer against heterodimer looks like.
 *
 * Every domain stays a drop target and a selection handle, so the faithful
 * drawing is also the working interface.
 */

/**
 * Whether the arms share a light chain is a real design decision — a common
 * light chain trades away each site's native VL to remove mispairing — so the
 * pad offers it rather than applying it.
 */
const LIGHT_MODES: Array<{ mode: 'common' | 'per-arm'; label: string; tip: string }> = [
  {
    mode: 'common',
    label: 'Common',
    tip: 'Pair both arms with one light chain. Nothing can mispair, but the same VL has to work in both binding sites.',
  },
  {
    mode: 'per-arm',
    label: 'One per arm',
    tip: 'Give each arm its own light chain, minting one where an arm has none. Each site keeps its native VL, and light-chain mispairing has to be solved another way.',
  },
];

const EMPTY_STROKE = 0.028 * DOMAIN_W;
const FC_BOTTOM = FC.top + 2 * DOMAIN_H + GAP;
/** Hinge bars: 7.3u long, 3u and 4u above the CH2 top edge. */
const BAR_LEN = 7.3 * U;
const BAR_LOW = FC.top - 3 * U;
const BAR_HIGH = FC.top - 4 * U;

interface SlotRef {
  chain?: ChainDesign;
  slotIndex: number;
}

export function DesignPad() {
  const state = useApp();
  const dispatch = useDispatch();
  const [overArm, setOverArm] = useState<ArmId | null>(null);
  const [zoom, setZoom] = useState(1);
  const flashTimer = useRef<number | null>(null);

  const verdict = symmetry(state.format, state.chains, state.registry);
  const slots = targetSlots(state.format, state.chains, state.registry);
  const formatRecord = state.format.formatId
    ? state.registry.formats[state.format.formatId]
    : undefined;
  const molecule = state.format.moleculeId
    ? state.registry.molecules[state.format.moleculeId]
    : undefined;
  const needLight = armsNeedingLight(state.format);
  const lightMode = lightChainMode(state.format);
  const lightChains = Object.values(state.chains).filter((c) => c.kind === 'light');
  const readiness = moleculeReadiness(state.format, state.chains);

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

  function armPair(arm: ArmId): ColorPair {
    const { heavy } = armChains(arm);
    const target = chainTarget(heavy, state.registry);
    return slotColors(target ? slots.get(target) : undefined);
  }

  function slotRef(arm: ArmId, type: PartType, side: 'heavy' | 'light'): SlotRef {
    const { design, heavy, light } = armChains(arm);
    const chain = bbDef(design.bb).needsLightChain && side === 'light' ? light : heavy;
    return { chain, slotIndex: chain ? chain.slots.findIndex((s) => s.type === type) : -1 };
  }

  function isSelected(ref: SlotRef) {
    return (
      !!ref.chain &&
      state.activeSlot?.chainId === ref.chain.id &&
      state.activeSlot.slotIndex === ref.slotIndex
    );
  }

  function select(ref: SlotRef) {
    if (!ref.chain || ref.slotIndex < 0) return;
    dispatch({ type: 'select-component', chainId: ref.chain.id, slotIndex: ref.slotIndex });
    flash(ref.chain.id);
  }

  function dropPart(e: DragEvent<SVGElement>, ref: SlotRef, type: PartType) {
    const blockId = e.dataTransfer.getData(PART_DRAG_TYPE);
    if (!blockId || !ref.chain || ref.slotIndex < 0) return;
    e.preventDefault();
    e.stopPropagation();
    const block = state.registry.blocks[blockId];
    if (!block || block.type !== type) return;
    dispatch({
      type: 'place-block',
      chainId: ref.chain.id,
      slotIndex: ref.slotIndex,
      blockId,
      stack: e.shiftKey,
    });
  }

  function dropBlock(e: DragEvent<SVGElement>, arm: ArmId) {
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

  /** One domain: outline, fill state, drop target and selection handle. */
  function Domain({
    box,
    cell,
    arm,
    pair,
  }: {
    box: Box;
    cell: Cell;
    arm: ArmId;
    pair: ColorPair;
  }) {
    const ref = slotRef(arm, cell.type, cell.side);
    const slot = ref.chain && ref.slotIndex >= 0 ? ref.chain.slots[ref.slotIndex] : undefined;
    const block = slot?.blockIds[0] ? state.registry.blocks[slot.blockIds[0]] : undefined;
    const fromVector = ref.chain
      ? suppliedByVector(ref.chain, state.registry).includes(cell.type)
      : false;
    const color =
      state.padColor === 'part' ? COLORS[cell.type] : cell.col === 0 ? pair.base : pair.tint;
    const filled = !!block || fromVector;
    const selected = isSelected(ref);
    const d = domainPath(box, cell.lozenge ? LOZENGE_R : CORNER_R, cell.notch);

    const tip = `${PART_LABELS[cell.type]} — ${ref.chain?.name ?? 'no chain'}: ${
      block?.name ?? (fromVector ? 'supplied by the backbone' : 'empty')
    }${block ? ` · ${lengthIn(block.lengthBp, state.alphabet)}` : ''}${
      slot && slot.blockIds.length > 1 ? ` (+${slot.blockIds.length - 1} stacked)` : ''
    }`;

    return (
      <g
        data-tip={tip}
        style={{ cursor: 'pointer' }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(PART_DRAG_TYPE)) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onDrop={(e) => dropPart(e, ref, cell.type)}
        onClick={(e) => {
          e.stopPropagation();
          select(ref);
        }}
      >
        {selected && (
          <path d={d} fill="none" stroke={SELECTION} strokeWidth={STROKE_W * 4} opacity={0.9} />
        )}
        <path
          d={d}
          fill={filled ? color : 'none'}
          fillOpacity={block ? 1 : fromVector ? 0.45 : 1}
          stroke={filled ? GLYPH_STROKE : color}
          strokeWidth={filled ? STROKE_W : EMPTY_STROKE}
        />
      </g>
    );
  }

  /** A building block: its domain lattice, stems, disulfide or linker staple. */
  function Block({ arm, l, pair }: { arm: ArmId; l: Lattice; pair: ColorPair }) {
    return (
      <>
        {/* Stems bridge the gap between rows, on each column centre. */}
        {l.rows > 1 &&
          Array.from({ length: l.cols }, (_, col) => (
            <line
              key={`stem-${col}`}
              x1={colX(col)}
              y1={rowTop(0, l.rows) + DOMAIN_H}
              x2={colX(col)}
              y2={rowTop(1, l.rows)}
              stroke={STEM_GRAY}
              strokeWidth={STEM_W}
            />
          ))}

        {l.cells.map((cell) => (
          <Domain
            key={`${cell.type}-${cell.col}-${cell.row}`}
            box={cellBox(cell, l.rows)}
            cell={cell}
            arm={arm}
            pair={pair}
          />
        ))}

        {/* The interchain disulfide, one unit above the bottom edge. */}
        {l.disulfide && (
          <rect
            x={DOMAIN_W / 2}
            y={-U - BAR_T / 2}
            width={COL_PITCH - DOMAIN_W}
            height={BAR_T}
            fill={HINGE_ORANGE}
          />
        )}

        {l.staple && (
          <path
            d={staplePath(l.rows)}
            fill="none"
            stroke={STAPLE_GRAY}
            strokeWidth={STAPLE_W}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </>
    );
  }

  function Arm({ arm }: { arm: ArmId }) {
    const { design } = armChains(arm);
    const anchor = armAnchor(arm);
    const l = lattice(design.bb);
    const pair = armPair(arm);
    const empty = design.bb === 'empty';
    const box = latticeBox(empty ? lattice('fab') : l);

    return (
      <g>
        {/* The stem leaves the block along the arm axis, then turns vertical. */}
        {!empty && (
          <path
            d={`M ${anchor.origin.x} ${anchor.origin.y} L ${anchor.elbow.x} ${anchor.elbow.y} L ${anchor.stem.x} ${anchor.stem.y}`}
            fill="none"
            stroke={STEM_GRAY}
            strokeWidth={STEM_W}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        <g
          transform={`translate(${anchor.origin.x} ${anchor.origin.y}) rotate(${anchor.tilt})${
            anchor.mirror ? ' scale(-1,1)' : ''
          }`}
          data-tip={
            empty
              ? `Empty ${arm} arm — drag a building block from the palette onto it`
              : `${bbDef(design.bb).label} on the ${arm} arm — ${bbDef(design.bb).description}`
          }
          style={{ cursor: 'pointer' }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(BB_DRAG_TYPE)) {
              e.preventDefault();
              setOverArm(arm);
            }
          }}
          onDragLeave={() => setOverArm(null)}
          onDrop={(e) => dropBlock(e, arm)}
          onClick={() =>
            design.heavyChainId && dispatch({ type: 'focus-chain', chainId: design.heavyChainId })
          }
        >
          {(overArm === arm || empty) && (
            <rect
              x={box.x - GAP / 2}
              y={box.y - GAP / 2}
              width={box.w + GAP}
              height={box.h + GAP}
              rx={CORNER_R * 2}
              fill={overArm === arm ? 'rgba(124, 221, 206, 0.12)' : 'none'}
              stroke={overArm === arm ? SELECTION : '#4B4B4B'}
              strokeWidth={STROKE_W * 1.5}
              strokeDasharray={overArm === arm ? undefined : `${GAP / 2} ${GAP / 2}`}
            />
          )}

          {!empty && <Block arm={arm} l={l} pair={pair} />}

          {/* Fused blocks stack N-terminally in the tint column channel. */}
          {design.fused.map((kind, i) => {
            const fw = DOMAIN_W * 0.6;
            const fh = DOMAIN_H * 0.55;
            const bottom = rowTop(0, Math.max(l.rows, 1)) - GAP - i * (fh + GAP);
            const fused: Box = { x: colX(1) - fw / 2, y: bottom - fh, w: fw, h: fh };
            return (
              <g key={kind} data-tip={`${bbDef(kind).label} fused onto this arm`}>
                <line
                  x1={colX(1)}
                  y1={bottom}
                  x2={colX(1)}
                  y2={bottom + GAP}
                  stroke={STEM_GRAY}
                  strokeWidth={STEM_W}
                />
                <path
                  d={domainPath(fused, LOZENGE_R * 0.6, false)}
                  fill={COLORS.tag}
                  stroke={GLYPH_STROKE}
                  strokeWidth={STROKE_W}
                />
              </g>
            );
          })}
        </g>
      </g>
    );
  }

  /** The Fc: two grey columns, plus the double orange hinge above them. */
  function Fc() {
    const l = lattice('fc');
    const homodimer = verdict.fc !== 'heterodimer';
    const hingeSet = (['left', 'right'] as ArmId[]).every((arm) => {
      const ref = slotRef(arm, 'hinge', 'heavy');
      const slot = ref.chain && ref.slotIndex >= 0 ? ref.chain.slots[ref.slotIndex] : undefined;
      return !!slot?.blockIds.length;
    });

    return (
      <g>
        <g transform={`translate(${FC.cx - COL_PITCH / 2} ${FC_BOTTOM})`}>
          {Array.from({ length: 2 }, (_, col) => (
            <line
              key={col}
              x1={colX(col)}
              y1={rowTop(0, 2) + DOMAIN_H}
              x2={colX(col)}
              y2={rowTop(1, 2)}
              stroke={STEM_GRAY}
              strokeWidth={STEM_W}
            />
          ))}
          {l.cells.map((cell) => (
            <Domain
              key={`${cell.type}-${cell.col}`}
              box={cellBox(cell, l.rows)}
              cell={{ ...cell, col: homodimer ? 0 : cell.col }}
              arm={cell.col === 0 ? 'left' : 'right'}
              pair={NEUTRAL}
            />
          ))}
        </g>

        {/* Each stem carries one heavy chain's hinge. */}
        {(['left', 'right'] as ArmId[]).map((arm) => {
          const ref = slotRef(arm, 'hinge', 'heavy');
          const slot = ref.chain && ref.slotIndex >= 0 ? ref.chain.slots[ref.slotIndex] : undefined;
          const block = slot?.blockIds[0] ? state.registry.blocks[slot.blockIds[0]] : undefined;
          const x = FC.cx + (arm === 'left' ? -1 : 1) * (COL_PITCH / 2);
          return (
            <g
              key={arm}
              data-tip={`Hinge on the ${arm} heavy chain: ${block?.name ?? 'empty'}`}
              style={{ cursor: 'pointer' }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(PART_DRAG_TYPE)) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              onDrop={(e) => dropPart(e, ref, 'hinge')}
              onClick={(e) => {
                e.stopPropagation();
                select(ref);
              }}
            >
              <line
                x1={x}
                y1={FC.top}
                x2={x}
                y2={BAR_HIGH - U}
                stroke={isSelected(ref) ? SELECTION : STEM_GRAY}
                strokeWidth={isSelected(ref) ? STEM_W * 1.8 : STEM_W}
              />
              <rect x={x - U} y={BAR_HIGH - U} width={2 * U} height={4 * U} fill="transparent" />
            </g>
          );
        })}

        {[BAR_HIGH, BAR_LOW].map((y) => (
          <rect
            key={y}
            x={FC.cx - BAR_LEN / 2}
            y={y - BAR_T / 2}
            width={BAR_LEN}
            height={BAR_T}
            fill={HINGE_ORANGE}
            opacity={hingeSet ? 1 : 0.4}
          />
        ))}
      </g>
    );
  }

  const view = {
    w: PAD_VIEW.w / zoom,
    h: PAD_VIEW.h / zoom,
  };
  const viewBox = `${(PAD_VIEW.w - view.w) / 2} ${(PAD_VIEW.h - view.h) / 2} ${view.w} ${view.h}`;

  const chips = [...slots.entries()].sort((a, b) => a[1] - b[1]);

  return (
    <Panel
      title="Design pad"
      tip="The molecule itself, drawn to BioGlyph's conventions: shape is the building block, colour is the target, and the Fc's two shades are homodimer against heterodimer"
      trailing={molecule ? molecule.id : formatRecord ? formatRecord.id : 'unregistered'}
    >
      <div className="bb-rail">
        {BB_LIBRARY.filter((def) => def.kind !== 'empty' && def.kind !== 'fc').map((def) => (
          <button
            key={def.kind}
            className="bb-card"
            draggable
            data-tip={`${def.description}${
              def.fusesOnly
                ? ' — drag it onto a block already on the pad to fuse it there'
                : ' — drag it onto either arm to place it'
            }`}
            onDragStart={(e) => {
              e.dataTransfer.setData(BB_DRAG_TYPE, def.kind);
              e.dataTransfer.effectAllowed = 'copy';
            }}
          >
            <PaletteGlyph bb={def.kind} />
            <span>{def.label}</span>
          </button>
        ))}
      </div>

      <div className="dpad">
        <svg
          className="dpad-canvas"
          viewBox={viewBox}
          role="img"
          aria-label="BioGlyph design pad"
        >
          <Fc />
          <Arm arm="left" />
          <Arm arm="right" />
        </svg>

        {chips.length > 0 && (
          <div className="dpad-chips">
            {chips.map(([target, slot]) => (
              <span
                key={target}
                className="dpad-chip"
                style={{ background: slotColors(slot).base }}
                data-tip={`Target ${String.fromCharCode(65 + slot)}: every domain binding ${target} carries this colour`}
              >
                {target}
              </span>
            ))}
          </div>
        )}

        <div className="dpad-tools">
          <button
            className="dpad-tool"
            data-tip="Zoom in"
            onClick={() => setZoom((z) => Math.min(z * 1.25, 3))}
          >
            +
          </button>
          <button
            className="dpad-tool"
            data-tip="Zoom out"
            onClick={() => setZoom((z) => Math.max(z / 1.25, 0.6))}
          >
            −
          </button>
          <button className="dpad-tool" data-tip="Fit the molecule to the pad" onClick={() => setZoom(1)}>
            ⤢
          </button>
        </div>
      </div>

      <div className={`status-banner ${verdict.symmetric ? 'pass' : 'warn'}`}>{verdict.detail}</div>

      {needLight.length > 0 && (
        <div className="lc">
          <div className="lc-head">
            <span className="lc-title">Light chain</span>
            <div className="seg">
              {LIGHT_MODES.map((m) => (
                <button
                  key={m.mode}
                  className={lightMode === m.mode ? 'active' : ''}
                  data-tip={m.tip}
                  onClick={() => dispatch({ type: 'choose-light-chain', mode: m.mode })}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {lightMode !== 'unset' && (
              <button
                className="btn"
                data-tip="Unpair the arms from their light chain, leaving the choice open again"
                onClick={() => dispatch({ type: 'choose-light-chain', mode: 'none' })}
              >
                Clear
              </button>
            )}
          </div>

          {lightMode === 'per-arm' ? (
            needLight.map((arm) => (
              <div className="lc-row" key={arm}>
                <span className="lc-arm">{arm} arm</span>
                {lightChains.map((c) => (
                  <LightChip
                    key={c.id}
                    chain={c}
                    active={state.format.arms[arm].lightChainId === c.id}
                    tip={`Pair the ${arm} arm with ${c.name}${
                      c.regIds.length ? ` (${c.regIds.join(', ')}, already in inventory)` : ''
                    }`}
                    onPick={() => dispatch({ type: 'set-arm-light-chain', arm, chainId: c.id })}
                  />
                ))}
              </div>
            ))
          ) : (
            <div className="lc-row">
              <span className="lc-arm">{lightMode === 'common' ? 'both arms' : 'not chosen'}</span>
              {lightChains.map((c) => (
                <LightChip
                  key={c.id}
                  chain={c}
                  active={lightMode === 'common' && state.format.arms[needLight[0]].lightChainId === c.id}
                  tip={`Use ${c.name} on both arms${
                    c.regIds.length ? ` (${c.regIds.join(', ')}, already in inventory)` : ''
                  }`}
                  onPick={() => dispatch({ type: 'choose-light-chain', mode: 'common', chainId: c.id })}
                />
              ))}
              <button
                className="lc-chip new"
                data-tip="Mint a new light chain on the bench and pair both arms with it"
                onClick={() => dispatch({ type: 'choose-light-chain', mode: 'common', mint: true })}
              >
                + New light chain
              </button>
            </div>
          )}
        </div>
      )}

      <div className="kv">
        <span>Format</span>
        <span>{formatRecord?.name ?? 'not registered'}</span>
      </div>

      <div className="kv">
        <span>Molecule</span>
        <span>
          {molecule
            ? `${molecule.id} · ${molecule.name}`
            : `${moleculeName(state.format, state.chains, state.registry)} · not registered`}
        </span>
      </div>

      <div className="toolbar" style={{ marginTop: 8, marginBottom: 0 }}>
        <button
          className="btn primary"
          disabled={!readiness.ready}
          data-tip={
            molecule
              ? `Already registered as ${molecule.id}; re-checking reuses that identifier`
              : readiness.ready
                ? 'Give the molecule its own identifier (MOL-id), recording which registered chains it is built from. The same molecule keeps its first MOL-id.'
                : `Register every chain first — still to register: ${
                    readiness.unregistered.map((c) => c.name).join(', ') || 'no chains on the arms yet'
                  }`
          }
          onClick={() => dispatch({ type: 'register-molecule' })}
        >
          {molecule ? 'Re-check molecule' : 'Register molecule'}
        </button>
        <button
          className="btn"
          data-tip="Give this shape a format identity (FMT-id). An identical format keeps its original identifier rather than minting a duplicate."
          onClick={() => dispatch({ type: 'register-format' })}
        >
          {formatRecord ? 'Re-check format identity' : 'Register format'}
        </button>
        <div className="seg">
          {(['target', 'part'] as const).map((c) => (
            <button
              key={c}
              className={state.padColor === c ? 'active' : ''}
              data-tip={
                c === 'target'
                  ? 'Colour by target, the BioGlyph convention: the first target in a design is blue, the second green, and each block draws its two chains as a shade and a lighter tint'
                  : 'Colour by part category instead, matching the bench and the construct map'
              }
              onClick={() => dispatch({ type: 'set-pad-color', mode: c })}
            >
              {c === 'target' ? 'By target' : 'By part'}
            </button>
          ))}
        </div>
        {(['left', 'right'] as ArmId[]).map((arm) => (
          <button
            key={arm}
            className="btn"
            disabled={!state.format.arms[arm].fused.length}
            data-tip={`Remove everything fused onto the ${arm} arm, keeping the arm's own building block`}
            onClick={() => dispatch({ type: 'set-arm-bb', arm, bb: state.format.arms[arm].bb })}
          >
            Clear {arm} fusions
          </button>
        ))}
      </div>

      <p className="pair-note">
        Domains are the same rounded box throughout, notched where the domain is variable. Drag a
        building block onto an arm to place it, or a sequence component from the registry straight
        onto a domain. Arms splay {ARM_TILT}° off vertical with the N-terminus at the top, and an
        outlined domain is one still waiting for a sequence.
      </p>
    </Panel>
  );
}

/** A light chain on the bench, offered as a pairing choice. */
function LightChip({
  chain,
  active,
  tip,
  onPick,
}: {
  chain: ChainDesign;
  active: boolean;
  tip: string;
  onPick: () => void;
}) {
  return (
    <button className={`lc-chip ${active ? 'active' : ''}`} data-tip={tip} onClick={onPick}>
      {chain.name}
      {chain.regIds.length > 0 && <span className="mono">{chain.regIds[0]}</span>}
    </button>
  );
}

/** Palette icons are drawn flat in the first target's blue, without outlines. */
function PaletteGlyph({ bb }: { bb: BbKind }) {
  const l = lattice(bb);
  const box = latticeBox(l);
  const pad = GAP;
  const pair = TARGET_SLOTS[0];

  return (
    <svg
      viewBox={`${box.x - pad} ${box.y - pad} ${box.w + pad * 2} ${box.h + pad * 2}`}
      width={40}
      height={30}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {l.rows > 1 &&
        Array.from({ length: l.cols }, (_, col) => (
          <line
            key={col}
            x1={colX(col)}
            y1={rowTop(0, l.rows) + DOMAIN_H}
            x2={colX(col)}
            y2={rowTop(1, l.rows)}
            stroke={STEM_GRAY}
            strokeWidth={STEM_W}
          />
        ))}
      {l.cells.map((cell) => (
        <path
          key={`${cell.type}-${cell.col}-${cell.row}`}
          d={domainPath(cellBox(cell, l.rows), cell.lozenge ? LOZENGE_R : CORNER_R, cell.notch)}
          fill={cell.col === 0 ? pair.base : pair.tint}
        />
      ))}
      {l.disulfide && (
        <rect
          x={DOMAIN_W / 2}
          y={-U - BAR_T / 2}
          width={COL_PITCH - DOMAIN_W}
          height={BAR_T}
          fill={HINGE_ORANGE}
        />
      )}
      {l.staple && (
        <path
          d={staplePath(l.rows)}
          fill="none"
          stroke={STAPLE_GRAY}
          strokeWidth={STAPLE_W}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
