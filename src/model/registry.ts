import { slotsForBb } from './bioglyph';
import type {
  BbKind,
  BuildingBlock,
  ChainDesign,
  ChainKind,
  FormatDesign,
  Insert,
  PartType,
  Registry,
  Resolution,
  Slot,
  Vector,
} from './types';

/**
 * Sequential ID minting. Counters live in app state so the whole session is a
 * pure function of its action log.
 */
export type IdPrefix = 'BB' | 'INS' | 'VEC' | 'CC' | 'REG' | 'CH' | 'GRP' | 'FMT' | 'MOL';

export type Counters = Record<IdPrefix, number>;

export function mintId(counters: Counters, prefix: IdPrefix): [string, Counters] {
  const next = counters[prefix] + 1;
  return [`${prefix}-${String(next).padStart(4, '0')}`, { ...counters, [prefix]: next }];
}

/** Regulatory elements are DNA-only; everything else also has a protein form. */
const DNA_ONLY: PartType[] = ['promoter', 'term'];

function bb(
  id: string,
  name: string,
  type: PartType,
  lengthBp: number,
  features: string[],
  extra: { isotype?: string; target?: string } = {},
): BuildingBlock {
  const lineage =
    type === 'vh' || type === 'hinge' || type.startsWith('ch')
      ? 'heavy'
      : type === 'vl' || type === 'cl'
        ? 'light'
        : 'generic';
  return {
    id,
    name,
    type,
    lineage,
    isotype: extra.isotype,
    target: extra.target,
    molecule: DNA_ONLY.includes(type) ? 'dna' : 'protein',
    features,
    lengthBp,
  };
}

