import { createContext, useContext, type Dispatch } from 'react';
import {
  INITIAL_COUNTERS,
  initialChains,
  initialFormat,
  initialRegistry,
  makeChain,
  mintId,
  relayoutSlots,
  type Counters,
} from '../model/registry';
import { armSlots, bbDef, formatName, formatSignature, symmetry } from '../model/bioglyph';
import { enumerateVariants, variantLabel } from '../model/combinatorics';
import { runQc } from '../model/qc';
import type {
  Alphabet,
  ArmId,
  BbKind,
  BenchGroup,
  BenchNode,
  ChainDesign,
  ChainKind,
  FormatDesign,
  Insert,
  PartType,
  Registry,
  Resolution,
} from '../model/types';

export interface LogEntry {
  id: number;
  kind: 'mint' | 'edit' | 'qc';
  text: string;
}

export interface AppState {
  registry: Registry;
  counters: Counters;
  chains: Record<string, ChainDesign>;
  bench: BenchNode[];
  /** Node ids: chain ids and group ids select the same way. */
  selection: string[];
  lastSelectedId: string | null;
  focusChainId: string;
  /**
   * The component selected across every panel: bench slot, design pad glyph and
   * construct map annotation all highlight from this one value.
   */
  activeSlot: { chainId: string; slotIndex: number } | null;
  resolution: Resolution;
  /** Which component vocabulary the registry rail is browsing. */
  alphabet: Alphabet;
  /** The molecule under design on the pad. */
  format: FormatDesign;
  /** Geneious-style view mode; multiple selected constructs force linear. */
  constructView: 'circular' | 'linear';
  /** Pad glyphs colored by target (BioGlyph) or by part category (spec 8a). */
  padColor: 'target' | 'part';
  /** Chain whose variant gallery is open, if any. */
  galleryChainId: string | null;
  /** True while the construct map is expanded into a full-width sheet. */
  mapExpanded: boolean;
  log: LogEntry[];
  flashChainId: string | null;
}

export type Action =
  | { type: 'place-block'; chainId: string; slotIndex: number; blockId: string; stack?: boolean }
  | { type: 'clear-slot'; chainId: string; slotIndex: number }
  | { type: 'unstack-block'; chainId: string; slotIndex: number; blockId: string }
  | { type: 'apply-insert'; chainId: string; insertId: string }
  | { type: 'set-vector'; chainId: string; vectorId: string }
  | { type: 'create-empty-vector'; chainId: string; name: string }
  | { type: 'assemble'; chainId: string }
  | { type: 'edit-construct'; chainId: string }
  | { type: 'register'; chainId: string }
  | { type: 'add-chain'; kind: ChainKind }
  | { type: 'select'; id: string; mode: 'single' | 'toggle' | 'range' }
  | { type: 'clear-selection' }
  | { type: 'group-selected' }
  | { type: 'ungroup'; groupId: string }
  | { type: 'ungroup-selected' }
  | { type: 'eject'; chainId: string }
  | { type: 'rename-group'; groupId: string; name: string }
  | { type: 'toggle-group-collapsed'; groupId: string }
  | { type: 'reorder'; dragId: string; beforeId: string | null; container: string | null }
  | { type: 'annotate'; ids: string[]; note: string }
  | { type: 'set-resolution'; level: Resolution }
  | { type: 'cycle-row-resolution'; chainId: string }
  | { type: 'focus-chain'; chainId: string }
  | { type: 'set-active-slot'; slot: AppState['activeSlot'] }
  /** Linked selection: focus a component without disturbing row multi-selection. */
  | { type: 'select-component'; chainId: string; slotIndex: number }
  | { type: 'set-alphabet'; alphabet: Alphabet }
  | { type: 'set-construct-view'; view: 'circular' | 'linear' }
  | { type: 'set-pad-color'; mode: 'target' | 'part' }
  | { type: 'set-arm-bb'; arm: ArmId; bb: BbKind }
  | { type: 'fuse-bb'; arm: ArmId; bb: BbKind }
  | { type: 'register-format' }
  | { type: 'expand-map'; expanded: boolean }
  | { type: 'open-gallery'; chainId: string | null }
  | { type: 'flash-chain'; chainId: string | null };

