/**
 * Rendering rules for the construct map, measured from Geneious Prime
 * screenshots (manual.geneious.com and the Geneious help centre) because the
 * documentation describes the viewer's behaviour without specifying its
 * geometry or shading. Sizes are in pixels at 1:1, which is how the Geneious
 * viewer works — bar heights and fonts stay fixed as the sequence scales.
 */

/** Annotation bar and the two rows of drop shadow under it. */
export const BAR_H = 15;
export const SHADOW_H = 2;
/** 15px bar + 2px shadow + 1px gap. */
export const ROW_PITCH = 18;
/** The arrowhead is half the bar height, so both taper edges are at 45°. */
export const HEAD = BAR_H / 2;
export const CORNER_R = 0.13 * BAR_H;
export const OUTLINE_W = 1;

export const SHADOW_NEAR = '#B5B5B5';
export const SHADOW_FAR = '#DDDDDD';
/** Zoomed out, the sequence collapses to a thin grey line the bars overlay. */
export const SEQUENCE_LINE = '#808080';
export const SEQUENCE_W = 2.5;
export const CANVAS = '#FFFFFF';
/** The name gutter is a very pale lavender. */
export const GUTTER_BG = '#F5F5FF';
export const BLOCK_RULE = '#808080';
export const RULER_TEXT = '#8A8A8A';
export const RULER_TICK_H = 3;
export const RULER_FONT = 9;
export const LABEL_FONT = 10;
export const NAME_FONT = 11;
/** Selection chrome: carets, boundary labels and the length callout. */
export const SELECT_BLUE = '#0605FA';
export const SELECT_FILL = '#EAF2FD';
export const SELECT_BORDER = '#4384BD';
export const CARET = '#808080';

/** Circular view: a black backbone with the annotation band centred on it. */
export const RING_STROKE = '#000000';
export const RING_W = 3;
export const BAND_H = 15;

