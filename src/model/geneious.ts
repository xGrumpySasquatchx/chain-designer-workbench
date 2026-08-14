import { COLORS, PART_LABELS } from './parts';
import { suppliedByVector } from './combinatorics';
import type { ChainDesign, PartType, Registry } from './types';

/**
 * Construct maps follow Geneious Prime conventions (manual.geneious.com):
 * annotations are drawn as directional arrows over a coordinate ruler, grouped
 * into tracks stacked under the sequence, and a circular sequence can be shown
 * either circular or, with the linear view option, laid out linearly. Clicking
 * an annotation selects the region it covers, and that selection is shared with
 * the other viewers.
 */

export type FeatureKind =
  | 'cds'
  | 'regulatory'
  | 'marker'
  | 'ori'
  | 'mcs'
  | 'constant'
  | 'polyA';

export interface MapFeature {
  id: string;
  name: string;
  kind: FeatureKind;
  /** 1-based inclusive coordinates, Geneious-style. */
  start: number;
  end: number;
  strand: 1 | -1;
  color: string;
  /** Annotations directly on the insert, or on the backbone track below it. */
  track: 'insert' | 'backbone';
  /** Set for features that map back to a bench slot, for linked selection. */
  chainId?: string;
  slotIndex?: number;
  partType?: PartType;
  /** True when the region is encoded by the backbone rather than the insert. */
  fromVector?: boolean;
  empty?: boolean;
}

export interface ConstructMapModel {
  chainId: string;
  name: string;
  ccId?: string;
  regId?: string;
  circular: boolean;
  totalBp: number;
  insertBp: number;
  vectorName?: string;
  features: MapFeature[];
}

const KIND_FOR_PART: Partial<Record<PartType, FeatureKind>> = {
  promoter: 'regulatory',
  term: 'regulatory',
  ch1: 'constant',
  ch2: 'constant',
  ch3: 'constant',
  cl: 'constant',
};

/**
 * Geneious colours annotations per type, as a user preference rather than a
 * fixed palette. Where its published screenshots show an unambiguous default we
 * use it — CDS yellow, rep_origin azure, misc_feature grey — and where they show
 * none, as for promoters, terminators and polyA signals, this app's own part
 * taxonomy stands in.
 */
const BACKBONE_COLORS: Record<FeatureKind, string> = {
  cds: '#FFFF00',
  marker: '#FFFF00',
  ori: '#00A8F0',
  mcs: '#A0A0A0',
  regulatory: COLORS.promoter,
  polyA: COLORS.term,
  constant: '#85B7EB',
};

/**
 * Lay the insert out from position 1, then the backbone features after it, the
 * way an insert cloned into a multiple cloning site reads on a plasmid map.
 */
export function buildMap(chain: ChainDesign, registry: Registry): ConstructMapModel {
  const vector = chain.vectorId ? registry.vectors[chain.vectorId] : null;
  const supplied = suppliedByVector(chain, registry);
  const features: MapFeature[] = [];

  // The insert carries what the backbone does not supply, plus anything the user
  // chose explicitly — a block placed in a slot the backbone also encodes shows
  // up twice, which is what the duplicate-domain QC warning is about.
  let cursor = 1;
  chain.slots.forEach((slot, slotIndex) => {
    const blockId = slot.blockIds[0];
    if (supplied.includes(slot.type) && !blockId) return;
    const block = blockId ? registry.blocks[blockId] : undefined;
    // Empty slots still get a placeholder span so the map shows what is missing.
    const length = block?.lengthBp ?? 120;
    features.push({
      id: `${chain.id}-${slotIndex}`,
      name: block?.name ?? `${PART_LABELS[slot.type]} — empty`,
      kind: KIND_FOR_PART[slot.type] ?? 'cds',
      start: cursor,
      end: cursor + length - 1,
      strand: 1,
      color: COLORS[slot.type],
      track: 'insert',
      chainId: chain.id,
      slotIndex,
      partType: slot.type,
      empty: !block,
    });
    cursor += length;
  });

  const insertBp = cursor - 1;

  if (vector) {
    // Backbone features follow the insert. The constant regions the backbone
    // supplies stay clickable, since they still belong to a slot on the bench.
    vector.backboneFeatures.forEach((feature, i) => {
      const slotIndex = chain.slots.findIndex(
        (s) =>
          supplied.includes(s.type) &&
          !s.blockIds.length &&
          feature.name.toLowerCase().startsWith(s.type),
      );
      features.push({
        id: slotIndex >= 0 ? `${chain.id}-${slotIndex}` : `${chain.id}-bb-${i}`,
        name: feature.name,
        kind: feature.kind,
        start: cursor,
        end: cursor + feature.lengthBp - 1,
        strand: feature.strand,
        color:
          slotIndex >= 0 ? COLORS[chain.slots[slotIndex].type] : BACKBONE_COLORS[feature.kind],
        track: 'backbone',
        chainId: slotIndex >= 0 ? chain.id : undefined,
        slotIndex: slotIndex >= 0 ? slotIndex : undefined,
        partType: slotIndex >= 0 ? chain.slots[slotIndex].type : undefined,
        fromVector: true,
      });
      cursor += feature.lengthBp;
    });
  }

  return {
    chainId: chain.id,
    name: chain.name,
    ccId: chain.constructIds[0],
    regId: chain.regIds[0],
    // A plasmid is circular once it has a backbone; without one there is only a
    // linear insert to show.
    circular: !!vector,
    totalBp: vector ? insertBp + vector.lengthBp : insertBp,
    insertBp,
    vectorName: vector?.name,
    features,
  };
}

/**
 * Ruler ticks at a round interval — 1, 2 or 5 times a power of ten — chosen so
 * the labels stay comfortably apart at the width available.
 */
export function rulerTicks(totalBp: number, labels = 8): number[] {
  const target = totalBp / labels;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(target, 1))));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= target) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let bp = step; bp < totalBp; bp += step) ticks.push(bp);
  return ticks;
}
