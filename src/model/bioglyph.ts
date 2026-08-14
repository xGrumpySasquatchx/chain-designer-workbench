import type {
  ArmDesign,
  ArmId,
  BbKind,
  BuildingBlock,
  ChainDesign,
  FcBbKind,
  FormatDesign,
  PartType,
  Registry,
  Resolution,
} from './types';

/**
 * BioGlyph Design Pad conventions (docs.bioglyph.app):
 *
 * - Building blocks are connected by proximity, mirroring genetic fusion.
 * - Connectivity is controlled: not every block can fuse to every other.
 * - Shape encodes the building block; color encodes the sequence / target.
 * - Symmetry across the Y-axis through the Fc decides homodimer vs heterodimer.
 * - A format that recurs keeps its original identifier.
 */

export type BbShape =
  | 'fab'
  | 'crossfab'
  | 'scfv'
  | 'single'
  | 'ball'
  | 'wedge'
  | 'flag'
  | 'stem'
  | 'none';

export interface BbDef {
  kind: BbKind;
  label: string;
  shape: BbShape;
  /** Can occupy an arm position on the scaffold. */
  arm: boolean;
  /** Needs its own light chain document. */
  needsLightChain: boolean;
  /** Fuses onto another block rather than occupying an arm of its own. */
  fusesOnly: boolean;
  /** Occupies the Fc scaffold in the centre of the pad, not an arm. */
  scaffold?: boolean;
  description: string;
}

export const BB_LIBRARY: BbDef[] = [
  {
    kind: 'fab',
    label: 'Fab',
    shape: 'fab',
    arm: true,
    needsLightChain: true,
    fusesOnly: false,
    description: 'VH–CH1 paired with a separate VL–CL light chain',
  },
  {
    kind: 'scfab',
    label: 'scFab',
    shape: 'fab',
    arm: true,
    needsLightChain: false,
    fusesOnly: false,
    description: 'Single-chain Fab: VL–CL fused through a linker to VH–CH1',
  },
  {
    kind: 'xfab',
    label: 'xFab',
    shape: 'crossfab',
    arm: true,
    needsLightChain: true,
    fusesOnly: false,
    description: 'Crossover Fab: VH–CL on the heavy chain, VL–CH1 on the light',
  },
  {
    kind: 'scfv',
    label: 'scFv',
    shape: 'scfv',
    arm: true,
    needsLightChain: false,
    fusesOnly: false,
    description: 'VH and VL on one chain, joined by a linker',
  },
  {
    kind: 'vhh',
    label: 'VHH',
    shape: 'single',
    arm: true,
    needsLightChain: false,
    fusesOnly: false,
    description: 'Single variable domain, no light chain',
  },
  {
    kind: 'homofc',
    label: 'Homo-Fc',
    shape: 'stem',
    arm: false,
    needsLightChain: false,
    fusesOnly: false,
    scaffold: true,
    description: 'Homodimeric Fc: identical wild-type CH3 on both heavy chains',
  },
  {
    kind: 'heterofc',
    label: 'Hetero-Fc',
    shape: 'stem',
    arm: false,
    needsLightChain: false,
    fusesOnly: false,
    scaffold: true,
    description: 'Heterodimeric Fc: knob-into-hole CH3 pairing across the two heavy chains',
  },
  {
    kind: 'mutein',
    label: 'Mutein',
    shape: 'ball',
    arm: true,
    needsLightChain: false,
    fusesOnly: false,
    description: 'Engineered cytokine or ligand fused to the Fc',
  },
  {
    kind: 'miniprotein',
    label: 'Mini-protein',
    shape: 'wedge',
    arm: true,
    needsLightChain: false,
    fusesOnly: false,
    description: 'Small scaffold binder fused to the Fc',
  },
  {
    kind: 'denovo',
    label: 'De novo',
    shape: 'wedge',
    arm: true,
    needsLightChain: false,
    fusesOnly: false,
    description: 'Computationally designed binder',
  },
  {
    kind: 'reagent',
    label: 'Reagent',
    shape: 'ball',
    arm: true,
    needsLightChain: false,
    fusesOnly: false,
    description: 'Non-therapeutic partner used for assay or purification work',
  },
  {
    kind: 'tag',
    label: 'Tag',
    shape: 'flag',
    arm: false,
    needsLightChain: false,
    fusesOnly: true,
    description: 'Purification or detection tag, fused to an existing block',
  },
  {
    kind: 'fc',
    label: 'Fc',
    shape: 'stem',
    arm: true,
    needsLightChain: false,
    fusesOnly: false,
    description: 'Fc-only arm: hinge, CH2 and CH3 with no variable domain',
  },
  {
    kind: 'empty',
    label: 'Empty',
    shape: 'none',
    arm: true,
    needsLightChain: false,
    fusesOnly: false,
    description: 'No block in this arm position',
  },
];

