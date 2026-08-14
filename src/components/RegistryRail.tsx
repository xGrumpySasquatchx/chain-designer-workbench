import { useMemo, useState } from 'react';
import { COLORS, PART_LABELS, chipShape, inAlphabet, lengthIn } from '../model/parts';
import { useApp, useDispatch } from '../state/store';
import type { Alphabet, BuildingBlock, ChainDesign, PartType, Registry } from '../model/types';

export const PART_DRAG_TYPE = 'application/x-msab-block';

type Tab = 'regions' | 'inserts' | 'vectors';

const TAB_LABELS: Record<Tab, string> = {
  regions: 'Regions',
  inserts: 'Inserts',
  vectors: 'Vectors',
};

/** Isotypes already committed by the chain's parts and backbone. */
function declaredIsotypes(chain: ChainDesign, registry: Registry): Set<string> {
  const out = new Set<string>();
  chain.slots.forEach((s) =>
    s.blockIds.forEach((id) => {
      const iso = registry.blocks[id]?.isotype;
      if (iso) out.add(iso);
    }),
  );
  const vector = chain.vectorId ? registry.vectors[chain.vectorId] : null;
  if (vector?.isotype) out.add(vector.isotype);
  return out;
}

const HEAVY_ISOTYPES = ['IgG1', 'IgG4'];

function isCompatible(block: BuildingBlock, chain: ChainDesign, registry: Registry): boolean {
  if (block.lineage !== 'generic' && block.lineage !== chain.kind) return false;
  if (!block.isotype) return true;
  const declared = declaredIsotypes(chain, registry);
  const family = HEAVY_ISOTYPES.includes(block.isotype) ? HEAVY_ISOTYPES : ['kappa', 'lambda'];
  const conflicting = [...declared].filter((i) => family.includes(i) && i !== block.isotype);
  return conflicting.length === 0;
}

function matches(query: string, ...fields: string[]): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((f) => f.toLowerCase().includes(q));
}

