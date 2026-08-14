import { COLORS, PART_LABELS } from '../model/parts';
import { enumerateVariants, insertLengthBp, variantLabel } from '../model/combinatorics';
import { useApp, useDispatch } from '../state/store';

/**
 * "Generate all" — the combinatorial expansion of one chain's stacked slots as a
 * card gallery, separate from the bench.
 */
export function VariantGallery() {
  const state = useApp();
  const dispatch = useDispatch();
  const chain = state.galleryChainId ? state.chains[state.galleryChainId] : null;
  if (!chain) return null;

  const variants = enumerateVariants(chain);
  const close = () => dispatch({ type: 'open-gallery', chainId: null });

  return (
    <div className="overlay" onClick={close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2>{chain.name} — {variants.length} variants</h2>
          <span className="badge">{chain.vectorId ?? 'no backbone'}</span>
          <span style={{ marginLeft: 'auto' }} />
          <button
            className="btn primary"
            disabled={!chain.vectorId || chain.constructIds.length > 0}
            data-tip={`Assemble every one of these ${variants.length} variants against the backbone, minting a CC-id each`}
            onClick={() => dispatch({ type: 'assemble', chainId: chain.id })}
          >
            Assemble all
          </button>
          <button
            className="btn"
            disabled={!chain.constructIds.length || chain.regIds.length > 0}
            data-tip="Register every assembled variant into inventory, minting a REG-id each"
            onClick={() => dispatch({ type: 'register', chainId: chain.id })}
          >
            Register all
          </button>
          <button className="btn" data-tip="Close the gallery and return to the bench" onClick={close}>
            Close
          </button>
        </div>
        <div className="sheet-body">
          {variants.map((variant) => {
            const ccId = chain.constructIds[variant.index];
            const regId = chain.regIds[variant.index];
            return (
              <div className="variant-card" key={variant.key || variant.index}>
                <span className="vname">{variantLabel(variant, chain, state.registry)}</span>
                <div className="variant-chips">
                  {chain.slots.map((slot, i) => {
                    const blockId = variant.assignment[slot.type];
                    return (
                      <span
                        key={i}
                        className="variant-chip"
                        data-tip={`${PART_LABELS[slot.type]}: ${
                          blockId ? state.registry.blocks[blockId]?.name : 'empty'
                        }`}
                        style={{
                          background: blockId ? COLORS[slot.type] : 'transparent',
                          border: blockId ? 'none' : '1.5px dashed var(--border-strong)',
                        }}
                      />
                    );
                  })}
                </div>
                <div className="kv">
                  <span>Insert</span>
                  <span>{insertLengthBp(variant.assignment, state.registry).toLocaleString()} bp</span>
                </div>
                <div className="kv">
                  <span>Construct</span>
                  <span className="mono">{ccId ?? 'not assembled'}</span>
                </div>
                <div className="kv">
                  <span>Registered</span>
                  <span className="mono">{regId ?? '—'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
