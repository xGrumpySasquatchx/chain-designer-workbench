import { chainTarget } from './bioglyph';
import type { ArmId, BbKind, ChainDesign, FormatDesign, PartType, Registry } from './types';

/**
 * Geometry and palette for the BioGlyph design pad (docs.bioglyph.app).
 *
 * The documentation describes the pad's behaviour but specifies no geometry or
 * colour values, so the numbers here were measured from the published dPad
 * screenshots and are expressed as ratios of one primitive: every
 * immunoglobulin domain is the same rounded rectangle, 6u wide and 11u tall,
 * and every building block is a composition of it. Working in u keeps the
 * proportions exact at any rendered size.
 */

/** A sixth of a domain width. */
export const U = 10;

export const DOMAIN_W = 6 * U;
export const DOMAIN_H = 11 * U;
/** Ig domains: 0.083 · W. */
export const CORNER_R = 0.5 * U;
/** Non-Ig blocks reuse the box at 0.28 · W, which reads as a pill. */
export const LOZENGE_R = 0.28 * DOMAIN_W;
export const GAP = 2 * U;
export const COL_PITCH = 8 * U;
export const ROW_PITCH = 13 * U;

export const STROKE_W = 0.019 * DOMAIN_W;
/** Variable domains carry a notch; constant domains do not. */
export const NOTCH_W = 0.417 * DOMAIN_W;
export const NOTCH_D = 0.237 * DOMAIN_H;
export const STEM_W = 0.78 * U;
export const BAR_T = 0.22 * U;
export const STAPLE_W = 0.13 * DOMAIN_W;

/** Arms splay this far off vertical, measured across four arms in two shots. */
export const ARM_TILT = 28;

export const GLYPH_STROKE = '#0A0A0A';
export const CANVAS_BG = '#212121';
export const RAIL_BG = '#2A2A2A';
export const HINGE_ORANGE = '#F2A93B';
export const STAPLE_GRAY = '#A3A3A3';
export const STEM_GRAY = '#8F8F8F';
export const SELECTION = '#7CDDCE';

export interface ColorPair {
  base: string;
  tint: string;
}

/**
 * Targets are coloured by slot rather than by name: the first target in a
 * design is always blue, the second always green, and so on. Each block draws
 * its two chains as the base shade and a lighter tint of the same hue.
 *
 * Slots 1–3 were sampled from three screenshots that agree byte for byte. Only
 * one half of slots 4 and 5 was ever visible, so the other half is derived.
 */
export const TARGET_SLOTS: ColorPair[] = [
  { base: '#448DBF', tint: '#94CEF0' },
  { base: '#408035', tint: '#7EB672' },
  { base: '#A246A0', tint: '#C87DC7' },
  { base: '#B4744A', tint: '#DE9C6B' },
  { base: '#6F4F9E', tint: '#9E82C4' },
];

/** The Fc binds no antigen, so grey is the no-target pair. */
export const NEUTRAL: ColorPair = { base: '#8F8F8F', tint: '#D8D8D8' };

export function slotColors(slot: number | undefined): ColorPair {
  if (slot === undefined) return NEUTRAL;
  return TARGET_SLOTS[slot % TARGET_SLOTS.length];
}

/**
 * Slots are handed out in the order targets appear in the design, so a colour
 * stays with its target for as long as the design lasts.
 */
export function targetSlots(
  format: FormatDesign,
  chains: Record<string, ChainDesign>,
  registry: Registry,
): Map<string, number> {
  const slots = new Map<string, number>();
  const claim = (target: string | undefined) => {
    if (!target || slots.has(target)) return;
    slots.set(target, slots.size);
  };
  (['left', 'right'] as ArmId[]).forEach((arm) => {
    const design = format.arms[arm];
    claim(chainTarget(design.heavyChainId ? chains[design.heavyChainId] : undefined, registry));
    claim(chainTarget(design.lightChainId ? chains[design.lightChainId] : undefined, registry));
  });
  return slots;
}

export interface Cell {
  type: PartType;
  /** 0 is the base-shade column, 1 the tint column. */
  col: number;
  /** 0 is the N-terminal row, at the top. */
  row: number;
  /** Which chain document carries it. */
  side: 'heavy' | 'light';
  notch: boolean;
  lozenge: boolean;
}

