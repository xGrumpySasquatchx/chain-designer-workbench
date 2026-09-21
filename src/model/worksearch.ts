import { chainTarget } from './bioglyph';
import { insertLengthBp } from './combinatorics';
import type {
  ChainDesign,
  ChainKind,
  Construct,
  Insert,
  InventoryRecord,
  PartType,
  PlateWell,
  Registry,
} from './types';

/**
 * Searching work against the registry.
 *
 * A plate of work is a list of chains, and every one of them is either
 * something that already exists or something that has to be cloned. Nothing is
 * shown until that question has been asked of the registry, so each row in the
 * work list is a search result rather than a design: what was searched for,
 * what came back, and — when something did come back — the construct it maps to
 * and what is left of it in the freezer.
 */

/** What the registry had to say about a chain. */
export type WorkStatus = 'registered' | 'assembled' | 'new';

/**
 * How the hit was found. An exact component match is the same chain; a shared
 * variable region is the same binder in a different build, which is still worth
 * knowing before cloning it again.
 */
export type MatchBasis = 'chain' | 'composition' | 'v-region' | 'none';

export interface WorkMatch {
  status: WorkStatus;
  basis: MatchBasis;
  /** Plain-language account of what was searched for. */
  query: string;
  regId?: string;
  constructId?: string;
  insertId?: string;
  vectorId?: string;
  registeredAt?: number;
  inventory?: InventoryRecord;
}

export interface WorkItem {
  chainId: string;
  name: string;
  kind: ChainKind;
  target?: string;
  plateId: string;
  /** Wells on that plate whose molecule uses this chain. */
  wells: string[];
  match: WorkMatch;
}

/** The first choice in every filled slot: what this chain is made of right now. */
export function chainComposition(chain: ChainDesign): Partial<Record<PartType, string>> {
  const blocks: Partial<Record<PartType, string>> = {};
  chain.slots.forEach((slot) => {
    const blockId = slot.blockIds[0];
    if (blockId) blocks[slot.type] = blockId;
  });
  return blocks;
}

/** Same key the registry uses to collapse identical inserts. */
export function compositionKey(blocks: Partial<Record<PartType, string>>): string {
  return Object.entries(blocks)
    .filter(([, v]) => v)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join('|');
}

function vRegionSlot(kind: ChainKind): PartType {
  return kind === 'heavy' ? 'vh' : 'vl';
}

function constructsFor(registry: Registry, insertId: string, vectorId?: string | null): Construct[] {
  return Object.values(registry.constructs).filter(
    (c) => c.insertId === insertId && (!vectorId || c.vectorId === vectorId),
  );
}

function registrationFor(registry: Registry, constructId: string) {
  return Object.values(registry.registered).find((r) => r.constructId === constructId);
}

function describe(
  chain: ChainDesign,
  registry: Registry,
  blocks: Partial<Record<PartType, string>>,
): string {
  const vBlockId = blocks[vRegionSlot(chain.kind)];
  const vBlock = vBlockId ? registry.blocks[vBlockId] : undefined;
  const filled = Object.keys(blocks).length;
  if (vBlock) {
    return `${vBlock.name}${filled > 1 ? ` plus ${filled - 1} more components` : ''}`;
  }
  return filled ? `${filled} components, no variable region` : 'nothing chosen yet';
}

/**
 * Ask the registry what it knows about a chain, by what it is made of rather
 * than by what it is called. A chain drawn on a plate this morning and a chain
 * registered last quarter are the same chain if their components are.
 */
