/**
 * Headless walk through the cloning loop. Runs the reducer the UI runs, so the
 * ID-minting and QC behaviour can be checked without a browser.
 *
 *   npm run smoke
 */
import { bbDef, symmetry } from '../src/model/bioglyph';
import { componentsComplete, variantCount } from '../src/model/combinatorics';
import { flowState } from '../src/model/flow';
import { buildMap } from '../src/model/geneious';
import { inAlphabet, lengthIn } from '../src/model/parts';
import { runFormatQc, runQc } from '../src/model/qc';
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
  'seeded format is a 1+1 bispecific with a common light chain',
  pad.format.arms.left.lightChainId === pad.format.arms.right.lightChainId,
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

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
