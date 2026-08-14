import { COLORS, PART_LABELS, lengthIn } from '../model/parts';
import { textOn } from '../model/mapview';
import { insertLengthBp } from '../model/combinatorics';
import { useApp, useDispatch } from '../state/store';
import type { PartType, RegisteredChain } from '../model/types';

/**
 * What has actually been made. Assembling and registering mints identifiers all
 * the way up the loop, and this is where they are reviewed: each molecule with
 * the registered chains it is built from, and each registered chain with the
 * construct, insert, backbone and components behind it.
 */

const ORDER: PartType[] = [
  'promoter',
  'vh',
  'vl',
  'linker',
  'ch1',
  'cl',
  'hinge',
  'ch2',
  'ch3',
  'payload',
  'tag',
  'term',
];

function when(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function RegistryReview() {
  const state = useApp();
  const dispatch = useDispatch();
  if (!state.reviewOpen) return null;

  const close = () => dispatch({ type: 'open-review', open: false });
  const molecules = Object.values(state.registry.molecules).sort(
    (a, b) => b.createdAt - a.createdAt,
  );
  const registered = Object.values(state.registry.registered).sort(
    (a, b) => b.registeredAt - a.registeredAt,
  );

  /** One registered chain, with everything it was built from. */
  function RegCard({ reg }: { reg: RegisteredChain }) {
    const construct = state.registry.constructs[reg.constructId];
    const insert = construct ? state.registry.inserts[construct.insertId] : undefined;
    const vector = construct ? state.registry.vectors[construct.vectorId] : undefined;
    const blocks = insert?.blocks ?? {};
    const parts = ORDER.filter((type) => blocks[type]);
    const fromBackbone = ORDER.filter((type) => !blocks[type] && vector?.provides.includes(type));
    const insertBp = insert ? insertLengthBp(blocks, state.registry) : 0;
    const chain = reg.chainId ? state.chains[reg.chainId] : undefined;
    const inMolecule = molecules.filter((m) => m.regIds.includes(reg.id));

    return (
      <div className="rev-card">
        <div className="rev-head">
          <span className="mono rev-id">{reg.id}</span>
          <span className="rev-title">{reg.chainName}</span>
          <span className="badge">{when(reg.registeredAt)}</span>
          {chain && (
            <button
              className="btn"
              data-tip={`Focus ${chain.name} on the bench, which follows through to the design pad and the construct map`}
              onClick={() => {
                dispatch({ type: 'select', id: chain.id, mode: 'single' });
                close();
              }}
            >
              Show on bench
            </button>
          )}
        </div>

        <div className="rev-chips">
          {parts.map((type) => (
            <span
              key={type}
              className="rev-chip"
              style={{ background: COLORS[type], color: textOn(COLORS[type]) }}
              data-tip={`${PART_LABELS[type]}: ${
                state.registry.blocks[blocks[type] ?? '']?.name ?? 'unknown'
              }`}
            >
              {PART_LABELS[type]}
            </span>
          ))}
          {/* Constant regions the backbone contributes are part of the chain too. */}
          {fromBackbone.map((type) => (
            <span
              key={type}
              className="rev-chip supplied"
              style={{ color: COLORS[type], borderColor: COLORS[type] }}
              data-tip={`${PART_LABELS[type]} comes from the backbone rather than the insert`}
            >
              {PART_LABELS[type]}
            </span>
          ))}
        </div>

        <div className="kv">
          <span>Construct</span>
          <span className="mono">
            {reg.constructId}
            {insert ? ` · ${insert.id}` : ''}
            {vector ? ` · ${vector.id}` : ''}
          </span>
        </div>
        <div className="kv">
          <span>Backbone</span>
          <span>{vector ? `${vector.name}, ${vector.resistance}` : 'unknown'}</span>
        </div>
        <div className="kv">
          <span>Size</span>
          <span>
            {lengthIn(insertBp, state.alphabet)} insert ·{' '}
            {((vector?.lengthBp ?? 0) + insertBp).toLocaleString()} bp plasmid
          </span>
        </div>
        <div className="kv">
          <span>Inventory</span>
          <span>{reg.inventory.location}</span>
        </div>
        <div className="kv">
          <span>Stock</span>
          <span>
            {reg.inventory.plasmidUg ? `${reg.inventory.plasmidUg} µg plasmid` : 'no plasmid prepped'}
            {reg.inventory.glycerolStock ? ' · glycerol stock' : ''}
          </span>
        </div>
        <div className="kv">
          <span>Used in</span>
          <span className="mono">
            {inMolecule.length ? inMolecule.map((m) => m.id).join(', ') : 'no registered molecule'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2>Registered</h2>
          <span className="badge">
            {molecules.length} {molecules.length === 1 ? 'molecule' : 'molecules'}
          </span>
          <span className="badge">
            {registered.length} {registered.length === 1 ? 'chain' : 'chains'}
          </span>
          <span style={{ marginLeft: 'auto' }} />
          <button className="btn" data-tip="Close the review and return to the bench" onClick={close}>
            Close
          </button>
        </div>

        <div className="sheet-body wide">
          <p className="rev-section">Molecules</p>
          {molecules.length === 0 ? (
            <p className="rev-empty">
              Nothing registered as a molecule yet. Register every chain on the arms, then use
              Register molecule on the design pad to mint a MOL-id for what those chains build.
            </p>
          ) : (
            <div className="rev-grid">
              {molecules.map((m) => (
                <div className="rev-card" key={m.id}>
                  <div className="rev-head">
                    <span className="mono rev-id">{m.id}</span>
                    <span className="rev-title">{m.name}</span>
                    <span className="badge">{when(m.createdAt)}</span>
                  </div>
                  <div className="kv">
                    <span>Format</span>
                    <span>
                      {m.formatId
                        ? `${m.formatId} · ${state.registry.formats[m.formatId]?.name ?? ''}`
                        : 'unregistered format'}
                    </span>
                  </div>
                  <div className="kv">
                    <span>Fc</span>
                    <span>{m.fc}</span>
                  </div>
                  <div className="kv">
                    <span>Binds</span>
                    <span>{[...new Set(m.targets)].join(' × ') || 'no target'}</span>
                  </div>
                  <p className="rev-sub">Built from</p>
                  {m.regIds.map((id) => (
                    <div className="kv" key={id}>
                      <span className="mono">{id}</span>
                      <span>{state.registry.registered[id]?.chainName ?? 'unknown chain'}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <p className="rev-section">Registered chains</p>
          {registered.length === 0 ? (
            <p className="rev-empty">
              No chains in inventory yet. Assemble a chain against a backbone, then register it to
              mint a REG-id.
            </p>
          ) : (
            <div className="rev-grid">
              {registered.map((reg) => (
                <RegCard reg={reg} key={reg.id} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