export function bbDef(kind: BbKind): BbDef {
  return BB_LIBRARY.find((b) => b.kind === kind) ?? BB_LIBRARY[BB_LIBRARY.length - 1];
}

export function isFcScaffold(kind: BbKind): kind is FcBbKind {
  return kind === 'homofc' || kind === 'heterofc';
}

export function fcPairing(kind: FcBbKind | 'none'): 'homodimer' | 'heterodimer' | 'none' {
  if (kind === 'homofc') return 'homodimer';
  if (kind === 'heterofc') return 'heterodimer';
  return 'none';
}

/** Sequence parts the Fc building block writes onto the two heavy chains. */
export const FC_PARTS: Record<FcBbKind, { ch2: string; leftCh3: string; rightCh3: string }> = {
  homofc: { ch2: 'BB-0060', leftCh3: 'BB-0072', rightCh3: 'BB-0072' },
  heterofc: { ch2: 'BB-0060', leftCh3: 'BB-0070', rightCh3: 'BB-0071' },
};

/** Controlled connectivity: what a given block is allowed to fuse onto. */
export function canFuse(source: BbKind, onto: BbKind): boolean {
  if (source === onto) return false;
  const def = bbDef(source);
  if (def.scaffold) return false;
  if (def.fusesOnly) return onto !== 'empty';
  // Arm blocks fuse to the Fc scaffold by occupying an arm position, and can
  // also be fused in tandem onto another arm block.
  return def.arm && onto !== 'empty' && onto !== 'tag';
}

type SlotDef = { type: PartType; level: Resolution };

const FC_TAIL: SlotDef[] = [
  { type: 'hinge', level: 2 },
  { type: 'ch2', level: 1 },
  { type: 'ch3', level: 1 },
];

const PROMOTER: SlotDef = { type: 'promoter', level: 3 };
const TERM: SlotDef = { type: 'term', level: 3 };

/**
 * The heavy-side and light-side slot layouts each building block implies. This
 * is what makes the pad functional rather than decorative: choosing a block on
 * the pad rewrites the chain rows on the bench.
 */
export function slotsForBb(kind: BbKind): { heavy: SlotDef[]; light: SlotDef[] | null } {
  switch (kind) {
    case 'fab':
      return {
        heavy: [PROMOTER, { type: 'vh', level: 1 }, { type: 'ch1', level: 1 }, ...FC_TAIL, TERM],
        light: [PROMOTER, { type: 'vl', level: 1 }, { type: 'cl', level: 1 }, TERM],
      };
    case 'xfab':
      return {
        heavy: [PROMOTER, { type: 'vh', level: 1 }, { type: 'cl', level: 1 }, ...FC_TAIL, TERM],
        light: [PROMOTER, { type: 'vl', level: 1 }, { type: 'ch1', level: 1 }, TERM],
      };
    case 'scfab':
      return {
        heavy: [
          PROMOTER,
          { type: 'vl', level: 1 },
          { type: 'cl', level: 1 },
          { type: 'linker', level: 2 },
          { type: 'vh', level: 1 },
          { type: 'ch1', level: 1 },
          ...FC_TAIL,
          TERM,
        ],
        light: null,
      };
    case 'scfv':
      return {
        heavy: [
          PROMOTER,
          { type: 'vh', level: 1 },
          { type: 'linker', level: 2 },
          { type: 'vl', level: 1 },
          ...FC_TAIL,
          TERM,
        ],
        light: null,
      };
    case 'vhh':
      return { heavy: [PROMOTER, { type: 'vh', level: 1 }, ...FC_TAIL, TERM], light: null };
    case 'mutein':
    case 'miniprotein':
    case 'denovo':
    case 'reagent':
      return {
        heavy: [
          PROMOTER,
          { type: 'payload', level: 1 },
          { type: 'linker', level: 2 },
          ...FC_TAIL,
          TERM,
        ],
        light: null,
      };
    case 'fc':
    case 'homofc':
    case 'heterofc':
    case 'tag':
    case 'empty':
    default:
      return { heavy: [PROMOTER, ...FC_TAIL, TERM], light: null };
  }
}

/** Slot layout for a chain, including any blocks fused onto the arm. */
export function armSlots(arm: ArmDesign): { heavy: SlotDef[]; light: SlotDef[] | null } {
  const base = slotsForBb(arm.bb);
  if (!arm.fused.length) return base;
  const heavy = [...base.heavy];
  if (arm.fused.includes('tag')) {
    // A tag is fused at the C-terminus, before the terminator.
    heavy.splice(heavy.length - 1, 0, { type: 'tag', level: 3 });
  }
  return { heavy, light: base.light };
}