interface Hsv {
  h: number;
  s: number;
  v: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${((1 << 24) | (clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).slice(1)}`;
}

function rgbToHsv(r: number, g: number, b: number): Hsv {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : d / max, v: max / 255 };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const table: Array<[number, number, number]> = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = table[Math.floor((h % 360) / 60)];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export interface Shading {
  top: string;
  mid: string;
  bottom: string;
  outline: string;
}

/**
 * Fills are flat-hued but shaded top to bottom: the brightest stop is about
 * 1.21× the base value with the saturation pulled down, the base colour lands
 * at 45% depth, and the bottom sits at about 0.78× the value at full
 * saturation. The 1px outline is a darker shade of the fill rather than grey.
 */
export function shading(base: string): Shading {
  const [r, g, b] = hexToRgb(base);
  const hsv = rgbToHsv(r, g, b);
  return {
    top: hsvToHex({ h: hsv.h, s: hsv.s * 0.55, v: Math.min(1, hsv.v * 1.21) }),
    mid: base,
    bottom: hsvToHex({ h: hsv.h, s: Math.min(1, hsv.s * 1.05), v: hsv.v * 0.78 }),
    outline: hsvToHex({ h: hsv.h, s: Math.min(1, hsv.s * 1.05), v: hsv.v * 0.6 }),
  };
}

/**
 * Everything outside the selection is drawn at half alpha over white, which is
 * how Geneious shows what is selected: c' = 128 + c/2.
 */
export function dim(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(128 + r / 2, 128 + g / 2, 128 + b / 2);
}

/** Label text inside a bar is black or white, whichever the fill can carry. */
export function textOn(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#000000' : '#FFFFFF';
}

/**
 * The annotation outline: a rectangle with one triangular point on the
 * directional end, the flat end barely rounded.
 */
export function arrowPath(x: number, y: number, w: number, strand: 1 | -1, h = BAR_H): string {
  const head = Math.min(h / 2, w);
  const r = Math.min(CORNER_R, (w - head) / 2, h / 2);
  const bottom = y + h;
  const mid = y + h / 2;

  if (strand === 1) {
    const bodyEnd = x + w - head;
    return [
      `M ${round(x + r)} ${round(y)}`,
      `H ${round(bodyEnd)}`,
      `L ${round(x + w)} ${round(mid)}`,
      `L ${round(bodyEnd)} ${round(bottom)}`,
      `H ${round(x + r)}`,
      `A ${r} ${r} 0 0 1 ${round(x)} ${round(bottom - r)}`,
      `V ${round(y + r)}`,
      `A ${r} ${r} 0 0 1 ${round(x + r)} ${round(y)}`,
      'Z',
    ].join(' ');
  }

  const bodyStart = x + head;
  return [
    `M ${round(x + w - r)} ${round(y)}`,
    `H ${round(bodyStart)}`,
    `L ${round(x)} ${round(mid)}`,
    `L ${round(bodyStart)} ${round(bottom)}`,
    `H ${round(x + w - r)}`,
    `A ${r} ${r} 0 0 0 ${round(x + w)} ${round(bottom - r)}`,
    `V ${round(y + r)}`,
    `A ${r} ${r} 0 0 0 ${round(x + w - r)} ${round(y)}`,
    'Z',
  ].join(' ');
}

/** Ruler numbers carry thousands separators; values under 1000 print bare. */
export function coordinate(bp: number): string {
  return bp.toLocaleString('en-US');
}

/** Rough advance width for a UI sans, used to decide inside vs outside labels. */
export function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.55;
}

/**
 * Geneious moves a label outside rather than clipping it, but block names here
 * run longer than any feature name in its screenshots, so an outside label that
 * would leave the canvas is shortened.
 */
export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export interface Polar {
  x: number;
  y: number;
  /** Degrees clockwise from twelve o'clock, where position 1 sits. */
  deg: number;
}

export function polar(bp: number, totalBp: number, radius: number, cx: number, cy: number): Polar {
  const deg = (bp / totalBp) * 360;
  const rad = (deg - 90) * (Math.PI / 180);
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad), deg };
}

/**
 * An annotation on the circular band: an arc the thickness of the band with an
 * arrowhead that bends with the curve, converging at the band's mid-radius.
 */
export function bandArcPath(
  startBp: number,
  endBp: number,
  totalBp: number,
  radius: number,
  band: number,
  strand: 1 | -1,
  cx: number,
  cy: number,
): string {
  const outer = radius + band / 2;
  const inner = radius - band / 2;
  // A 45° taper covers a run equal to half the band, in arc length.
  const headBp = Math.min(((band / 2) / (radius * 2 * Math.PI)) * totalBp, (endBp - startBp) / 2);
  const tipBp = strand === 1 ? endBp : startBp;
  const bodyBp = strand === 1 ? endBp - headBp : startBp + headBp;
  const from = strand === 1 ? startBp : endBp;
  const large = Math.abs(bodyBp - from) / totalBp > 0.5 ? 1 : 0;

  const o0 = polar(from, totalBp, outer, cx, cy);
  const o1 = polar(bodyBp, totalBp, outer, cx, cy);
  const i1 = polar(bodyBp, totalBp, inner, cx, cy);
  const i0 = polar(from, totalBp, inner, cx, cy);
  const tip = polar(tipBp, totalBp, radius, cx, cy);
  const sweep = strand === 1 ? 1 : 0;

  return [
    `M ${round(o0.x)} ${round(o0.y)}`,
    `A ${outer} ${outer} 0 ${large} ${sweep} ${round(o1.x)} ${round(o1.y)}`,
    `L ${round(tip.x)} ${round(tip.y)}`,
    `L ${round(i1.x)} ${round(i1.y)}`,
    `A ${inner} ${inner} 0 ${large} ${1 - sweep} ${round(i0.x)} ${round(i0.y)}`,
    'Z',
  ].join(' ');
}

/**
 * Circular ruler labels sit outside the band and run tangentially, flipped on
 * the lower half so they stay the right way up.
 */
export function tangential(deg: number): number {
  return deg > 90 && deg < 270 ? deg - 180 : deg;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
