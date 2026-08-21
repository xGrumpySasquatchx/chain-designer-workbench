/**
 * Headless walk through the cloning loop. Runs the reducer the UI runs, so the
 * ID-minting and QC behaviour can be checked without a browser.
 *
 *   npm run smoke
 */
import { bbDef, symmetry } from '../src/model/bioglyph';
import { componentsComplete, variantCount } from '../src/model/combinatorics';
import {
  COL_PITCH,
  CORNER_R,
  DOMAIN_H,
  DOMAIN_W,
  FC,
  GAP,
  ROW_PITCH,
  armAnchor,
  cellBox,
  domainPath,
  lattice,
  slotColors,
  targetSlots,
} from '../src/model/dpad';
import { flowState } from '../src/model/flow';
import { buildMap } from '../src/model/geneious';
import {
  BAR_H,
  HEAD,
  ROW_PITCH as MAP_ROW_PITCH,
  arrowPath,
  bandArcPath,
  coordinate,
  dim,
  shading,
  tangential,
  textOn,
  truncate,
} from '../src/model/mapview';
import { lightChainMode, moleculeReadiness } from '../src/model/molecule';
import { uniqueChainIds, wellRange, lumaUid, wellElementColors, componentColor } from '../src/model/plate';
import { DEFAULT_PALETTE_ID, PLATE_PALETTES, wellPieBackground } from '../src/model/palettes';
import { inAlphabet, lengthIn } from '../src/model/parts';
import { runFormatQc, runQc } from '../src/model/qc';
import {
  STAGES,
  bottleneck,
  buildTracker,
  chainSchedule,
  cloneStages,
  computeStage,
  emptyActuals,
  expectedDuration,
  programDuration,
  programStartDate,
  totalEffective,
  weeklyCapacity,
  weeksToClear,
} from '../src/model/pep';
import { createInitialState, reducer, type Action, type AppState } from '../src/state/store';

let failures = 0;

