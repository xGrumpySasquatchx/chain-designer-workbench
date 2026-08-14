/**
 * Domain model for the MsAb construct designer.
 *
 * ID convention (spec section 2):
 *   BB-id   building block, a region-level sequence element
 *   INS-id  insert, building blocks assembled into one chain-coding sequence
 *   VEC-id  vector / backbone, typically already carrying constant regions
 *   CC-id   construct, an insert combined with a vector
 *   REG-id  registered chain, a construct checked into inventory
 */

export type PartType =
  | 'promoter'
  | 'vh'
  | 'vl'
  | 'linker'
  | 'hinge'
  | 'ch1'
  | 'ch2'
  | 'ch3'
  | 'cl'
  | 'payload'
  | 'tag'
  | 'term';

/**
 * Which vocabulary a component belongs to. Regulatory elements only exist as
 * DNA; everything that ends up in the protein is browsable either way, and the
 * rail shows one alphabet at a time.
 */
export type Alphabet = 'nt' | 'aa';

/** Color families encode chain lineage, not part category (spec section 8a). */
export type Lineage = 'heavy' | 'light' | 'generic';

export type ChainKind = 'heavy' | 'light';

/** Resolution is a view setting, never a data model choice (spec section 7). */
export type Resolution = 1 | 2 | 3;

export interface BuildingBlock {
  id: string;
  name: string;
  type: PartType;
  lineage: Lineage;
  /** IgG1 / IgG4 / kappa / lambda — drives constant-region compatibility checks. */
  isotype?: string;
  /** Antigen this sequence binds. Colors the glyph on the design pad. */
  target?: string;
  /** 'dna' parts have no amino-acid representation and are hidden in aa mode. */
  molecule: 'dna' | 'protein';
  /** Searchable free-text tags so users never need to recall an ID. */
  features: string[];
  lengthBp: number;
}

/** A named region of the backbone, drawn on the construct map's backbone track. */
export interface BackboneFeature {
  name: string;
  kind: 'ori' | 'marker' | 'mcs' | 'polyA' | 'constant';
  lengthBp: number;
  strand: 1 | -1;
}

export interface Vector {
  id: string;
  name: string;
  /** An empty backbone carries no constant regions and accepts any isotype. */
  isEmpty: boolean;
  /** Constant-region slots the backbone already supplies. */
  provides: PartType[];
  isotype?: string;
  resistance: string;
  lengthBp: number;
  backboneFeatures: BackboneFeature[];
}

/** A pre-assembled chain-coding sequence that can be reused wholesale. */
export interface Insert {
  id: string;
  name: string;
  kind: ChainKind;
  /** Block ids keyed by the slot type they fill. */
  blocks: Partial<Record<PartType, string>>;
  features: string[];
}

export interface Construct {
  id: string;
  insertId: string;
  vectorId: string;
  chainName: string;
  createdAt: number;
}

export interface RegisteredChain {
  id: string;
  constructId: string;
  chainName: string;
  inventory: {
    location: string;
    plasmidUg: number;
    glycerolStock: boolean;
  };
}

/**
 * One slot on a bench row. `blockIds` is a stack: more than one option expresses
 * combinatorics spatially rather than as typed set notation (spec section 4.5).
 */
export interface Slot {
  type: PartType;
  level: Resolution;
  blockIds: string[];
}

export interface ChainDesign {
  id: string;
  name: string;
  kind: ChainKind;
  slots: Slot[];
  vectorId: string | null;
  note?: string;
  /** Per-row resolution override, independent of the global setting. */
  resolutionOverride?: Resolution;
  /** One CC-id per combinatorial variant, minted at assembly. */
  constructIds: string[];
  /** One REG-id per construct checked into inventory. */
  regIds: string[];
  /** The chain this one pairs with in the molecule pad. */
  pairedWith?: string;
}

export interface BenchGroup {
  kind: 'group';
  id: string;
  name: string;
  collapsed: boolean;
  children: string[];
}

export interface BenchChain {
  kind: 'chain';
  id: string;
}

/** The bench is a flat list; grouping is one level deep in v0 (open question 9.1). */
export type BenchNode = BenchChain | BenchGroup;

/**
 * BioGlyph building blocks (docs.bioglyph.app — Design Pad). Shape encodes the
 * building block, color encodes the sequence/target it carries.
 */
export type BbKind =
  | 'fab'
  | 'scfab'
  | 'xfab'
  | 'scfv'
  | 'vhh'
  | 'mutein'
  | 'miniprotein'
  | 'denovo'
  | 'reagent'
  | 'tag'
  | 'fc'
  | 'empty';

export type ArmId = 'left' | 'right';

export interface ArmDesign {
  id: ArmId;
  bb: BbKind;
  /** The chain that carries this arm's heavy-side coding sequence. */
  heavyChainId: string | null;
  /** Only used by building blocks that need a separate light chain. */
  lightChainId: string | null;
  /** Building blocks fused to the arm by proximity, in order. */
  fused: BbKind[];
}

/**
 * The molecule under design. Symmetry across the Y-axis through the Fc decides
 * whether a homodimeric or heterodimeric Fc is the correct choice.
 */
export interface FormatDesign {
  arms: Record<ArmId, ArmDesign>;
  /** Format identity is reused whenever the same format recurs. */
  formatId: string | null;
}

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface QcCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface QcResult {
  status: CheckStatus;
  checks: QcCheck[];
}

/**
 * A registered format. Reusing the same format across projects reuses this
 * record rather than minting a new identifier.
 */
export interface FormatRecord {
  id: string;
  name: string;
  /** Shape + color signature across both arms; identical formats collide here. */
  signature: string;
  fc: 'homodimer' | 'heterodimer' | 'none';
  symmetric: boolean;
}

export interface Registry {
  blocks: Record<string, BuildingBlock>;
  vectors: Record<string, Vector>;
  inserts: Record<string, Insert>;
  constructs: Record<string, Construct>;
  registered: Record<string, RegisteredChain>;
  formats: Record<string, FormatRecord>;
}