export interface Lattice {
  cells: Cell[];
  cols: number;
  rows: number;
  /** The grey linker staple of the single-chain formats. */
  staple: boolean;
  /** The orange interchain disulfide bar of the two-chain Fabs. */
  disulfide: boolean;
}

function ig(type: PartType, col: number, row: number, side: 'heavy' | 'light', notch = false): Cell {
  return { type, col, row, side, notch, lozenge: false };
}

const EMPTY_LATTICE: Lattice = { cells: [], cols: 0, rows: 0, staple: false, disulfide: false };

/** Which domains a building block is made of, and where they sit. */
export function lattice(bb: BbKind): Lattice {
  switch (bb) {
    case 'fab':
      return {
        cells: [
          ig('vh', 0, 0, 'heavy', true),
          ig('vl', 1, 0, 'light', true),
          ig('ch1', 0, 1, 'heavy'),
          ig('cl', 1, 1, 'light'),
        ],
        cols: 2,
        rows: 2,
        staple: false,
        disulfide: true,
      };
    case 'xfab':
      // The crossover puts CL on the heavy chain and CH1 on the light one.
      return {
        cells: [
          ig('vh', 0, 0, 'heavy', true),
          ig('vl', 1, 0, 'light', true),
          ig('cl', 0, 1, 'heavy'),
          ig('ch1', 1, 1, 'light'),
        ],
        cols: 2,
        rows: 2,
        staple: false,
        disulfide: true,
      };
    case 'scfab':
      // One chain throughout, so the linker replaces the disulfide.
      return {
        cells: [
          ig('vh', 0, 0, 'heavy', true),
          ig('vl', 1, 0, 'heavy', true),
          ig('ch1', 0, 1, 'heavy'),
          ig('cl', 1, 1, 'heavy'),
        ],
        cols: 2,
        rows: 2,
        staple: true,
        disulfide: false,
      };
    case 'scfv':
      return {
        cells: [ig('vh', 0, 0, 'heavy', true), ig('vl', 1, 0, 'heavy', true)],
        cols: 2,
        rows: 1,
        staple: true,
        disulfide: false,
      };
    case 'vhh':
      return {
        cells: [ig('vh', 0, 0, 'heavy', true)],
        cols: 1,
        rows: 1,
        staple: false,
        disulfide: false,
      };
    case 'mutein':
    case 'miniprotein':
    case 'denovo':
    case 'reagent':
      return {
        cells: [{ type: 'payload', col: 0, row: 0, side: 'heavy', notch: false, lozenge: true }],
        cols: 1,
        rows: 1,
        staple: false,
        disulfide: false,
      };
    case 'tag':
      return {
        cells: [{ type: 'tag', col: 0, row: 0, side: 'heavy', notch: false, lozenge: true }],
        cols: 1,
        rows: 1,
        staple: false,
        disulfide: false,
      };
    case 'fc':
      return {
        cells: [
          ig('ch2', 0, 0, 'heavy'),
          ig('ch2', 1, 0, 'heavy'),
          ig('ch3', 0, 1, 'heavy'),
          ig('ch3', 1, 1, 'heavy'),
        ],
        cols: 2,
        rows: 2,
        staple: false,
        disulfide: false,
      };
    default:
      return EMPTY_LATTICE;
  }
}

/** Column centre, in a block's own coordinates. */
export function colX(col: number): number {
  return col * COL_PITCH;
}