export function searchRegistry(chain: ChainDesign, registry: Registry): WorkMatch {
  const blocks = chainComposition(chain);
  const query = describe(chain, registry, blocks);

  // Already carrying a REG-id: the search is settled before it starts.
  const own = chain.regIds.map((id) => registry.registered[id]).find(Boolean);
  if (own) {
    const construct = registry.constructs[own.constructId];
    return {
      status: 'registered',
      basis: 'chain',
      query,
      regId: own.id,
      constructId: own.constructId,
      insertId: construct?.insertId,
      vectorId: construct?.vectorId,
      registeredAt: own.registeredAt,
      inventory: own.inventory,
    };
  }

  const key = compositionKey(blocks);
  const vBlockId = blocks[vRegionSlot(chain.kind)];
  const tiers: Array<{ basis: MatchBasis; inserts: Insert[]; vectorId: string | null }> = [];
  if (key) {
    tiers.push({
      basis: 'composition',
      inserts: Object.values(registry.inserts).filter(
        (i) => i.kind === chain.kind && compositionKey(i.blocks) === key,
      ),
      vectorId: chain.vectorId,
    });
  }
  if (vBlockId) {
    // A hit on the binder alone counts whatever backbone it was built in.
    tiers.push({
      basis: 'v-region',
      inserts: Object.values(registry.inserts).filter(
        (i) => i.kind === chain.kind && i.blocks[vRegionSlot(chain.kind)] === vBlockId,
      ),
      vectorId: null,
    });
  }

  // Tiers are tried in order and the first one that returns anything wins: a
  // construct built from exactly these components describes the chain better
  // than a registration that only shares its binder.
  for (const tier of tiers) {
    let assembled: WorkMatch | undefined;
    for (const insert of tier.inserts) {
      for (const construct of constructsFor(registry, insert.id, tier.vectorId)) {
        const reg = registrationFor(registry, construct.id);
        if (reg) {
          return {
            status: 'registered',
            basis: tier.basis,
            query,
            regId: reg.id,
            constructId: construct.id,
            insertId: insert.id,
            vectorId: construct.vectorId,
            registeredAt: reg.registeredAt,
            inventory: reg.inventory,
          };
        }
        assembled ??= {
          status: 'assembled',
          basis: tier.basis,
          query,
          constructId: construct.id,
          insertId: insert.id,
          vectorId: construct.vectorId,
        };
      }
    }
    if (assembled) return assembled;
  }

  return { status: 'new', basis: 'none', query };
}

/**
 * The chains one plate of work is made of, each already searched. Wells are
 * collapsed onto the chain they share: a common light chain in every well is
 * one thing to clone, not ninety-six.
 */
export function plateWorkItems(
  plateId: string,
  wells: PlateWell[],
  chains: Record<string, ChainDesign>,
  registry: Registry,
): WorkItem[] {
  const order: string[] = [];
  const byChain = new Map<string, string[]>();
  wells.forEach((well) => {
    well.chainIds.forEach((id) => {
      if (!chains[id]) return;
      if (!byChain.has(id)) {
        byChain.set(id, []);
        order.push(id);
      }
      byChain.get(id)!.push(well.id);
    });
  });

  return order.map((chainId) => {
    const chain = chains[chainId];
    return {
      chainId,
      name: chain.name,
      kind: chain.kind,
      target: chainTarget(chain, registry),
      plateId,
      wells: byChain.get(chainId) ?? [],
      match: searchRegistry(chain, registry),
    };
  });
}

export interface WorkSummary {
  total: number;
  registered: number;
  assembled: number;
  fresh: number;
}

export function workSummary(items: WorkItem[]): WorkSummary {
  return {
    total: items.length,
    registered: items.filter((i) => i.match.status === 'registered').length,
    assembled: items.filter((i) => i.match.status === 'assembled').length,
    fresh: items.filter((i) => i.match.status === 'new').length,
  };
}

/** Size of the construct a hit maps to, for the row's detail line. */
export function matchLengthBp(match: WorkMatch, registry: Registry): number {
  const insert = match.insertId ? registry.inserts[match.insertId] : undefined;
  const vector = match.vectorId ? registry.vectors[match.vectorId] : undefined;
  const insertBp = insert ? insertLengthBp(insert.blocks, registry) : 0;
  return insertBp + (vector?.lengthBp ?? 0);
}