export function createInitialState(): AppState {
  const chains = initialChains();
  return {
    registry: initialRegistry(),
    counters: INITIAL_COUNTERS,
    chains: Object.fromEntries(chains.map((c) => [c.id, c])),
    bench: chains.map((c) => ({ kind: 'chain', id: c.id }) as BenchNode),
    selection: [],
    lastSelectedId: null,
    focusChainId: chains[1].id,
    activeSlot: null,
    resolution: 1,
    alphabet: 'nt',
    format: initialFormat(),
    constructView: 'circular',
    padColor: 'target',
    galleryChainId: null,
    mapExpanded: false,
    log: [],
    flashChainId: null,
  };
}

let logSeq = 0;
function log(state: AppState, kind: LogEntry['kind'], text: string): LogEntry[] {
  return [{ id: ++logSeq, kind, text }, ...state.log].slice(0, 40);
}

/** Visible top-to-bottom order, used for shift-range selection. */
export function flatOrder(bench: BenchNode[]): string[] {
  const out: string[] = [];
  for (const node of bench) {
    out.push(node.id);
    if (node.kind === 'group' && !node.collapsed) out.push(...node.children);
  }
  return out;
}

function withChain(
  state: AppState,
  chainId: string,
  fn: (chain: ChainDesign) => ChainDesign,
): AppState {
  const chain = state.chains[chainId];
  if (!chain) return state;
  return { ...state, chains: { ...state.chains, [chainId]: fn(chain) } };
}

function removeFromBench(bench: BenchNode[], id: string): BenchNode[] {
  return bench
    .filter((n) => n.id !== id)
    .map((n) =>
      n.kind === 'group' ? { ...n, children: n.children.filter((c) => c !== id) } : n,
    );
}

function insertIntoBench(
  bench: BenchNode[],
  node: BenchNode,
  beforeId: string | null,
  container: string | null,
): BenchNode[] {
  if (container) {
    return bench.map((n) => {
      if (n.kind !== 'group' || n.id !== container) return n;
      const children = [...n.children];
      const at = beforeId ? children.indexOf(beforeId) : children.length;
      children.splice(at < 0 ? children.length : at, 0, node.id);
      return { ...n, children };
    });
  }
  const next = [...bench];
  const at = beforeId ? next.findIndex((n) => n.id === beforeId) : next.length;
  next.splice(at < 0 ? next.length : at, 0, node);
  return next;
}

function groupOf(bench: BenchNode[], chainId: string): BenchGroup | null {
  for (const n of bench) {
    if (n.kind === 'group' && n.children.includes(chainId)) return n;
  }
  return null;
}