function check(label: string, condition: boolean, detail = '') {
  if (!condition) failures++;
  console.log(`${condition ? 'pass' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

function run(state: AppState, ...actions: Action[]): AppState {
  return actions.reduce(reducer, state);
}

let state = createInitialState();
const HEAVY = 'CH-0002';
const HEAVY_B = 'CH-0003';
const LIGHT = 'CH-0001';

console.log('\n— seeded worklist —');
check('three chains on the bench', state.bench.length === 3);
check(
  'light chain arrives registered',
  flowState(state.chains[LIGHT], state.registry).activeId === 'reg-info',
);
check(
  'heavy chain starts at define-components',
  flowState(state.chains[HEAVY], state.registry).activeId === 'define-components',
);

console.log('\n— swap-and-clone: one VH onto an IgG1 backbone —');
const vhSlot = state.chains[HEAVY].slots.findIndex((s) => s.type === 'vh');
state = run(
  state,
  { type: 'place-block', chainId: HEAVY, slotIndex: vhSlot, blockId: 'BB-0010' },
  { type: 'set-vector', chainId: HEAVY, vectorId: 'VEC-0001' },
);
check(
  'backbone satisfies CH1/CH2/CH3',
  componentsComplete(state.chains[HEAVY], state.registry),
  'only VH had to be chosen',
);
check(
  'flow advances to assemble',
  flowState(state.chains[HEAVY], state.registry).activeId === 'assemble',
);

state = run(state, { type: 'assemble', chainId: HEAVY });
const cc = state.chains[HEAVY].constructIds;
check('one CC-id minted', cc.length === 1, cc.join(', '));
check('construct points at a minted insert', !!state.registry.constructs[cc[0]]?.insertId);
check('QC passes', runQc(state.chains[HEAVY], state.registry).status !== 'fail');

state = run(state, { type: 'register', chainId: HEAVY });
check('REG-id minted', state.chains[HEAVY].regIds.length === 1, state.chains[HEAVY].regIds[0]);
check(
  'registered chain lands in inventory',
  !!state.registry.registered[state.chains[HEAVY].regIds[0]]?.inventory.location,
);

console.log('\n— editing a registered design mints a new CC-id —');
const beforeEdit = state.chains[HEAVY].constructIds[0];
state = run(
  state,
  { type: 'edit-construct', chainId: HEAVY },
  { type: 'place-block', chainId: HEAVY, slotIndex: vhSlot, blockId: 'BB-0011' },
  { type: 'assemble', chainId: HEAVY },
);
check(
  'new selection produces a different construct',
  state.chains[HEAVY].constructIds[0] !== beforeEdit,
  `${beforeEdit} → ${state.chains[HEAVY].constructIds[0]}`,
);

console.log('\n— reusing an identical design does not mint a duplicate —');
let reuse = run(
  createInitialState(),
  { type: 'place-block', chainId: HEAVY, slotIndex: vhSlot, blockId: 'BB-0010' },
  { type: 'set-vector', chainId: HEAVY, vectorId: 'VEC-0001' },
  { type: 'assemble', chainId: HEAVY },
);
const firstCc = reuse.chains[HEAVY].constructIds[0];
reuse = run(reuse, { type: 'edit-construct', chainId: HEAVY }, { type: 'assemble', chainId: HEAVY });
check(
  'same insert + vector resolves to the existing CC-id',
  reuse.chains[HEAVY].constructIds[0] === firstCc,
  firstCc,
);

console.log('\n— combinatorics: three stacked VH options —');
const vhSlotB = state.chains[HEAVY_B].slots.findIndex((s) => s.type === 'vh');
state = run(
  state,
  { type: 'place-block', chainId: HEAVY_B, slotIndex: vhSlotB, blockId: 'BB-0012' },
  { type: 'place-block', chainId: HEAVY_B, slotIndex: vhSlotB, blockId: 'BB-0013', stack: true },
  { type: 'place-block', chainId: HEAVY_B, slotIndex: vhSlotB, blockId: 'BB-0014', stack: true },
  { type: 'set-vector', chainId: HEAVY_B, vectorId: 'VEC-0001' },
);
check('three variants expressed by stacking', variantCount(state.chains[HEAVY_B]) === 3);
check(
  'stacked combinatorics raise a QC warning, not a failure',
  runQc(state.chains[HEAVY_B], state.registry).checks.find((c) => c.id === 'combinatorics')
    ?.status === 'warn',
);

state = run(state, { type: 'assemble', chainId: HEAVY_B }, { type: 'register', chainId: HEAVY_B });
check('three CC-ids minted', state.chains[HEAVY_B].constructIds.length === 3);
check(
  'three REG-ids minted',
  state.chains[HEAVY_B].regIds.length === 3,
  state.chains[HEAVY_B].regIds.join(', '),
);

console.log('\n— compatibility: IgG4 CH1 against an IgG1 backbone —');
const conflict = run(
  createInitialState(),
  { type: 'place-block', chainId: HEAVY, slotIndex: vhSlot, blockId: 'BB-0010' },
  { type: 'set-vector', chainId: HEAVY, vectorId: 'VEC-0001' },
  {
    type: 'place-block',
    chainId: HEAVY,
    slotIndex: createInitialState().chains[HEAVY].slots.findIndex((s) => s.type === 'ch1'),
    blockId: 'BB-0051',
  },
);
const conflictQc = runQc(conflict.chains[HEAVY], conflict.registry);
check('isotype conflict fails QC', conflictQc.status === 'fail');
check(
  'failure names the isotypes',
  conflictQc.checks.find((c) => c.id === 'isotype')?.detail.includes('IgG4') === true,
);
check(
  'a failing construct cannot be registered',
  run(conflict, { type: 'assemble', chainId: HEAVY }, { type: 'register', chainId: HEAVY }).chains[
    HEAVY
  ].regIds.length === 0,
);

console.log('\n— bench: group, eject, ungroup, reorder —');
let bench = run(
  createInitialState(),
  { type: 'select', id: HEAVY, mode: 'single' },
  { type: 'select', id: HEAVY_B, mode: 'toggle' },
  { type: 'group-selected' },
);
const group = bench.bench.find((n) => n.kind === 'group');
check('two chains grouped', group?.kind === 'group' && group.children.length === 2);
check('bench collapses to two top-level nodes', bench.bench.length === 2);

bench = run(bench, { type: 'eject', chainId: HEAVY });
const afterEject = bench.bench.find((n) => n.kind === 'group');
check(
  'ejecting leaves the rest of the group intact',
  afterEject?.kind === 'group' && afterEject.children.length === 1,
);
check(
  'ejected chain returns to the top level',
  bench.bench.some((n) => n.kind === 'chain' && n.id === HEAVY),
);

bench = run(bench, { type: 'eject', chainId: HEAVY_B });
check(
  'emptying a group dissolves it',
  bench.bench.every((n) => n.kind === 'chain'),
);

bench = run(bench, { type: 'reorder', dragId: LIGHT, beforeId: null, container: null });
check(
  'reorder moves a row to the end',
  bench.bench[bench.bench.length - 1].id === LIGHT,
  bench.bench.map((n) => n.id).join(' → '),
);

console.log('\n— unregistered chains can leave the bench —');
let draft = run(createInitialState(), { type: 'add-chain', kind: 'heavy' });
const minted = draft.bench[draft.bench.length - 1].id;
check('adding a heavy chain puts a draft on the bench', !!draft.chains[minted] && draft.chains[minted].regIds.length === 0);
draft = run(draft, { type: 'remove-chain', chainId: minted });
check('removing an unregistered chain drops it from the bench', !draft.chains[minted] && !draft.bench.some((n) => n.id === minted));
check(
  'a registered chain stays put',
  run(createInitialState(), { type: 'remove-chain', chainId: LIGHT }).chains[LIGHT]?.regIds[0] ===
    'REG-0001',
);
const unbound = run(createInitialState(), { type: 'remove-chain', chainId: HEAVY });
check(
  'removing a chain bound to an arm clears that arm',
  unbound.format.arms.left.bb === 'empty' && unbound.format.arms.left.heavyChainId === null,
);
check('focus moves to a chain that is still on the bench', !!unbound.chains[unbound.focusChainId]);
check(
  'a shared row chain stays in the catalog when removed from one well',
  !!unbound.chains[HEAVY] && !unbound.bench.some((n) => n.id === HEAVY),
);

console.log('\n— 96-well plate drives the bench —');
const plate0 = createInitialState();
check('the plate has 96 wells', plate0.plate.length === 96);
check('A1 is selected and shows the original three chains', plate0.selectedWells[0] === 'A1' && plate0.bench.length === 3);
check(
  'every well arrives from Luma with a unique UID',
  plate0.plate[0].lumaUid === 'LUM-0001' &&
    plate0.plate[95].lumaUid === lumaUid(7, 11) &&
    new Set(plate0.plate.map((w) => w.lumaUid)).size === 96,
);
check(
  'a well is coloured by its molecule elements',
  wellElementColors(
    plate0.plate[0],
    plate0.chains,
    plate0.registry,
    plate0.wellComponentColors,
    plate0.wellPaletteId,
    uniqueChainIds(plate0.plate),
  ).length === plate0.plate[0].chainIds.length,
);
check('the default well palette is Magenta Dream', plate0.wellPaletteId === DEFAULT_PALETTE_ID);

console.log('\n— plate queue —');
check('today’s queue has six plates', plate0.plateQueue.length === 6);
check('the opening plate is on the bench', plate0.activePlateId === 'PLT-0001' && plate0.plate[0].lumaUid === 'LUM-0001');
check('the plate view starts with the opening plate only', plate0.activePlateIds.join() === 'PLT-0001');
const p4 = run(plate0, { type: 'open-queue-plate', plateId: 'PLT-0002' });
check(
  'opening a queued plate loads its wells, not a picture of the plate',
  p4.activePlateId === 'PLT-0002' && p4.plate[0].lumaUid === 'LUM-0097' && p4.selectedWells[0] === 'A1',
);
check('a plain click replaces the open set', p4.activePlateIds.join() === 'PLT-0002');
check('the previous plate is marked in progress', p4.plateQueue.find((p) => p.id === 'PLT-0001')?.status === 'in-progress');
check(
  'a half-filled plate stops at the last occupied well',
  p4.plate.filter((w) => w.chainIds.length > 0).length === 48 && p4.plate[48].chainIds.length === 0,
);
const back = run(p4, { type: 'open-queue-plate', plateId: 'PLT-0001' });
check('switching back restores the original Luma series', back.plate[0].lumaUid === 'LUM-0001');
const multi = run(plate0, { type: 'open-queue-plate', plateId: 'PLT-0002', mode: 'toggle' });
check('cmd-select keeps both plates in view', multi.activePlateIds.join(',') === 'PLT-0001,PLT-0002');
check('the original plate stays primary while others are added', multi.activePlateId === 'PLT-0001');
check('the primary wells stay on the bench', multi.plate[0].lumaUid === 'LUM-0001');
const span = run(plate0, { type: 'open-queue-plate', plateId: 'PLT-0003', mode: 'range' });
check('shift-select opens the queue span', span.activePlateIds.join(',') === 'PLT-0001,PLT-0002,PLT-0003');
check('the clicked end of the span becomes primary', span.activePlateId === 'PLT-0003');
const wellOnOther = run(multi, { type: 'select-wells', wellId: 'B3', mode: 'single', plateId: 'PLT-0002' });
check(
  'clicking a well on another open plate makes it primary',
  wellOnOther.activePlateId === 'PLT-0002' && wellOnOther.selectedWells[0] === 'B3',
);
check(
  'the first plate is persisted when focusing another',
  wellOnOther.plateQueue.find((p) => p.id === 'PLT-0001')?.wells[0].lumaUid === 'LUM-0001',
);
check(
  'well pies start at twelve o\'clock',
  wellPieBackground(['#111111', '#222222', '#333333']).startsWith('conic-gradient(from -90deg'),
);
check('six palettes are offered for the plate', PLATE_PALETTES.length === 6);
const paletted = run(plate0, { type: 'set-well-palette', paletteId: 'golden-sunrise' });
check(
  'choosing a palette recolors wells in plate order',
  paletted.wellPaletteId === 'golden-sunrise' &&
    wellElementColors(
      paletted.plate[0],
      paletted.chains,
      paletted.registry,
      paletted.wellComponentColors,
      paletted.wellPaletteId,
      uniqueChainIds(paletted.plate),
    )[0] === PLATE_PALETTES.find((p) => p.id === 'golden-sunrise')!.colors[0],
);
const recolored = run(plate0, { type: 'set-well-color', chainId: LIGHT, color: '#00aa88' });
check(
  'a component colour can be customized',
  componentColor(LIGHT, recolored.chains, recolored.registry, recolored.wellComponentColors) ===
    '#00aa88',
);
const restored = run(recolored, { type: 'reset-well-colors' });
check('resetting plate colours drops the override', !restored.wellComponentColors[LIGHT]);
const rowA = run(plate0, { type: 'select-wells', wellId: 'A12', mode: 'range' });
check(
  'shift-selecting A12 from A1 takes the whole row',
  rowA.selectedWells.length === 12 && rowA.selectedWells[0] === 'A1' && rowA.selectedWells[11] === 'A12',
);
check(
  'a row selection shows the shared heavy chain once',
  rowA.bench.filter((n) => n.id === HEAVY).length === 1,
);
check(
  'a row selection unions the column partner chains',
  uniqueChainIds(rowA.plate.filter((w) => rowA.selectedWells.includes(w.id))).length === 14,
);
const block = wellRange('A1', 'B2');
check('a plate range is the rectangle between two wells', block.join(',') === 'A1,A2,B1,B2');
const named = run(plate0, { type: 'rename-chain', chainId: HEAVY, name: 'HER2 heavy v2' });
check('a chain name is editable', named.chains[HEAVY].name === 'HER2 heavy v2');
const withVh = run(
  plate0,
  { type: 'select-component', chainId: HEAVY, slotIndex: plate0.chains[HEAVY].slots.findIndex((s) => s.type === 'vh') },
  { type: 'place-block', chainId: HEAVY, slotIndex: plate0.chains[HEAVY].slots.findIndex((s) => s.type === 'vh'), blockId: 'BB-0010' },
);
const added = run(withVh, { type: 'add-chain', kind: 'heavy' });
const addedId = added.bench[added.bench.length - 1].id;
check(
  'a new heavy chain takes its name from the selected V region',
  added.chains[addedId].name === 'anti-HER2 heavy',
  added.chains[addedId].name,
);
let namedNew = run(plate0, { type: 'add-chain', kind: 'heavy' });
const newId = namedNew.bench[namedNew.bench.length - 1].id;
const newVh = namedNew.chains[newId].slots.findIndex((s) => s.type === 'vh');
namedNew = run(namedNew, {
  type: 'place-block',
  chainId: newId,
  slotIndex: newVh,
  blockId: 'BB-0013',
});
check(
  'placing a V region on a New chain names it',
  namedNew.chains[newId].name === 'anti-EGFR heavy',
  namedNew.chains[newId].name,
);

console.log('\n— resolution is a view setting —');
let view = run(createInitialState(), { type: 'set-resolution', level: 3 });
check('global resolution changes', view.resolution === 3);
view = run(view, { type: 'cycle-row-resolution', chainId: HEAVY });
check('row override is independent of the global level', view.chains[HEAVY].resolutionOverride === 1);
check(
  'no slot data is lost at a lower resolution',
  view.chains[LIGHT].slots.filter((s) => s.blockIds.length).length === 4,
);

console.log('\n— one component vocabulary at a time —');
const base = createInitialState();
const allBlocks = Object.values(base.registry.blocks);
const ntVisible = allBlocks.filter((b) => inAlphabet(b.molecule, 'nt'));
const aaVisible = allBlocks.filter((b) => inAlphabet(b.molecule, 'aa'));
check('nucleotide view shows every component', ntVisible.length === allBlocks.length);
check(
  'amino-acid view hides regulatory DNA',
  aaVisible.length < ntVisible.length && aaVisible.every((b) => b.molecule === 'protein'),
  `${aaVisible.length} of ${ntVisible.length}`,
);
check('lengths switch units with the alphabet', lengthIn(363, 'aa') === '121 aa');
check(
  'the toggle is a single view setting',
  reducer(base, { type: 'set-alphabet', alphabet: 'aa' }).alphabet === 'aa',
);

console.log('\n— design pad drives the bench —');
let pad = createInitialState();
check(
  'the seeded format has a Fab on each arm and no light chain bound',
  pad.format.arms.left.bb === 'fab' &&
    pad.format.arms.right.bb === 'fab' &&
    lightChainMode(pad.format) === 'unset',
);
pad = run(
  pad,
  { type: 'place-block', chainId: HEAVY, slotIndex: vhSlot, blockId: 'BB-0010' },
  {
    type: 'place-block',
    chainId: HEAVY_B,
    slotIndex: pad.chains[HEAVY_B].slots.findIndex((s) => s.type === 'vh'),
    blockId: 'BB-0012',
  },
);
const bispecific = symmetry(pad.format, pad.chains, pad.registry);
check('two different targets read as asymmetric', !bispecific.symmetric);
check('an asymmetric format calls for a heterodimeric Fc', bispecific.fc === 'heterodimer');

const asVhh = run(pad, { type: 'set-arm-bb', arm: 'right', bb: 'vhh' });
check(
  'swapping in a VHH drops CH1 from that chain',
  !asVhh.chains[HEAVY_B].slots.some((s) => s.type === 'ch1'),
  asVhh.chains[HEAVY_B].slots.map((s) => s.type).join('-'),
);
check(
  'the VH already chosen survives the layout change',
  asVhh.chains[HEAVY_B].slots.find((s) => s.type === 'vh')?.blockIds[0] === 'BB-0012',
);

const asScfv = run(pad, { type: 'set-arm-bb', arm: 'right', bb: 'scfv' });
check(
  'an scFv puts VH and VL on one chain',
  ['vh', 'vl'].every((t) => asScfv.chains[HEAVY_B].slots.some((s) => s.type === t)),
);
check('a single-chain block needs no light chain', bbDef('scfv').needsLightChain === false);

const tagged = run(pad, { type: 'fuse-bb', arm: 'left', bb: 'tag' });
check(
  'fusing a tag adds a tag slot to that arm',
  tagged.chains[HEAVY].slots.some((s) => s.type === 'tag'),
);

console.log('\n— Fc building blocks sit on the scaffold —');
check('Homo-Fc and Hetero-Fc are in the palette', bbDef('homofc').scaffold === true && bbDef('heterofc').scaffold === true);
check('the opening format has no Fc building block yet', pad.format.fc === 'none');
const withHomo = run(pad, { type: 'set-fc-bb', bb: 'homofc' });
check('placing Homo-Fc does not register a format', withHomo.format.formatId === null && withHomo.format.moleculeId === null);
check(
  'Homo-Fc writes wild-type CH3 on both heavy chains',
  withHomo.chains[HEAVY].slots.find((s) => s.type === 'ch3')?.blockIds[0] === 'BB-0072' &&
    withHomo.chains[HEAVY_B].slots.find((s) => s.type === 'ch3')?.blockIds[0] === 'BB-0072',
);
const withHetero = run(pad, { type: 'set-fc-bb', bb: 'heterofc' });
check(
  'Hetero-Fc writes knob and hole across the two heavy chains',
  withHetero.chains[HEAVY].slots.find((s) => s.type === 'ch3')?.blockIds[0] === 'BB-0070' &&
    withHetero.chains[HEAVY_B].slots.find((s) => s.type === 'ch3')?.blockIds[0] === 'BB-0071',
);
check(
  'placing Hetero-Fc still leaves registration to the designer',
  withHetero.format.fc === 'heterofc' && !withHetero.format.formatId,
);
check(
  'Hetero-Fc on an asymmetric format passes CH3 pairing',
  runFormatQc(withHetero.format, withHetero.chains, withHetero.registry).checks.find(
    (c) => c.id === 'knob-hole',
  )?.status === 'pass',
);

console.log('\n— format identity is reused, not re-minted —');
let fmt = run(pad, { type: 'register-format' });
const firstFormat = fmt.format.formatId;
check('a new format mints an FMT-id', !!firstFormat, firstFormat ?? '');
fmt = run(fmt, { type: 'register-format' });
check('re-registering the same format reuses it', fmt.format.formatId === firstFormat);
fmt = run(fmt, { type: 'set-arm-bb', arm: 'right', bb: 'vhh' }, { type: 'register-format' });
check('changing an arm produces a different format', fmt.format.formatId !== firstFormat);
check('the earlier format stays in the library', !!fmt.registry.formats[firstFormat!]);

console.log('\n— knob-into-hole is checked against the format —');
const ch3Slot = (s: AppState, id: string) => s.chains[id].slots.findIndex((x) => x.type === 'ch3');
let hetero = run(
  pad,
  { type: 'place-block', chainId: HEAVY, slotIndex: ch3Slot(pad, HEAVY), blockId: 'BB-0072' },
  { type: 'place-block', chainId: HEAVY_B, slotIndex: ch3Slot(pad, HEAVY_B), blockId: 'BB-0072' },
);
check(
  'wild-type CH3 on both chains fails an asymmetric format',
  runFormatQc(hetero.format, hetero.chains, hetero.registry).checks.find(
    (c) => c.id === 'knob-hole',
  )?.status === 'fail',
);
hetero = run(hetero, {
  type: 'place-block',
  chainId: HEAVY_B,
  slotIndex: ch3Slot(hetero, HEAVY_B),
  blockId: 'BB-0070',
});
hetero = run(hetero, {
  type: 'place-block',
  chainId: HEAVY,
  slotIndex: ch3Slot(hetero, HEAVY),
  blockId: 'BB-0071',
});
check(
  'a knob and hole pair passes',
  runFormatQc(hetero.format, hetero.chains, hetero.registry).checks.find(
    (c) => c.id === 'knob-hole',
  )?.status === 'pass',
);

console.log('\n— an empty chain cannot be registered —');
// An arm block with no variable domain leaves its chain nothing to express, and
// the backbone alone must not be registrable as a chain.
const hollow = run(
  createInitialState(),
  { type: 'set-arm-bb', arm: 'right', bb: 'fc' },
  { type: 'set-vector', chainId: HEAVY_B, vectorId: 'VEC-0001' },
);
check(
  'a chain with no coding regions fails QC',
  runQc(hollow.chains[HEAVY_B], hollow.registry).status === 'fail',
);
check(
  'so it never reaches inventory',
  run(hollow, { type: 'assemble', chainId: HEAVY_B }, { type: 'register', chainId: HEAVY_B }).chains[
    HEAVY_B
  ].regIds.length === 0,
);

console.log('\n— the light chain is a choice, not a default —');
const fresh = createInitialState();
check(
  'a Fab arm starts unpaired, so nothing is assumed',
  !fresh.format.arms.left.lightChainId && !fresh.format.arms.right.lightChainId,
);
check(
  'format QC asks for the choice instead of making it',
  runFormatQc(fresh.format, fresh.chains, fresh.registry).checks.find(
    (c) => c.id === 'light-pairing',
  )?.status === 'warn',
);
check(
  'placing a Fab on an arm does not adopt a light chain',
  !run(fresh, { type: 'set-arm-bb', arm: 'right', bb: 'fab' }).format.arms.right.lightChainId,
);

const common = run(fresh, { type: 'choose-light-chain', mode: 'common', chainId: LIGHT });
check(
  'choosing a common light chain pairs both arms with it',
  lightChainMode(common.format) === 'common' && common.format.arms.right.lightChainId === LIGHT,
);
check(
  'a common light chain passes the pairing check',
  runFormatQc(common.format, common.chains, common.registry).checks.find(
    (c) => c.id === 'light-pairing',
  )?.status === 'pass',
);

const perArm = run(common, { type: 'choose-light-chain', mode: 'per-arm' });
check(
  'one per arm keeps the first arm and mints a light chain for the other',
  perArm.format.arms.left.lightChainId === LIGHT &&
    perArm.format.arms.right.lightChainId !== LIGHT,
  perArm.format.arms.right.lightChainId ?? '',
);
const mintedLight = perArm.format.arms.right.lightChainId ?? '';
check(
  'the minted light chain has its own CH-id and reaches the bench',
  /^CH-\d{4}$/.test(mintedLight) &&
    perArm.bench.some((n) => n.id === mintedLight) &&
    perArm.chains[mintedLight].kind === 'light',
  mintedLight,
);
check(
  'a light chain minted for a Fab arm carries the light-side layout',
  perArm.chains[mintedLight].slots.map((s) => s.type).join('-') === 'promoter-vl-cl-term',
);
check(
  'two light chains warn about mispairing rather than passing',
  runFormatQc(perArm.format, perArm.chains, perArm.registry).checks.find(
    (c) => c.id === 'light-pairing',
  )?.status === 'warn',
);
check(
  'clearing the choice leaves both arms unpaired again',
  lightChainMode(run(perArm, { type: 'choose-light-chain', mode: 'none' }).format) === 'unset',
);
check(
  'a block that needs no light chain drops the one it had',
  !run(common, { type: 'set-arm-bb', arm: 'left', bb: 'vhh' }).format.arms.left.lightChainId,
);
check(
  'the universal light chain is still in inventory to be chosen',
  createInitialState().registry.registered['REG-0001'].chainName === 'Universal light chain',
);

console.log('\n— the molecule that gets made has its own ID —');
let mol = run(
  createInitialState(),
  { type: 'choose-light-chain', mode: 'common', chainId: LIGHT },
  { type: 'place-block', chainId: HEAVY, slotIndex: vhSlot, blockId: 'BB-0010' },
  { type: 'place-block', chainId: HEAVY, slotIndex: ch3Slot(createInitialState(), HEAVY), blockId: 'BB-0070' },
  { type: 'set-vector', chainId: HEAVY, vectorId: 'VEC-0001' },
  { type: 'assemble', chainId: HEAVY },
  { type: 'register', chainId: HEAVY },
);
mol = run(mol, { type: 'register-molecule' });
check(
  'a molecule with an unregistered chain is not registered',
  !mol.format.moleculeId,
  moleculeReadiness(mol.format, mol.chains).unregistered.map((c) => c.name).join(', '),
);

mol = run(
  mol,
  { type: 'place-block', chainId: HEAVY_B, slotIndex: vhSlotB, blockId: 'BB-0012' },
  { type: 'place-block', chainId: HEAVY_B, slotIndex: ch3Slot(mol, HEAVY_B), blockId: 'BB-0071' },
  { type: 'set-vector', chainId: HEAVY_B, vectorId: 'VEC-0001' },
  { type: 'assemble', chainId: HEAVY_B },
  { type: 'register', chainId: HEAVY_B },
  { type: 'register-molecule' },
);
const molId = mol.format.moleculeId ?? '';
check('registering every chain mints a MOL-id', /^MOL-\d{4}$/.test(molId), molId);
const record = mol.registry.molecules[molId];
check(
  'the molecule records the registered chains it is built from',
  record.regIds.length === 3 &&
    record.regIds.every((id) => !!mol.registry.registered[id]),
  record.regIds.join(', '),
);
check(
  'it is named for what it binds and how it is built',
  record.name.includes('HER2') && record.name.includes('CD3') && record.name.includes('bispecific'),
  record.name,
);
check('registering the molecule settles its format too', !!record.formatId && !!mol.format.formatId);
check('an asymmetric molecule records a heterodimeric Fc', record.fc === 'heterodimer');
check(
  're-registering the same molecule reuses the identifier',
  run(mol, { type: 'register-molecule' }).format.moleculeId === molId,
);
check(
  'reopening one of its chains unsettles the molecule',
  !run(mol, { type: 'edit-construct', chainId: HEAVY }).format.moleculeId,
);
const second = run(
  mol,
  { type: 'place-block', chainId: HEAVY_B, slotIndex: vhSlotB, blockId: 'BB-0013' },
  { type: 'edit-construct', chainId: HEAVY_B },
  { type: 'assemble', chainId: HEAVY_B },
  { type: 'register', chainId: HEAVY_B },
  { type: 'register-molecule' },
);
check(
  'a different molecule mints a new identifier',
  second.format.moleculeId !== molId && Object.keys(second.registry.molecules).length === 2,
  Object.keys(second.registry.molecules).join(', '),
);

console.log('\n— reviewing what was registered —');
check(
  'the review opens and closes from one flag',
  run(mol, { type: 'open-review', open: true }).reviewOpen &&
    !run(mol, { type: 'open-review', open: true }, { type: 'open-review', open: false }).reviewOpen,
);
const reg = mol.registry.registered[mol.chains[HEAVY].regIds[0]];
check(
  'a registration names the chain it came from',
  reg.chainId === HEAVY && reg.registeredAt > 0,
);
const provenance = mol.registry.constructs[reg.constructId];
check(
  'every registration resolves to a construct, insert and backbone',
  !!provenance &&
    !!mol.registry.inserts[provenance.insertId] &&
    !!mol.registry.vectors[provenance.vectorId],
  `${reg.id} → ${provenance.id} → ${provenance.insertId} + ${provenance.vectorId}`,
);
check(
  'the molecule check reports the identifier once registered',
  runFormatQc(mol.format, mol.chains, mol.registry)
    .checks.find((c) => c.id === 'molecule')
    ?.detail.includes(molId) === true,
);

console.log('\n— construct map —');
const mapped = run(
  createInitialState(),
  { type: 'place-block', chainId: HEAVY, slotIndex: vhSlot, blockId: 'BB-0010' },
  { type: 'set-vector', chainId: HEAVY, vectorId: 'VEC-0001' },
);
const model = buildMap(mapped.chains[HEAVY], mapped.registry);
check('a construct with a backbone is circular', model.circular);
check(
  'insert annotations come before backbone features',
  model.features.filter((f) => f.track === 'insert').every((f) => f.start <= model.insertBp),
);
check(
  'features carry coordinates in order without gaps',
  model.features.every((f, i, all) => i === 0 || f.start === all[i - 1].end + 1),
);
check(
  'backbone track carries the marker and origin',
  ['AmpR', 'ori'].every((name) => model.features.some((f) => f.name === name)),
);
check(
  'constant regions the backbone supplies are not duplicated',
  model.features.filter((f) => f.name.startsWith('CH1')).length === 1,
);
check(
  'insert features link back to a bench slot',
  model.features
    .filter((f) => f.track === 'insert')
    .every((f) => f.chainId === HEAVY && typeof f.slotIndex === 'number'),
);
const noBackbone = buildMap(createInitialState().chains[HEAVY], createInitialState().registry);
check('without a backbone there is nothing circular to show', !noBackbone.circular);

console.log('\n— panels share one selection —');
let linked = run(mapped, { type: 'select-component', chainId: HEAVY, slotIndex: vhSlot });
check('selecting a component focuses its chain', linked.focusChainId === HEAVY);
check(
  'the selection is addressable by every panel',
  linked.activeSlot?.chainId === HEAVY && linked.activeSlot.slotIndex === vhSlot,
);
const feature = buildMap(linked.chains[HEAVY], linked.registry).features.find(
  (f) => f.slotIndex === vhSlot,
);
check('the map feature id matches the shared selection', feature?.id === `${HEAVY}-${vhSlot}`);
linked = run(linked, { type: 'select', id: HEAVY_B, mode: 'toggle' });
check(
  'row multi-selection survives a component selection',
  linked.selection.includes(HEAVY_B),
);

console.log('\n— design pad geometry —');
const fab = lattice('fab');
check('a Fab is four domains on a two-by-two lattice', fab.cells.length === 4 && fab.cols === 2 && fab.rows === 2);
check(
  'only variable domains carry the notch',
  fab.cells.every((c) => c.notch === (c.type === 'vh' || c.type === 'vl')),
);
check(
  'the two-chain Fab is held by a disulfide, the single-chain one by a linker',
  fab.disulfide && !fab.staple && lattice('scfab').staple && !lattice('scfab').disulfide,
);
check('Homo-Fc and Hetero-Fc share the four-domain Fc lattice', lattice('homofc').cols === 2 && lattice('heterofc').rows === 2);
check(
  'the crossover Fab puts CL on the heavy chain',
  lattice('xfab').cells.some((c) => c.type === 'cl' && c.side === 'heavy'),
);
check('non-Ig blocks are a single lozenge', lattice('mutein').cells.every((c) => c.lozenge));
check(
  'the domain box keeps BioGlyph proportions',
  Math.abs(DOMAIN_W / DOMAIN_H - 6 / 11) < 1e-9 && Math.abs(CORNER_R / DOMAIN_W - 0.083) < 0.001,
);
check(
  'columns and rows are one box plus a two-unit gap',
  COL_PITCH === DOMAIN_W + GAP && ROW_PITCH === DOMAIN_H + GAP,
);
const notched = domainPath(cellBox(fab.cells[0], 2), CORNER_R, true);
const plain = domainPath(cellBox(fab.cells[2], 2), CORNER_R, false);
check(
  'the notch adds arcs to the outline rather than replacing it',
  notched.split('A').length === plain.split('A').length + 4,
);
check(
  'arms mirror each other around the Fc',
  armAnchor('left').tilt === -armAnchor('right').tilt && armAnchor('left').mirror,
);
check(
  'each arm stem lands on its own Fc column',
  armAnchor('left').stem.x < FC.cx && armAnchor('right').stem.x > FC.cx,
);
const padSlots = targetSlots(linked.format, linked.chains, linked.registry);
check(
  'the first target on the pad takes the first colour slot',
  padSlots.get('HER2') === 0 && slotColors(0).base === '#448DBF',
);
check(
  'a block draws its two chains as a shade and a lighter tint',
  slotColors(0).base !== slotColors(0).tint && slotColors(undefined).base === '#8F8F8F',
);

console.log('\n— construct map rendering —');
check(
  'the arrowhead is half the bar height, so both edges are at 45 degrees',
  HEAD * 2 === BAR_H,
);
check('a bar row is the bar plus its shadow plus a gap', MAP_ROW_PITCH === BAR_H + 2 + 1);
const plus = arrowPath(0, 0, 60, 1);
const minus = arrowPath(0, 0, 60, -1);
check(
  'an annotation has one point and a rounded flat end',
  plus.split('A').length === 3 && minus.split('A').length === 3,
);
check(
  'the point follows the strand',
  plus.includes(`L 60 ${BAR_H / 2}`) && minus.includes(`L 0 ${BAR_H / 2}`),
);
const green = shading('#00B200');
check(
  'fills are shaded from a brighter stop down to a darker one',
  green.top > green.mid && green.bottom < green.mid && green.outline < green.bottom,
);
check(
  'a fill that cannot brighten desaturates instead',
  shading('#FFFF00').top.toLowerCase().startsWith('#ffff'),
);
check('deselected content is half alpha over white', dim('#00B200') === '#80d980');
check(
  'label text takes the readable side of its fill',
  textOn('#FFFF00') === '#1A1A1A' && textOn('#00B200') === '#FFFFFF',
);
check('ruler numbers carry thousands separators', coordinate(6720) === '6,720');
check(
  'a label too long for the space it has is shortened, not clipped',
  truncate('IgG1 hinge (EPKSCDKTHT)', 12) === 'IgG1 hinge…' && truncate('ori', 12) === 'ori',
);
check(
  'circular ruler labels flip on the lower half to stay upright',
  tangential(200) === 20 && tangential(20) === 20,
);
const arc = bandArcPath(1, 900, 3600, 100, 15, 1, 0, 0);
check('a circular annotation is an arc band closed at the point', arc.split('A').length === 3);
check(
  'the backbone origin takes the Geneious rep_origin colour',
  model.features.find((f) => f.name === 'ori')?.color === '#00A8F0',
);

console.log('\n— expression & purification PERT —');
const construct = STAGES[0];
check(
  'PERT expected is (O + 4L + P) / 6',
  Math.abs(expectedDuration(construct) - (0.5 + 4 + 2) / 6) < 1e-12,
);
check(
  'effective duration adds the scheduling buffer',
  Math.abs(totalEffective(construct) - (expectedDuration(construct) + 0.25)) < 1e-12,
);
const harvest = STAGES.find((s) => s.id === 13)!;
check(
  'harvest weekly throughput is batch × 7 / cycle',
  Math.abs(weeklyCapacity(harvest) - (8 * 7) / totalEffective(harvest)) < 1e-9,
);
check('harvest is the pipeline bottleneck', bottleneck(STAGES).stage.id === 13);
check(
  'a single construct is about 44 calendar days',
  Math.abs(programDuration(STAGES) - 43.95) < 1e-6,
);
const cloning = computeStage(STAGES.find((s) => s.id === 6)!, STAGES);
check(
  'cloning rework cost is the sum of stages 3–6',
  cloning.reworkCost != null && Math.abs(cloning.reworkCost - 9.166666666666668) < 1e-9,
);
const start = programStartDate();
const baseline = chainSchedule(STAGES, start);
const delayed = emptyActuals();
delayed[1] = { start: '2026-09-01', duration: '2', reworkDelay: '0' };
const rows = buildTracker(cloneStages(), delayed, baseline, start);
check(
  'an actual duration longer than baseline slips the program forecast',
  rows[0].status === 'complete' && rows[14].varianceD > 0.6,
);
check(
  'twelve targets clear in under two weeks at the harvest rate',
  Math.abs((weeksToClear(12, bottleneck(STAGES).weekly) ?? 0) - 12 / weeklyCapacity(harvest)) < 1e-9,
);

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