const BLOCK_LIST: BuildingBlock[] = [
  bb('BB-0001', 'CMV promoter', 'promoter', 588, ['strong', 'mammalian', 'HEK293']),
  bb('BB-0002', 'EF1a promoter', 'promoter', 1179, ['constitutive', 'CHO stable']),
  bb('BB-0003', 'CAG promoter', 'promoter', 1686, ['hybrid', 'high expression']),

  bb('BB-0010', 'anti-HER2 VH (4D5)', 'vh', 363, ['HER2', 'humanized', 'benchmark arm'], {
    target: 'HER2',
  }),
  bb('BB-0011', 'anti-HER2 VH (2C4)', 'vh', 366, ['HER2', 'domain II epitope'], {
    target: 'HER2',
  }),
  bb('BB-0012', 'anti-CD3 VH (SP34)', 'vh', 369, ['CD3e', 'T-cell engager'], { target: 'CD3' }),
  bb('BB-0013', 'anti-EGFR VH (cetux)', 'vh', 372, ['EGFR', 'chimeric'], { target: 'EGFR' }),
  bb('BB-0014', 'anti-CD20 VH (2B8)', 'vh', 360, ['CD20', 'B-cell'], { target: 'CD20' }),

  bb('BB-0020', 'universal VL (kappa)', 'vl', 321, ['common light chain', 'fixed', 'kappa'], {
    isotype: 'kappa',
  }),
  bb('BB-0021', 'anti-HER2 VL (4D5)', 'vl', 324, ['HER2', 'kappa'], {
    isotype: 'kappa',
    target: 'HER2',
  }),
  bb('BB-0022', 'anti-CD3 VL (SP34)', 'vl', 327, ['CD3e', 'lambda'], {
    isotype: 'lambda',
    target: 'CD3',
  }),

  bb('BB-0030', '(G4S)x3 linker', 'linker', 45, ['flexible', 'scFv standard']),
  bb('BB-0031', '(G4S)x4 linker', 'linker', 60, ['flexible', 'long']),
  bb('BB-0032', 'Whitlow linker', 'linker', 54, ['218 linker', 'protease resistant']),

  bb('BB-0040', 'IgG1 hinge (EPKSCDKTHT)', 'hinge', 45, ['upper hinge', 'wild type'], {
    isotype: 'IgG1',
  }),
  bb('BB-0041', 'IgG4 hinge (S228P)', 'hinge', 36, ['stabilized', 'no Fab-arm exchange'], {
    isotype: 'IgG4',
  }),

  bb('BB-0050', 'CH1 IgG1', 'ch1', 294, ['pairs with CL', 'wild type'], { isotype: 'IgG1' }),
  bb('BB-0051', 'CH1 IgG4', 'ch1', 294, ['pairs with CL'], { isotype: 'IgG4' }),
  bb('BB-0060', 'CH2 IgG1', 'ch2', 327, ['FcgR binding', 'wild type'], { isotype: 'IgG1' }),
  bb('BB-0061', 'CH2 IgG1 LALA', 'ch2', 327, ['effector silent', 'L234A/L235A'], {
    isotype: 'IgG1',
  }),
  bb('BB-0062', 'CH2 IgG4', 'ch2', 327, ['low effector'], { isotype: 'IgG4' }),
  bb('BB-0070', 'CH3 IgG1 knob (T366W)', 'ch3', 321, ['knob-into-hole', 'heterodimer'], {
    isotype: 'IgG1',
  }),
  bb('BB-0071', 'CH3 IgG1 hole (T366S/L368A/Y407V)', 'ch3', 321, ['knob-into-hole', 'heterodimer'], {
    isotype: 'IgG1',
  }),
  bb('BB-0072', 'CH3 IgG1 wild type', 'ch3', 321, ['homodimer'], { isotype: 'IgG1' }),
  bb('BB-0073', 'CH3 IgG4', 'ch3', 321, ['homodimer'], { isotype: 'IgG4' }),

  bb('BB-0080', 'CL kappa', 'cl', 321, ['pairs with CH1', 'wild type'], { isotype: 'kappa' }),
  bb('BB-0081', 'CL lambda', 'cl', 318, ['pairs with CH1'], { isotype: 'lambda' }),

  bb('BB-0090', 'bGH polyA', 'term', 225, ['terminator', 'standard']),
  bb('BB-0091', 'SV40 polyA', 'term', 135, ['terminator', 'compact']),

  bb('BB-0100', 'IL-2 mutein (no-alpha)', 'payload', 399, ['cytokine', 'mutein', 'IL-2R'], {
    target: 'IL-2R',
  }),
  bb('BB-0101', 'albumin-binding mini-protein', 'payload', 180, ['half-life extension', 'scaffold'], {
    target: 'albumin',
  }),
  bb('BB-0102', 'de novo EGFR binder', 'payload', 234, ['de novo', 'computational', 'EGFR'], {
    target: 'EGFR',
  }),
  bb('BB-0110', 'His6 tag', 'tag', 18, ['purification', 'IMAC']),
  bb('BB-0111', 'FLAG tag', 'tag', 24, ['detection', 'immunoprecipitation']),
];

/** Standard backbone features, drawn on the construct map's backbone track. */
function backbone(
  resistance: string,
  constants: Array<[string, number]>,
): Vector['backboneFeatures'] {
  return [
    { name: 'MCS', kind: 'mcs', lengthBp: 96, strand: 1 },
    ...constants.map(
      ([name, lengthBp]) => ({ name, kind: 'constant', lengthBp, strand: 1 }) as const,
    ),
    { name: 'bGH polyA', kind: 'polyA', lengthBp: 225, strand: 1 },
    { name: resistance, kind: 'marker', lengthBp: 861, strand: -1 },
    { name: 'ori', kind: 'ori', lengthBp: 589, strand: 1 },
  ];
}

const VECTOR_LIST: Vector[] = [
  {
    id: 'VEC-0001',
    name: 'pcDNA3.4 IgG1 HC backbone',
    isEmpty: false,
    provides: ['ch1', 'ch2', 'ch3'],
    isotype: 'IgG1',
    resistance: 'AmpR',
    lengthBp: 6231,
    backboneFeatures: backbone('AmpR', [
      ['CH1 IgG1', 294],
      ['CH2 IgG1', 327],
      ['CH3 IgG1', 321],
    ]),
  },
  {
    id: 'VEC-0002',
    name: 'pcDNA3.4 IgG4 HC backbone',
    isEmpty: false,
    provides: ['ch1', 'ch2', 'ch3'],
    isotype: 'IgG4',
    resistance: 'AmpR',
    lengthBp: 6198,
    backboneFeatures: backbone('AmpR', [
      ['CH1 IgG4', 294],
      ['CH2 IgG4', 327],
      ['CH3 IgG4', 321],
    ]),
  },
  {
    id: 'VEC-0003',
    name: 'pcDNA3.4 kappa LC backbone',
    isEmpty: false,
    provides: ['cl'],
    isotype: 'kappa',
    resistance: 'AmpR',
    lengthBp: 5720,
    backboneFeatures: backbone('AmpR', [['CL kappa', 321]]),
  },
  {
    id: 'VEC-0004',
    name: 'pTT5 empty backbone',
    isEmpty: true,
    provides: [],
    resistance: 'AmpR',
    lengthBp: 4712,
    backboneFeatures: backbone('AmpR', []),
  },
];

