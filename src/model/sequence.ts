import { PART_LABELS } from './parts';
import type { Alphabet, BuildingBlock, ChainDesign, PartType, Registry } from './types';

/**
 * The sequence under a design.
 *
 * Building blocks carry lengths, targets and features but no bases, so until a
 * real sequence service backs them these are generated rather than real:
 * deterministic per BB-id, so one building block reads the same everywhere it
 * is used and a chain's sequence survives a reload. Coding regions are built
 * codon by codon and skip stops, so a chain translates end to end. Plausible
 * placeholders, not sequences anyone should order oligos against.
 */

const BASES = 'ACGT';

/** Everything that ends up in the protein; the rest is regulatory DNA. */
const CODING: PartType[] = ['vh', 'vl', 'linker', 'hinge', 'ch1', 'ch2', 'ch3', 'cl', 'payload', 'tag'];

export function isCoding(type: PartType): boolean {
  return CODING.includes(type);
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small deterministic PRNG, so the same seed always gives the same sequence. */
function rng(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STOPS = new Set(['TAA', 'TAG', 'TGA']);

function codingSequence(next: () => number, lengthBp: number): string {
  const codons: string[] = [];
  const wanted = Math.floor(lengthBp / 3);
  while (codons.length < wanted) {
    const codon = [0, 1, 2].map(() => BASES[Math.floor(next() * 4)]).join('');
    if (!STOPS.has(codon)) codons.push(codon);
  }
  const out = codons.join('');
  // Lengths that are not a whole number of codons keep their odd bases.
  return out + Array.from({ length: lengthBp - out.length }, () => BASES[Math.floor(next() * 4)]).join('');
}

function regulatorySequence(next: () => number, lengthBp: number): string {
  return Array.from({ length: lengthBp }, () => BASES[Math.floor(next() * 4)]).join('');
}

const cache = new Map<string, string>();

/** The bases for one building block, stable for the life of the session. */
export function blockSequence(block: BuildingBlock): string {
  const hit = cache.get(block.id);
  if (hit) return hit;
  const next = rng(hash(block.id));
  const seq = isCoding(block.type)
    ? codingSequence(next, block.lengthBp)
    : regulatorySequence(next, block.lengthBp);
  cache.set(block.id, seq);
  return seq;
}

const CODONS: Record<string, string> = {
  TTT: 'F', TTC: 'F', TTA: 'L', TTG: 'L', CTT: 'L', CTC: 'L', CTA: 'L', CTG: 'L',
  ATT: 'I', ATC: 'I', ATA: 'I', ATG: 'M', GTT: 'V', GTC: 'V', GTA: 'V', GTG: 'V',
  TCT: 'S', TCC: 'S', TCA: 'S', TCG: 'S', CCT: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
  ACT: 'T', ACC: 'T', ACA: 'T', ACG: 'T', GCT: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
  TAT: 'Y', TAC: 'Y', TAA: '*', TAG: '*', CAT: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
  AAT: 'N', AAC: 'N', AAA: 'K', AAG: 'K', GAT: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
  TGT: 'C', TGC: 'C', TGA: '*', TGG: 'W', CGT: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
  AGT: 'S', AGC: 'S', AGA: 'R', AGG: 'R', GGT: 'G', GGC: 'G', GGA: 'G', GGG: 'G',
};

export function translate(dna: string): string {
  let out = '';
  for (let i = 0; i + 3 <= dna.length; i += 3) out += CODONS[dna.slice(i, i + 3)] ?? 'X';
  return out;
}

/** One stretch of sequence, and the component it comes from. */
export interface Segment {
  type: PartType;
  blockId: string;
  blockName: string;
  label: string;
  seq: string;
  /** 1-based inclusive coordinates in the sequence being shown. */
  start: number;
  end: number;
}

/**
 * The chain read end to end, component by component, in slot order. In amino
 * acid view the regulatory elements drop out — the same rule the parts rail
 * follows — and each coding stretch is translated in its own frame.
 */
export function chainSegments(
  chain: ChainDesign | undefined,
  registry: Registry,
  alphabet: Alphabet = 'nt',
): Segment[] {
  if (!chain) return [];
  const segments: Segment[] = [];
  let pos = 1;
  chain.slots.forEach((slot) => {
    const blockId = slot.blockIds[0];
    const block = blockId ? registry.blocks[blockId] : undefined;
    if (!block) return;
    if (alphabet === 'aa' && !isCoding(block.type)) return;
    const dna = blockSequence(block);
    const seq = alphabet === 'aa' ? translate(dna) : dna;
    if (!seq) return;
    segments.push({
      type: block.type,
      blockId: block.id,
      blockName: block.name,
      label: PART_LABELS[block.type],
      seq,
      start: pos,
      end: pos + seq.length - 1,
    });
    pos += seq.length;
  });
  return segments;
}

export function sequenceOf(segments: Segment[]): string {
  return segments.map((s) => s.seq).join('');
}

export interface SeqRow {
  /** 1-based position of the first residue on the row. */
  start: number;
  parts: Array<{ type: PartType; text: string }>;
}

/** Wrapped for reading, with each row broken at component boundaries. */
export function sequenceRows(segments: Segment[], perRow = 60): SeqRow[] {
  const rows: SeqRow[] = [];
  let pos = 0;
  let row: SeqRow | undefined;
  for (const segment of segments) {
    let i = 0;
    while (i < segment.seq.length) {
      if (pos % perRow === 0) {
        row = { start: pos + 1, parts: [] };
        rows.push(row);
      }
      const take = Math.min(perRow - (pos % perRow), segment.seq.length - i);
      row!.parts.push({ type: segment.type, text: segment.seq.slice(i, i + take) });
      i += take;
      pos += take;
    }
  }
  return rows;
}

export function fasta(name: string, seq: string, width = 60): string {
  const lines: string[] = [];
  for (let i = 0; i < seq.length; i += width) lines.push(seq.slice(i, i + width));
  return `>${name}\n${lines.join('\n')}\n`;
}
