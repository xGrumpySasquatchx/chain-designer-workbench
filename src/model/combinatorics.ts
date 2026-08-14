import type { ChainDesign, PartType, Registry } from './types';

export interface Variant {
  /** Stable key built from the chosen block ids. */
  key: string;
  index: number;
  assignment: Partial<Record<PartType, string>>;
}

/** Slots the backbone already supplies do not need a locally chosen block. */
export function suppliedByVector(chain: ChainDesign, registry: Registry): PartType[] {
  const vector = chain.vectorId ? registry.vectors[chain.vectorId] : null;
  return vector ? vector.provides : [];
}

/** A slot is required when it is visible at resolution 1 (insert + backbone). */
export function isRequired(slotLevel: number): boolean {
  return slotLevel === 1;
}

export function unresolvedSlots(chain: ChainDesign, registry: Registry) {
  const supplied = suppliedByVector(chain, registry);
  return chain.slots.filter(
    (s) => isRequired(s.level) && s.blockIds.length === 0 && !supplied.includes(s.type),
  );
}

export function componentsComplete(chain: ChainDesign, registry: Registry): boolean {
  return unresolvedSlots(chain, registry).length === 0;
}

export function chosenCount(chain: ChainDesign): number {
  return chain.slots.reduce((n, s) => n + (s.blockIds.length > 0 ? 1 : 0), 0);
}

/** Stacking a second option in a slot multiplies the design out (spec 4.5). */
export function variantCount(chain: ChainDesign): number {
  return chain.slots.reduce((n, s) => n * Math.max(1, s.blockIds.length), 1);
}

const MAX_ENUMERATED = 256;

export function enumerateVariants(chain: ChainDesign): Variant[] {
  const stacked = chain.slots.filter((s) => s.blockIds.length > 0);
  let combos: Array<Partial<Record<PartType, string>>> = [{}];

  for (const slot of stacked) {
    const next: Array<Partial<Record<PartType, string>>> = [];
    for (const combo of combos) {
      for (const blockId of slot.blockIds) {
        if (next.length >= MAX_ENUMERATED) break;
        next.push({ ...combo, [slot.type]: blockId });
      }
    }
    combos = next;
  }

  return combos.map((assignment, index) => ({
    index,
    key: Object.values(assignment).join('|'),
    assignment,
  }));
}

export function variantLabel(
  variant: Variant,
  chain: ChainDesign,
  registry: Registry,
): string {
  // Name the variant by the slots that actually vary, so labels stay short.
  const varying = chain.slots.filter((s) => s.blockIds.length > 1).map((s) => s.type);
  const parts = varying
    .map((type) => registry.blocks[variant.assignment[type] ?? '']?.name)
    .filter(Boolean);
  return parts.length ? parts.join(' + ') : chain.name;
}

export function insertLengthBp(
  assignment: Partial<Record<PartType, string>>,
  registry: Registry,
): number {
  return Object.values(assignment).reduce(
    (n, id) => n + (id ? (registry.blocks[id]?.lengthBp ?? 0) : 0),
    0,
  );
}