const INSERT_LIST: Insert[] = [
  {
    id: 'INS-0001',
    name: 'anti-HER2 heavy insert (IgG1)',
    kind: 'heavy',
    blocks: {
      promoter: 'BB-0001',
      vh: 'BB-0010',
      ch1: 'BB-0050',
      hinge: 'BB-0040',
      ch2: 'BB-0060',
      ch3: 'BB-0072',
      term: 'BB-0090',
    },
    features: ['HER2', 'IgG1', 'validated'],
  },
  {
    id: 'INS-0002',
    name: 'universal light insert (kappa)',
    kind: 'light',
    blocks: { promoter: 'BB-0001', vl: 'BB-0020', cl: 'BB-0080', term: 'BB-0090' },
    features: ['common light chain', 'kappa', 'validated'],
  },
  {
    id: 'INS-0003',
    name: 'anti-CD3 heavy insert (knob)',
    kind: 'heavy',
    blocks: {
      promoter: 'BB-0001',
      vh: 'BB-0012',
      ch1: 'BB-0050',
      hinge: 'BB-0040',
      ch2: 'BB-0061',
      ch3: 'BB-0070',
      term: 'BB-0090',
    },
    features: ['CD3', 'T-cell engager', 'knob'],
  },
];

/**
 * Slot layouts come from the building block the chain belongs to, so a change on
 * the design pad rewrites the bench row. A Fab is the default on both sides.
 */
export function makeSlots(kind: ChainKind, bb: BbKind = 'fab'): Slot[] {
  const layout = slotsForBb(bb);
  const defs = kind === 'heavy' ? layout.heavy : (layout.light ?? slotsForBb('fab').light!);
  return defs.map((s) => ({ ...s, blockIds: [] }));
}

/**
 * Rewrite a chain's slots for a new layout, keeping any block already chosen for
 * a slot type that survives the change.
 */
export function relayoutSlots(existing: Slot[], defs: Array<{ type: PartType; level: Resolution }>): Slot[] {
  const carried = new Map<PartType, string[]>();
  existing.forEach((s) => {
    if (s.blockIds.length) carried.set(s.type, s.blockIds);
  });
  return defs.map((def) => ({ ...def, blockIds: carried.get(def.type) ?? [] }));
}

export function makeChain(
  id: string,
  name: string,
  kind: ChainKind,
  bb: BbKind = 'fab',
): ChainDesign {
  return {
    id,
    name,
    kind,
    slots: makeSlots(kind, bb),
    vectorId: null,
    constructIds: [],
    regIds: [],
  };
}

/** Two weeks back, so seeded inventory reads as work that predates the session. */
const EARLIER = Date.now() - 14 * 24 * 60 * 60 * 1000;

export function initialRegistry(): Registry {
  const registry: Registry = {
    blocks: {},
    vectors: {},
    inserts: {},
    constructs: {},
    registered: {},
    formats: {},
    molecules: {},
  };
  BLOCK_LIST.forEach((b) => (registry.blocks[b.id] = b));
  VECTOR_LIST.forEach((v) => (registry.vectors[v.id] = v));
  INSERT_LIST.forEach((i) => (registry.inserts[i.id] = i));

  // A universal light chain someone registered earlier. It sits in inventory as
  // something this design can draw on, not as a light chain it already uses.
  registry.constructs['CC-0001'] = {
    id: 'CC-0001',
    insertId: 'INS-0002',
    vectorId: 'VEC-0003',
    chainName: 'Universal light chain',
    createdAt: EARLIER,
  };
  registry.registered['REG-0001'] = {
    id: 'REG-0001',
    constructId: 'CC-0001',
    chainName: 'Universal light chain',
    chainId: 'CH-0001',
    registeredAt: EARLIER,
    inventory: { location: 'Freezer B / rack 4 / box 12', plasmidUg: 480, glycerolStock: true },
  };
  return registry;
}