export function RegistryRail() {
  const state = useApp();
  const dispatch = useDispatch();
  const [tab, setTab] = useState<Tab>('regions');
  const [query, setQuery] = useState('');

  const chain = state.chains[state.focusChainId];
  const registry = state.registry;

  const blocksByType = useMemo(() => {
    const groups = new Map<PartType, BuildingBlock[]>();
    Object.values(registry.blocks)
      .filter((b) => inAlphabet(b.molecule, state.alphabet))
      .filter((b) => matches(query, b.name, ...b.features, PART_LABELS[b.type], b.target ?? ''))
      .forEach((b) => {
        const list = groups.get(b.type) ?? [];
        list.push(b);
        groups.set(b.type, list);
      });
    return groups;
  }, [registry.blocks, query, state.alphabet]);

  /** The slot the rest of the app has selected, so the rail can follow along. */
  const activeType = state.activeSlot
    ? state.chains[state.activeSlot.chainId]?.slots[state.activeSlot.slotIndex]?.type
    : undefined;

  /**
   * Clicking a chip places it without a drag: into the focused slot if the types
   * agree, otherwise into the first slot of that type on the focused chain.
   */
  function placeByClick(block: BuildingBlock, stack: boolean) {
    if (!chain) return;
    const active = state.activeSlot;
    const slotIndex =
      active && active.chainId === chain.id && chain.slots[active.slotIndex]?.type === block.type
        ? active.slotIndex
        : chain.slots.findIndex((s) => s.type === block.type);
    if (slotIndex < 0) return;
    dispatch({ type: 'place-block', chainId: chain.id, slotIndex, blockId: block.id, stack });
    dispatch({ type: 'set-active-slot', slot: { chainId: chain.id, slotIndex } });
  }

  const orderedTypes: PartType[] = [
    'promoter',
    'vh',
    'vl',
    'linker',
    'ch1',
    'hinge',
    'ch2',
    'ch3',
    'cl',
    'payload',
    'tag',
    'term',
  ];

  return (
    <div className="panel grow">
      <p className="panel-title">
        Parts registry
        <span className="count">{chain ? chain.name : 'no chain focused'}</span>
      </p>

      <div className="seg full" role="radiogroup" aria-label="Component vocabulary">
        {(['nt', 'aa'] as Alphabet[]).map((a) => (
          <button
            key={a}
            className={state.alphabet === a ? 'active' : ''}
            title={
              a === 'nt'
                ? 'Nucleotide components: regulatory elements and coding regions, in bp'
                : 'Amino-acid components: protein domains only, in residues'
            }
            onClick={() => dispatch({ type: 'set-alphabet', alphabet: a })}
          >
            {a === 'nt' ? 'Nucleotide' : 'Amino acid'}
          </button>
        ))}
      </div>

      <div className="tabs">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      <input
        className="search"
        placeholder="Search by name or feature…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="rail-list">
        {tab === 'regions' &&
          orderedTypes.map((type) => {
            const blocks = blocksByType.get(type);
            if (!blocks?.length) return null;
            const isActiveGroup = activeType === type;
            return (
              <div key={type}>
                <p className={`rail-group-label${isActiveGroup ? ' linked' : ''}`}>
                  {PART_LABELS[type]}
                  {isActiveGroup && <span className="link-tick">selected slot</span>}
                </p>
                {blocks.map((block) => {
                  const compatible = chain ? isCompatible(block, chain, registry) : true;
                  const inUse = chain?.slots.some((s) => s.blockIds.includes(block.id)) ?? false;
                  return (
                    <button
                      key={block.id}
                      className={[
                        'chip',
                        compatible ? '' : 'incompatible',
                        isActiveGroup ? 'linked' : '',
                        inUse ? 'in-use' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      draggable
                      title={
                        compatible
                          ? `${block.features.join(', ')} · ${lengthIn(block.lengthBp, state.alphabet)}`
                          : `Incompatible with ${chain?.name}: ${block.isotype ?? block.lineage}`
                      }
                      onDragStart={(e) => {
                        e.dataTransfer.setData(PART_DRAG_TYPE, block.id);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={(e) => placeByClick(block, e.shiftKey || e.altKey)}
                    >
                      <span
                        className="chip-glyph"
                        style={{
                          background: COLORS[block.type],
                          clipPath: chipShape(block.type) || undefined,
                        }}
                      />
                      <span className="chip-body">
                        <span className="chip-name">{block.name}</span>
                        <span className="chip-meta">
                          {block.target ? `${block.target} · ` : ''}
                          {block.isotype ? `${block.isotype} · ` : ''}
                          {lengthIn(block.lengthBp, state.alphabet)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}

        {tab === 'inserts' &&
          Object.values(registry.inserts)
            .filter((i) => matches(query, i.name, ...i.features))
            .map((insert) => {
              const usable = !chain || insert.kind === chain.kind;
              return (
                <button
                  key={insert.id}
                  className={`chip${usable ? '' : ' incompatible'}`}
                  title={`${insert.features.join(', ')} — click to apply every component`}
                  onClick={() =>
                    chain && usable && dispatch({ type: 'apply-insert', chainId: chain.id, insertId: insert.id })
                  }
                >
                  <span
                    className="chip-glyph"
                    style={{ background: insert.kind === 'heavy' ? COLORS.vh : COLORS.vl }}
                  />
                  <span className="chip-body">
                    <span className="chip-name">{insert.name}</span>
                    <span className="chip-meta">
                      {Object.keys(insert.blocks).length} components · {insert.kind}
                    </span>
                  </span>

                </button>
              );
            })}

        {tab === 'vectors' && (
          <>
            {Object.values(registry.vectors)
              .filter((v) => matches(query, v.name, v.resistance, v.isotype ?? ''))
              .map((vector) => (
                <button
                  key={vector.id}
                  className={`chip${chain?.vectorId === vector.id ? ' active' : ''}`}
                  title={`${vector.provides.length ? `supplies ${vector.provides.join(', ')}` : 'empty backbone'} · ${vector.resistance}`}
                  onClick={() =>
                    chain && dispatch({ type: 'set-vector', chainId: chain.id, vectorId: vector.id })
                  }
                >
                  <span
                    className="chip-glyph"
                    style={{
                      background: vector.isEmpty ? 'var(--surface-1)' : '#639922',
                      border: '1px solid var(--border-strong)',
                      borderRadius: '50%',
                    }}
                  />
                  <span className="chip-body">
                    <span className="chip-name">{vector.name}</span>
                    <span className="chip-meta">
                      {vector.provides.length
                        ? vector.provides.map((p) => PART_LABELS[p]).join(' + ')
                        : 'empty'}{' '}
                      · {vector.lengthBp.toLocaleString()} bp
                    </span>

                  </span>
                </button>
              ))}
            <button
              className="btn"
              style={{ marginTop: 8 }}
              onClick={() =>
                chain &&
                dispatch({
                  type: 'create-empty-vector',
                  chainId: chain.id,
                  name: `Empty backbone for ${chain.name}`,
                })
              }
            >
              + Mint empty backbone
            </button>
          </>
        )}
      </div>

      <p className="hint">
        {state.alphabet === 'nt'
          ? 'Nucleotide view: regulatory elements and coding regions, sized in base pairs.'
          : 'Amino-acid view: protein domains only, sized in residues. Promoters and terminators are nucleotide-only.'}{' '}
        Drag a part onto a row slot or onto the design pad; clicking drops it into the matching slot
        on the focused chain, and shift-click stacks a second option.
      </p>
    </div>
  );
}
