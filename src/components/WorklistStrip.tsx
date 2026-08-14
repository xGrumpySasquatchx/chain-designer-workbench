import { Panel } from './Panel';
import { flowState } from '../model/flow';
import { variantCount } from '../model/combinatorics';
import { flatOrder, useApp, useDispatch } from '../state/store';

export function WorklistStrip() {
  const state = useApp();
  const dispatch = useDispatch();
  const chainIds = flatOrder(state.bench).filter((id) => state.chains[id]);

  return (
    <Panel
      title="Worklist"
      tip="Every chain in this design session and how far each one has travelled through the cloning loop"
      trailing={`${chainIds.filter((id) => state.chains[id].regIds.length).length} of ${
        chainIds.length
      } registered`}
    >
      <div className="worklist">
        {chainIds.map((id) => {
          const chain = state.chains[id];
          const flow = flowState(chain, state.registry);
          const variants = variantCount(chain);
          return (
            <button
              key={id}
              className={`wl-card${state.focusChainId === id ? ' focused' : ''}`}
              data-tip={`Focus ${chain.name} — ${chain.kind} chain. Next step: ${flow.next.label}`}
              onClick={() => {
                dispatch({ type: 'focus-chain', chainId: id });
                dispatch({ type: 'select', id, mode: 'single' });
              }}
            >
              <span className="wl-name">{chain.name}</span>
              {chain.regIds.length > 0 ? (
                <span className="badge reg">{chain.regIds[0]}</span>
              ) : chain.constructIds.length > 0 ? (
                <span className="badge cc">{chain.constructIds[0]}</span>
              ) : (
                <span className="badge draft">draft</span>
              )}
              {variants > 1 && <span className="badge warn">×{variants}</span>}
              <span className="chip-meta">{flow.next.label}</span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