export const INITIAL_COUNTERS: Counters = {
  BB: 111,
  INS: 3,
  VEC: 4,
  CC: 1,
  REG: 1,
  CH: 21,
  GRP: 0,
  FMT: 0,
  MOL: 0,
};

function heavyWithVh(id: string, name: string, vhId?: string): ChainDesign {
  const chain = makeChain(id, name, 'heavy');
  if (!vhId) return chain;
  return {
    ...chain,
    slots: chain.slots.map((s) => (s.type === 'vh' ? { ...s, blockIds: [vhId] } : s)),
  };
}

/**
 * Opening plate: a shared light chain, eight row heavies and twelve column
 * heavies. A1 keeps the original empty HER2 and CD3 arms so the session still
 * opens on an unfinished bispecific; the other wells carry a VH so each
 * molecule on the plate is already distinct.
 */
export function initialChains(): ChainDesign[] {
  const light = makeChain('CH-0001', 'Universal light chain', 'light');
  light.slots = light.slots.map((s) => {
    const insert = INSERT_LIST[1].blocks[s.type];
    return insert ? { ...s, blockIds: [insert] } : s;
  });
  light.vectorId = 'VEC-0003';
  light.constructIds = ['CC-0001'];
  light.regIds = ['REG-0001'];

  const rowHeavies = [
    heavyWithVh('CH-0002', 'HER2 arm (heavy)'),
    heavyWithVh('CH-0004', 'anti-EGFR heavy', 'BB-0013'),
    heavyWithVh('CH-0005', 'anti-CD20 heavy', 'BB-0014'),
    heavyWithVh('CH-0006', 'anti-HER2 (2C4) heavy', 'BB-0011'),
    heavyWithVh('CH-0007', 'anti-CD3 heavy', 'BB-0012'),
    heavyWithVh('CH-0008', 'anti-HER2 heavy', 'BB-0010'),
    heavyWithVh('CH-0009', 'anti-EGFR heavy', 'BB-0013'),
    heavyWithVh('CH-0010', 'anti-CD20 heavy', 'BB-0014'),
  ];

  const colVhs = [
    'BB-0012',
    'BB-0010',
    'BB-0011',
    'BB-0013',
    'BB-0014',
    'BB-0012',
    'BB-0010',
    'BB-0011',
    'BB-0013',
    'BB-0014',
    'BB-0012',
  ];
  const colNames = [
    'CD3 arm (heavy)',
    'anti-HER2 heavy',
    'anti-HER2 (2C4) heavy',
    'anti-EGFR heavy',
    'anti-CD20 heavy',
    'anti-CD3 heavy',
    'anti-HER2 heavy',
    'anti-HER2 (2C4) heavy',
    'anti-EGFR heavy',
    'anti-CD20 heavy',
    'anti-CD3 heavy',
    'anti-HER2 heavy',
  ];
  const colHeavies = [
    heavyWithVh('CH-0003', colNames[0]),
    ...colVhs.map((vh, i) =>
      heavyWithVh(`CH-${String(11 + i).padStart(4, '0')}`, colNames[i + 1], vh),
    ),
  ];

  return [light, ...rowHeavies, ...colHeavies];
}

/**
 * Opening format: a Fab on each arm, with no light chain bound. A Fab needs one,
 * and whether both arms share a common light chain or carry their own changes the
 * molecule, so the pad asks rather than assumes.
 */
export function initialFormat(): FormatDesign {
  return {
    arms: {
      left: { id: 'left', bb: 'fab', heavyChainId: 'CH-0002', lightChainId: null, fused: [] },
      right: { id: 'right', bb: 'fab', heavyChainId: 'CH-0003', lightChainId: null, fused: [] },
    },
    formatId: null,
    moleculeId: null,
    fc: 'none',
  };
}
