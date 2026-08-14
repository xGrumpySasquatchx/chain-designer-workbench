import type { Alphabet, Lineage, PartType, Resolution } from './types';

/** Spec section 8a — color encodes chain lineage, not just part category. */
export const COLORS: Record<PartType, string> = {
  promoter: '#1D9E75',
  vh: '#EF9F27',
  hinge: '#D85A30',
  ch1: '#85B7EB',
  ch2: '#378ADD',
  ch3: '#0C447C',
  vl: '#D4537E',
  cl: '#993556',
  linker: '#7F77DD',
  payload: '#B4642E',
  tag: '#6E8F1E',
  term: '#888780',
};

export const PART_LABELS: Record<PartType, string> = {
  promoter: 'Promoter',
  vh: 'VH',
  vl: 'VL',
  linker: 'Linker',
  hinge: 'Hinge',
  ch1: 'CH1',
  ch2: 'CH2',
  ch3: 'CH3',
  cl: 'CL',
  payload: 'Payload',
  tag: 'Tag',
  term: 'Terminator',
};

export const PART_LINEAGE: Record<PartType, Lineage> = {
  promoter: 'generic',
  vh: 'heavy',
  hinge: 'heavy',
  ch1: 'heavy',
  ch2: 'heavy',
  ch3: 'heavy',
  vl: 'light',
  cl: 'light',
  linker: 'generic',
  payload: 'generic',
  tag: 'generic',
  term: 'generic',
};

/**
 * On the design pad color encodes the sequence/target rather than the part
 * category (docs.bioglyph.app). Domains that carry no target stay neutral.
 */
export const TARGET_COLORS: Record<string, string> = {
  HER2: '#EF9F27',
  CD3: '#7F77DD',
  EGFR: '#1D9E75',
  CD20: '#D85A30',
  'IL-2R': '#B4642E',
  albumin: '#6E8F1E',
};

export const NEUTRAL_DOMAIN = '#C4C1B6';
export const NEUTRAL_DOMAIN_DARK = '#9C998F';

export function targetColor(target: string | undefined): string {
  if (!target) return NEUTRAL_DOMAIN;
  return TARGET_COLORS[target] ?? '#5F7FA8';
}

/** Regulatory DNA has no amino-acid form, so it is hidden in aa mode. */
export function inAlphabet(molecule: 'dna' | 'protein', alphabet: Alphabet): boolean {
  return alphabet === 'nt' || molecule === 'protein';
}

export function lengthIn(lengthBp: number, alphabet: Alphabet): string {
  return alphabet === 'aa'
    ? `${Math.round(lengthBp / 3).toLocaleString()} aa`
    : `${lengthBp.toLocaleString()} bp`;
}

/** Constant domains are backbone-level detail, visible even at resolution 1. */
export const CONSTANT_DOMAINS: PartType[] = ['ch1', 'ch2', 'ch3', 'cl'];

export const RESOLUTION_LABELS: Record<Resolution, string> = {
  1: 'Insert + backbone',
  2: '+ linkers, hinges',
  3: 'Full detail',
};

/** Chip glyph shape, so parts read as shape + color rather than as text. */
export function chipShape(type: PartType): string {
  switch (type) {
    case 'promoter':
      return 'polygon(0 20%, 70% 20%, 70% 0, 100% 50%, 70% 100%, 70% 80%, 0 80%)';
    case 'term':
      return 'polygon(0 0, 60% 0, 60% 100%, 40% 100%, 40% 30%, 0 30%)';
    case 'hinge':
      return 'polygon(50% 0, 100% 100%, 0 100%)';
    case 'linker':
      return 'polygon(0 40%, 100% 40%, 100% 60%, 0 60%)';
    case 'tag':
      return 'polygon(0 0, 100% 0, 100% 65%, 50% 100%, 0 65%)';
    default:
      return '';
  }
}