/** Row top edge. The origin sits at the bottom of the C-terminal row. */
export function rowTop(row: number, rows: number): number {
  return -((rows - row) * DOMAIN_H + (rows - 1 - row) * GAP);
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function cellBox(cell: Cell, rows: number): Box {
  return {
    x: colX(cell.col) - DOMAIN_W / 2,
    y: rowTop(cell.row, rows),
    w: DOMAIN_W,
    h: DOMAIN_H,
  };
}

/**
 * The domain outline: a rounded rectangle, optionally interrupted by the notch
 * that marks a variable domain. All four notch corners are filleted at the
 * corner radius, and the two at the top edge are convex, which flares the
 * mouth a full corner radius wider than the slot on each side.
 */
export function domainPath(box: Box, radius: number, notch: boolean): string {
  const { x, y, w, h } = box;
  const right = x + w;
  const bottom = y + h;
  const r = Math.min(radius, w / 2, h / 2);

  const shell = [
    `H ${round(right - r)}`,
    `A ${r} ${r} 0 0 1 ${round(right)} ${round(y + r)}`,
    `V ${round(bottom - r)}`,
    `A ${r} ${r} 0 0 1 ${round(right - r)} ${round(bottom)}`,
    `H ${round(x + r)}`,
    `A ${r} ${r} 0 0 1 ${round(x)} ${round(bottom - r)}`,
    `V ${round(y + r)}`,
    `A ${r} ${r} 0 0 1 ${round(x + r)} ${round(y)}`,
    'Z',
  ];

  if (!notch) return [`M ${round(x + r)} ${round(y)}`, ...shell].join(' ');

  const cx = x + w / 2;
  const half = (NOTCH_W * (w / DOMAIN_W)) / 2;
  const depth = NOTCH_D * (h / DOMAIN_H);
  const f = r;

  return [
    `M ${round(x + r)} ${round(y)}`,
    `H ${round(cx - half - f)}`,
    `A ${f} ${f} 0 0 1 ${round(cx - half)} ${round(y + f)}`,
    `V ${round(y + depth - f)}`,
    `A ${f} ${f} 0 0 0 ${round(cx - half + f)} ${round(y + depth)}`,
    `H ${round(cx + half - f)}`,
    `A ${f} ${f} 0 0 0 ${round(cx + half)} ${round(y + depth - f)}`,
    `V ${round(y + f)}`,
    `A ${f} ${f} 0 0 1 ${round(cx + half + f)} ${round(y)}`,
    ...shell,
  ].join(' ');
}

/**
 * The linker staple: down out of the base column, up the channel between the
 * columns, then over the top edge of the tint column and into its notch.
 */
export function staplePath(rows: number): string {
  const channel = COL_PITCH / 2;
  const top = rowTop(0, rows);
  const lift = GAP * 0.6;
  return [
    `M 0 ${round(GAP * 0.6)}`,
    `H ${round(channel)}`,
    `V ${round(top - lift)}`,
    `H ${round(colX(1))}`,
    `V ${round(top + NOTCH_D * 0.6)}`,
  ].join(' ');
}

/** Local bounding box of a block, for sizing a palette icon. */
export function latticeBox(l: Lattice): Box {
  if (!l.cells.length) return { x: -DOMAIN_W / 2, y: -DOMAIN_H, w: DOMAIN_W, h: DOMAIN_H };
  const top = rowTop(0, l.rows);
  const width = colX(l.cols - 1) + DOMAIN_W;
  const lift = l.staple ? GAP : 0;
  return {
    x: -DOMAIN_W / 2,
    y: top - lift,
    w: width,
    h: -top + lift + (l.staple ? GAP : 0),
  };
}

export const PAD_VIEW = { w: 640, h: 680 };
/** The Fc sits at the bottom centre, unrotated. */
export const FC = { cx: PAD_VIEW.w / 2, top: 400 };
/**
 * The whole run from an arm's bottom edge to the CH2 top edge measures one
 * domain height, 11u: along the arm axis, then vertical from the elbow, then
 * past the hinge bars on the Fc's own stem.
 */
const ARM_RUN = 3.5 * U;
const ELBOW_DROP = 2.5 * U;
const STEM_RISE = 5 * U;

export interface ArmAnchor {
  /** Bottom of the block's inner column, where its stem leaves it. */
  origin: { x: number; y: number };
  /** Where the stem turns vertical. */
  elbow: { x: number; y: number };
  /** Top of the Fc stem it descends into. */
  stem: { x: number; y: number };
  tilt: number;
  mirror: boolean;
}

export function armAnchor(arm: ArmId): ArmAnchor {
  const dir = arm === 'left' ? -1 : 1;
  const stem = { x: FC.cx + dir * (COL_PITCH / 2), y: FC.top - STEM_RISE };
  const elbow = { x: stem.x, y: stem.y - ELBOW_DROP };
  const radians = (ARM_TILT * Math.PI) / 180;
  return {
    origin: {
      x: elbow.x + dir * Math.sin(radians) * ARM_RUN,
      y: elbow.y - Math.cos(radians) * ARM_RUN,
    },
    elbow,
    stem,
    tilt: dir * ARM_TILT,
    // The left arm is the mirror variant, so the base column always faces in.
    mirror: arm === 'left',
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