/** The target a chain presents, taken from its variable domain or payload. */
export function chainTarget(
  chain: ChainDesign | undefined,
  registry: Registry,
): string | undefined {
  if (!chain) return undefined;
  for (const type of ['vh', 'payload', 'vl'] as PartType[]) {
    const slot = chain.slots.find((s) => s.type === type);
    const blockId = slot?.blockIds[0];
    const target = blockId ? registry.blocks[blockId]?.target : undefined;
    if (target) return target;
  }
  return undefined;
}

export interface SymmetryVerdict {
  symmetric: boolean;
  /** Shape symmetry: the same building block on both arms. */
  sameShape: boolean;
  /** Color symmetry: the same sequence/target on both arms. */
  sameColor: boolean;
  fc: 'homodimer' | 'heterodimer' | 'none';
  detail: string;
}

/**
 * Symmetry is judged across the Y-axis through the Fc, on both shape (building
 * blocks) and color (sequence/target). A mirror image calls for a homodimeric
 * Fc; anything asymmetric needs a heterodimeric Fc.
 */
export function symmetry(
  format: FormatDesign,
  chains: Record<string, ChainDesign>,
  registry: Registry,
): SymmetryVerdict {
  const left = format.arms.left;
  const right = format.arms.right;
  const bothEmpty = left.bb === 'empty' && right.bb === 'empty';
  if (bothEmpty) {
    return {
      symmetric: true,
      sameShape: true,
      sameColor: true,
      fc: 'none',
      detail: 'No building blocks placed yet.',
    };
  }

  const sameShape = left.bb === right.bb;
  const leftTarget = chainTarget(left.heavyChainId ? chains[left.heavyChainId] : undefined, registry);
  const rightTarget = chainTarget(
    right.heavyChainId ? chains[right.heavyChainId] : undefined,
    registry,
  );
  const sameColor = leftTarget === rightTarget;
  const symmetric = sameShape && sameColor;

  return {
    symmetric,
    sameShape,
    sameColor,
    fc: symmetric ? 'homodimer' : 'heterodimer',
    detail: symmetric
      ? `Mirror image across the Fc (${bbDef(left.bb).label}, ${leftTarget ?? 'no target set'}) — homodimeric Fc is correct.`
      : !sameShape
        ? `${bbDef(left.bb).label} against ${bbDef(right.bb).label} — asymmetric shape, heterodimeric Fc required.`
        : `${leftTarget ?? 'no target'} against ${rightTarget ?? 'no target'} — asymmetric sequence, heterodimeric Fc required.`,
  };
}

/**
 * The Fc actually on the scaffold, falling back to the symmetry recommendation
 * until a Homo-Fc or Hetero-Fc has been placed.
 */
export function scaffoldFc(
  format: FormatDesign,
  chains: Record<string, ChainDesign>,
  registry: Registry,
): 'homodimer' | 'heterodimer' | 'none' {
  const chosen = fcPairing(format.fc);
  return chosen === 'none' ? symmetry(format, chains, registry).fc : chosen;
}

/** Shape + color signature, so an identical format resolves to one identifier. */
export function formatSignature(
  format: FormatDesign,
  chains: Record<string, ChainDesign>,
  registry: Registry,
): string {
  const arm = (id: ArmId) => {
    const design = format.arms[id];
    const target = chainTarget(
      design.heavyChainId ? chains[design.heavyChainId] : undefined,
      registry,
    );
    return `${design.bb}:${target ?? 'none'}${design.fused.length ? `+${[...design.fused].sort().join('+')}` : ''}`;
  };
  // A mirrored format is the same format whichever arm is drawn first.
  const arms = [arm('left'), arm('right')].sort();
  return `${arms.join('|')}::${scaffoldFc(format, chains, registry)}`;
}

export function formatName(
  format: FormatDesign,
  chains: Record<string, ChainDesign>,
  registry: Registry,
): string {
  const label = (id: ArmId) => {
    const design = format.arms[id];
    const target = chainTarget(
      design.heavyChainId ? chains[design.heavyChainId] : undefined,
      registry,
    );
    return `${target ? `anti-${target} ` : ''}${bbDef(design.bb).label}`;
  };
  const dimer = scaffoldFc(format, chains, registry);
  const fcLabel = format.fc === 'none' ? `${dimer} Fc` : bbDef(format.fc).label;
  return `${label('left')} × ${label('right')} · ${fcLabel}`;
}

/** Knob-into-hole variants are how a heterodimeric Fc is actually built. */
export function ch3Role(block: BuildingBlock | undefined): 'knob' | 'hole' | 'wildtype' | null {
  if (!block || block.type !== 'ch3') return null;
  if (block.features.includes('knob-into-hole')) {
    return block.name.toLowerCase().includes('knob') ? 'knob' : 'hole';
  }
  return 'wildtype';
}
