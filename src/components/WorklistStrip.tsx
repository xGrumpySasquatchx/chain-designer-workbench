import { Panel } from './Panel';
import { flowState } from '../model/flow';
import { variantCount } from '../model/combinatorics';
import { componentColor, wellCaption } from '../model/plate';
import { textOn } from '../model/mapview';
import { useApp, useDispatch } from '../state/store';
import type { PlateWell } from '../model/types';

export function WorklistStrip() {
  const state = useApp();
  const dispatch = useDispatch();
  const wells = state.selectedWells
    .map((id) => state.plate.find((w) => w.id === id))
    .filter((w): w is PlateWell => !!w);
  const primary = state.lastSelectedWellId;
  const registered = wells.filter((w) => w.format.moleculeId).length;

  return (
    <Panel
      title="Worklist"
      tip="One row per selected well. Each row is the Luma molecule and the chain elements that make it up."
      trailing={`${registered} of ${wells.length} registered`}
      defaultHeight={168}
    >
      <div className="worklist">
        {wells.map((well) => {
          const caption = wellCaption(well, state.chains, state.registry);
          const isPrimary = well.id === primary;
          return (
            <div
              key={well.id}
              className={`wl-row${isPrimary ? ' primary' : ''}`}
              data-tip={`${well.id} · ${well.lumaUid} — ${caption}. Click to focus this well.`}
              onClick={() => dispatch({ type: 'select-wells', wellId: well.id, mode: 'single' })}
            >
              <span className="wl-well">{well.id}</span>
              <span className="wl-uid">{well.lumaUid}</span>
              <span className="wl-elements" onClick={(e) => e.stopPropagation()}>
                {well.chainIds.map((id) => {
                  const chain = state.chains[id];
                  if (!chain) return null;
                  const flow = flowState(chain, state.registry);
                  const variants = variantCount(chain);
                  const color = componentColor(
                    id,
                    state.chains,
                    state.registry,
                    state.wellComponentColors,
                  );
                  const focused = state.focusChainId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`wl-element${focused ? ' focused' : ''}`}
                      style={{ background: color, color: textOn(color) }}
                      data-tip={`Focus ${chain.name} — ${chain.kind} chain. Next: ${flow.next.label}`}
                      onClick={() => {
                        dispatch({ type: 'focus-chain', chainId: id });
                        dispatch({ type: 'select', id, mode: 'single' });
                      }}
                    >
                      <span className="wl-element-name">{chain.name}</span>
                      {chain.regIds.length > 0 ? (
                        <span className="wl-element-id">{chain.regIds[0]}</span>
                      ) : chain.constructIds.length > 0 ? (
                        <span className="wl-element-id">{chain.constructIds[0]}</span>
                      ) : (
                        <span className="wl-element-id">draft</span>
                      )}
                      {variants > 1 && <span className="wl-element-id">×{variants}</span>}
                    </button>
                  );
                })}
              </span>
              <span className="wl-caption">{caption}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