/** Reuse an identical insert if one already exists, otherwise mint a new INS-id. */
function resolveInsert(
  registry: Registry,
  counters: Counters,
  kind: ChainKind,
  blocks: Partial<Record<PartType, string>>,
  name: string,
): { registry: Registry; counters: Counters; insert: Insert; minted: boolean } {
  const signature = (b: Partial<Record<PartType, string>>) =>
    Object.entries(b)
      .filter(([, v]) => v)
      .sort(([a], [c]) => a.localeCompare(c))
      .map(([k, v]) => `${k}:${v}`)
      .join('|');
  const target = signature(blocks);
  const existing = Object.values(registry.inserts).find(
    (i) => i.kind === kind && signature(i.blocks) === target,
  );
  if (existing) return { registry, counters, insert: existing, minted: false };

  const [id, nextCounters] = mintId(counters, 'INS');
  const insert: Insert = { id, name, kind, blocks, features: ['session'] };
  return {
    registry: { ...registry, inserts: { ...registry.inserts, [id]: insert } },
    counters: nextCounters,
    insert,
    minted: true,
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'place-block': {
      const chain = state.chains[action.chainId];
      if (!chain) return state;
      const slots = chain.slots.map((s, i) => {
        if (i !== action.slotIndex) return s;
        if (action.stack) {
          return s.blockIds.includes(action.blockId)
            ? s
            : { ...s, blockIds: [...s.blockIds, action.blockId] };
        }
        return { ...s, blockIds: [action.blockId] };
      });
      const block = state.registry.blocks[action.blockId];
      return {
        ...withChain(state, action.chainId, (c) => ({ ...c, slots })),
        log: log(
          state,
          'edit',
          `${block?.name ?? action.blockId} → ${chain.name}${action.stack ? ' (stacked)' : ''}`,
        ),
      };
    }

    case 'clear-slot':
      return withChain(state, action.chainId, (c) => ({
        ...c,
        slots: c.slots.map((s, i) => (i === action.slotIndex ? { ...s, blockIds: [] } : s)),
      }));

    case 'unstack-block':
      return withChain(state, action.chainId, (c) => ({
        ...c,
        slots: c.slots.map((s, i) =>
          i === action.slotIndex
            ? { ...s, blockIds: s.blockIds.filter((b) => b !== action.blockId) }
            : s,
        ),
      }));

    case 'apply-insert': {
      const insert = state.registry.inserts[action.insertId];
      const chain = state.chains[action.chainId];
      if (!insert || !chain || insert.kind !== chain.kind) return state;
      return {
        ...withChain(state, action.chainId, (c) => ({
          ...c,
          slots: c.slots.map((s) =>
            insert.blocks[s.type] ? { ...s, blockIds: [insert.blocks[s.type]!] } : s,
          ),
        })),
        log: log(state, 'edit', `${insert.id} applied to ${chain.name}`),
      };
    }

    case 'set-vector':
      return {
        ...withChain(state, action.chainId, (c) => ({ ...c, vectorId: action.vectorId })),
        log: log(
          state,
          'edit',
          `${action.vectorId} assigned to ${state.chains[action.chainId]?.name ?? ''}`,
        ),
      };

    case 'create-empty-vector': {
      const [id, counters] = mintId(state.counters, 'VEC');
      const registry: Registry = {
        ...state.registry,
        vectors: {
          ...state.registry.vectors,
          [id]: {
            id,
            name: action.name,
            isEmpty: true,
            provides: [],
            resistance: 'AmpR',
            lengthBp: 4400,
            backboneFeatures: [
              { name: 'MCS', kind: 'mcs', lengthBp: 96, strand: 1 },
              { name: 'AmpR', kind: 'marker', lengthBp: 861, strand: -1 },
              { name: 'ori', kind: 'ori', lengthBp: 589, strand: 1 },
            ],
          },
        },
      };
      return {
        ...withChain({ ...state, registry, counters }, action.chainId, (c) => ({
          ...c,
          vectorId: id,
        })),
        log: log(state, 'mint', `${id} minted — new empty backbone`),
      };
    }

    case 'assemble': {
      const chain = state.chains[action.chainId];
      if (!chain || !chain.vectorId) return state;
      let registry = state.registry;
      let counters = state.counters;
      const constructIds: string[] = [];
      const minted: string[] = [];

      for (const variant of enumerateVariants(chain)) {
        const label = variantLabel(variant, chain, registry);
        const res = resolveInsert(
          registry,
          counters,
          chain.kind,
          variant.assignment,
          `${chain.name} insert — ${label}`,
        );
        registry = res.registry;
        counters = res.counters;
        if (res.minted) minted.push(res.insert.id);

        const existing = Object.values(registry.constructs).find(
          (c) => c.insertId === res.insert.id && c.vectorId === chain.vectorId,
        );
        if (existing) {
          constructIds.push(existing.id);
          continue;
        }
        const [ccId, nextCounters] = mintId(counters, 'CC');
        counters = nextCounters;
        registry = {
          ...registry,
          constructs: {
            ...registry.constructs,
            [ccId]: {
              id: ccId,
              insertId: res.insert.id,
              vectorId: chain.vectorId,
              chainName: label,
              createdAt: Date.now(),
            },
          },
        };
        constructIds.push(ccId);
        minted.push(ccId);
      }

      return {
        ...withChain({ ...state, registry, counters }, action.chainId, (c) => ({
          ...c,
          constructIds,
        })),
        log: log(
          state,
          'mint',
          minted.length
            ? `${minted.join(', ')} minted for ${chain.name}`
            : `Existing construct reused for ${chain.name}`,
        ),
      };
    }

    case 'edit-construct':
      return {
        ...withChain(state, action.chainId, (c) => ({ ...c, constructIds: [], regIds: [] })),
        log: log(
          state,
          'edit',
          `${state.chains[action.chainId]?.name ?? ''} reopened for editing — next assembly mints a new CC-id`,
        ),
      };

    case 'register': {
      const chain = state.chains[action.chainId];
      if (!chain || !chain.constructIds.length) return state;
      const qc = runQc(chain, state.registry);
      if (qc.status === 'fail') {
        return { ...state, log: log(state, 'qc', `QC failed for ${chain.name} — not registered`) };
      }
      let registry = state.registry;
      let counters = state.counters;
      const regIds: string[] = [];
      chain.constructIds.forEach((ccId, i) => {
        const [regId, nextCounters] = mintId(counters, 'REG');
        counters = nextCounters;
        registry = {
          ...registry,
          registered: {
            ...registry.registered,
            [regId]: {
              id: regId,
              constructId: ccId,
              chainName: registry.constructs[ccId]?.chainName ?? chain.name,
              inventory: {
                location: `Freezer B / rack 4 / box ${12 + i}`,
                plasmidUg: 0,
                glycerolStock: false,
              },
            },
          },
        };
        regIds.push(regId);
      });
      return {
        ...withChain({ ...state, registry, counters }, action.chainId, (c) => ({ ...c, regIds })),
        log: log(state, 'mint', `${regIds.join(', ')} registered for ${chain.name}`),
      };
    }

    case 'add-chain': {
      const [id, counters] = mintId(state.counters, 'CH');
      const count = Object.values(state.chains).filter((c) => c.kind === action.kind).length + 1;
      const chain = makeChain(id, `New ${action.kind} chain ${count}`, action.kind);
      return {
        ...state,
        counters,
        chains: { ...state.chains, [id]: chain },
        bench: [...state.bench, { kind: 'chain', id }],
        focusChainId: id,
      };
    }

    case 'select': {
      if (action.mode === 'toggle') {
        const selection = state.selection.includes(action.id)
          ? state.selection.filter((s) => s !== action.id)
          : [...state.selection, action.id];
        return { ...state, selection, lastSelectedId: action.id };
      }
      if (action.mode === 'range' && state.lastSelectedId) {
        const order = flatOrder(state.bench);
        const a = order.indexOf(state.lastSelectedId);
        const b = order.indexOf(action.id);
        if (a >= 0 && b >= 0) {
          const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
          return {
            ...state,
            selection: [...new Set([...state.selection, ...range])],
            lastSelectedId: action.id,
          };
        }
      }
      return {
        ...state,
        selection: [action.id],
        lastSelectedId: action.id,
        focusChainId: state.chains[action.id] ? action.id : state.focusChainId,
      };
    }

    case 'clear-selection':
      return { ...state, selection: [], lastSelectedId: null };

    case 'group-selected': {
      const chosen = flatOrder(state.bench).filter((id) => state.selection.includes(id));
      const chainIds = chosen.filter((id) => state.chains[id]);
      if (chainIds.length < 2) return state;
      const [groupId, counters] = mintId(state.counters, 'GRP');
      const firstIndex = state.bench.findIndex(
        (n) => n.kind === 'chain' && chainIds.includes(n.id),
      );
      let bench = state.bench;
      chainIds.forEach((id) => (bench = removeFromBench(bench, id)));
      const group: BenchGroup = {
        kind: 'group',
        id: groupId,
        name: `Group ${groupId.split('-')[1]}`,
        collapsed: false,
        children: chainIds,
      };
      const at = firstIndex < 0 ? bench.length : Math.min(firstIndex, bench.length);
      bench = [...bench.slice(0, at), group, ...bench.slice(at)];
      return { ...state, bench, counters, selection: [] };
    }

    case 'ungroup': {
      const group = state.bench.find(
        (n): n is BenchGroup => n.kind === 'group' && n.id === action.groupId,
      );
      if (!group) return state;
      const at = state.bench.findIndex((n) => n.id === group.id);
      const restored: BenchNode[] = group.children.map((id) => ({ kind: 'chain', id }));
      return {
        ...state,
        bench: [...state.bench.slice(0, at), ...restored, ...state.bench.slice(at + 1)],
        selection: state.selection.filter((id) => id !== group.id),
      };
    }

    case 'ungroup-selected': {
      const groups = state.bench.filter(
        (n): n is BenchGroup => n.kind === 'group' && state.selection.includes(n.id),
      );
      return groups.reduce<AppState>(
        (acc, g) => reducer(acc, { type: 'ungroup', groupId: g.id }),
        { ...state, selection: [] },
      );
    }

    case 'eject': {
      const group = groupOf(state.bench, action.chainId);
      if (!group) return state;
      const at = state.bench.findIndex((n) => n.id === group.id);
      const remaining = group.children.filter((c) => c !== action.chainId);
      const chainNode: BenchNode = { kind: 'chain', id: action.chainId };
      // Ejected chains land immediately above the group they came from
      // (open question 9.2 — not restored to their pre-group position).
      const replacement: BenchNode[] =
        remaining.length === 0 ? [chainNode] : [chainNode, { ...group, children: remaining }];
      return {
        ...state,
        bench: [...state.bench.slice(0, at), ...replacement, ...state.bench.slice(at + 1)],
      };
    }

    case 'rename-group':
      return {
        ...state,
        bench: state.bench.map((n) =>
          n.kind === 'group' && n.id === action.groupId ? { ...n, name: action.name } : n,
        ),
      };

    case 'toggle-group-collapsed':
      return {
        ...state,
        bench: state.bench.map((n) =>
          n.kind === 'group' && n.id === action.groupId ? { ...n, collapsed: !n.collapsed } : n,
        ),
      };

    case 'reorder': {
      if (action.dragId === action.beforeId) return state;
      const node =
        state.bench.find((n) => n.id === action.dragId) ??
        (state.chains[action.dragId] ? ({ kind: 'chain', id: action.dragId } as BenchNode) : null);
      if (!node) return state;
      const stripped = removeFromBench(state.bench, action.dragId);
      return { ...state, bench: insertIntoBench(stripped, node, action.beforeId, action.container) };
    }

    case 'annotate': {
      const chains = { ...state.chains };
      action.ids.forEach((id) => {
        if (chains[id]) chains[id] = { ...chains[id], note: action.note };
      });
      return { ...state, chains };
    }

    case 'set-resolution':
      return { ...state, resolution: action.level };

    case 'cycle-row-resolution':
      return withChain(state, action.chainId, (c) => {
        const current = c.resolutionOverride ?? state.resolution;
        const next = ((current % 3) + 1) as Resolution;
        return { ...c, resolutionOverride: next === state.resolution ? undefined : next };
      });

    case 'focus-chain':
      return { ...state, focusChainId: action.chainId };

    case 'set-active-slot':
      return { ...state, activeSlot: action.slot };

    case 'select-component':
      return {
        ...state,
        activeSlot: { chainId: action.chainId, slotIndex: action.slotIndex },
        focusChainId: action.chainId,
      };

    case 'set-alphabet':
      return { ...state, alphabet: action.alphabet };

    case 'set-construct-view':
      return { ...state, constructView: action.view };

    case 'set-pad-color':
      return { ...state, padColor: action.mode };

    case 'set-arm-bb': {
      const arm = state.format.arms[action.arm];
      const def = bbDef(action.bb);
      const chains = { ...state.chains };

      // Binding a light chain: reuse one already on the bench rather than
      // silently creating a second copy of a shared light chain.
      let lightChainId = arm.lightChainId;
      if (def.needsLightChain && !lightChainId) {
        lightChainId =
          Object.values(state.chains).find((c) => c.kind === 'light')?.id ?? null;
      }

      // A new block on the arm replaces what was there, fusions included.
      const nextArm = { ...arm, bb: action.bb, lightChainId, fused: [] };
      const layout = armSlots(nextArm);

      if (arm.heavyChainId && chains[arm.heavyChainId]) {
        chains[arm.heavyChainId] = {
          ...chains[arm.heavyChainId],
          slots: relayoutSlots(chains[arm.heavyChainId].slots, layout.heavy),
          // The construct no longer describes this design once the layout changes.
          constructIds: [],
          regIds: [],
        };
      }
      if (layout.light && lightChainId && chains[lightChainId] && !chains[lightChainId].regIds.length) {
        chains[lightChainId] = {
          ...chains[lightChainId],
          slots: relayoutSlots(chains[lightChainId].slots, layout.light),
        };
      }

      const format: FormatDesign = {
        arms: { ...state.format.arms, [action.arm]: nextArm },
        // Changing the shape changes the format, so its identity is re-derived.
        formatId: null,
      };
      return {
        ...state,
        chains,
        format,
        log: log(state, 'edit', `${def.label} placed on the ${action.arm} arm`),
      };
    }

    case 'fuse-bb': {
      const arm = state.format.arms[action.arm];
      if (arm.fused.includes(action.bb)) return state;
      const nextArm = { ...arm, fused: [...arm.fused, action.bb] };
      const layout = armSlots(nextArm);
      const chains = { ...state.chains };
      if (arm.heavyChainId && chains[arm.heavyChainId]) {
        chains[arm.heavyChainId] = {
          ...chains[arm.heavyChainId],
          slots: relayoutSlots(chains[arm.heavyChainId].slots, layout.heavy),
        };
      }
      return {
        ...state,
        chains,
        format: { arms: { ...state.format.arms, [action.arm]: nextArm }, formatId: null },
        log: log(
          state,
          'edit',
          `${bbDef(action.bb).label} fused onto the ${action.arm} arm`,
        ),
      };
    }

    case 'register-format': {
      const signature = formatSignature(state.format, state.chains, state.registry);
      const existing = Object.values(state.registry.formats).find((f) => f.signature === signature);
      const verdict = symmetry(state.format, state.chains, state.registry);
      if (existing) {
        return {
          ...state,
          format: { ...state.format, formatId: existing.id },
          log: log(state, 'mint', `${existing.id} reused — this format already exists`),
        };
      }
      const [id, counters] = mintId(state.counters, 'FMT');
      return {
        ...state,
        counters,
        registry: {
          ...state.registry,
          formats: {
            ...state.registry.formats,
            [id]: {
              id,
              name: formatName(state.format, state.chains, state.registry),
              signature,
              fc: verdict.fc,
              symmetric: verdict.symmetric,
            },
          },
        },
        format: { ...state.format, formatId: id },
        log: log(state, 'mint', `${id} registered — new format`),
      };
    }

    case 'expand-map':
      return { ...state, mapExpanded: action.expanded };

    case 'open-gallery':
      return { ...state, galleryChainId: action.chainId };

    case 'flash-chain':
      return { ...state, flashChainId: action.chainId };

    default:
      return state;
  }
}

export const StateContext = createContext<AppState | null>(null);
export const DispatchContext = createContext<Dispatch<Action> | null>(null);

export function useApp(): AppState {
  const state = useContext(StateContext);
  if (!state) throw new Error('useApp must be used inside AppProvider');
  return state;
}

export function useDispatch(): Dispatch<Action> {
  const dispatch = useContext(DispatchContext);
  if (!dispatch) throw new Error('useDispatch must be used inside AppProvider');
  return dispatch;
}

export function effectiveResolution(state: AppState, chainId: string): Resolution {
  return state.chains[chainId]?.resolutionOverride ?? state.resolution;
}
