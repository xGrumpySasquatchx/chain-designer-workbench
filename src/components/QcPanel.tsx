import { useState } from 'react';
import { flowState } from '../model/flow';
import { variantCount } from '../model/combinatorics';
import { runFormatQc } from '../model/qc';
import { useApp, useDispatch } from '../state/store';

const BANNER: Record<string, string> = {
  pass: 'QC passed — ready to register',
  warn: 'QC passed with warnings',
  fail: 'QC failed — return to assemble or edit selections',
};

export function QcPanel() {
  const state = useApp();
  const dispatch = useDispatch();
  const [scope, setScope] = useState<'chain' | 'format'>('chain');
  const chain = state.chains[state.focusChainId];
  if (!chain) return null;

  const flow = flowState(chain, state.registry);
  const qc = scope === 'chain' ? flow.qc : runFormatQc(state.format, state.chains, state.registry);
  const variants = variantCount(chain);
  const registered = chain.regIds.map((id) => state.registry.registered[id]).filter(Boolean);

  return (
    <div className="panel">
      <p className="panel-title">
        QC &amp; registration
        <span className="count">{chain.constructIds.length ? 'construct assembled' : 'not assembled'}</span>
      </p>

      <div className="seg full">
        {(['chain', 'format'] as const).map((s) => (
          <button key={s} className={scope === s ? 'active' : ''} onClick={() => setScope(s)}>
            {s === 'chain' ? 'This chain' : 'Whole format'}
          </button>
        ))}
      </div>

      <div className={`status-banner ${qc.status}`} style={{ marginTop: 8 }}>
        {scope === 'chain'
          ? BANNER[qc.status]
          : qc.status === 'fail'
            ? 'Format QC failed — the Fc pairing does not match the format'
            : qc.status === 'warn'
              ? 'Format QC passed with warnings'
              : 'Format QC passed'}
      </div>

      {qc.checks.map((check) => (
        <div className="check" key={check.id}>
          <span className={`check-dot ${check.status}`} />
          <span>
            {check.label}
            <span className="check-detail">{check.detail}</span>
          </span>
        </div>
      ))}

      <div className="toolbar" style={{ marginTop: 10, marginBottom: 0 }}>
        <button
          className="btn primary"
          disabled={!chain.vectorId || chain.constructIds.length > 0}
          onClick={() => dispatch({ type: 'assemble', chainId: chain.id })}
        >
          {variants > 1 ? `Assemble ${variants} constructs` : 'Assemble insert + vector'}
        </button>
        <button
          className="btn"
          disabled={!chain.constructIds.length || flow.qc.status === 'fail' || chain.regIds.length > 0}
          onClick={() => dispatch({ type: 'register', chainId: chain.id })}
        >
          Register chain
        </button>
        <button
          className="btn"
          disabled={!chain.constructIds.length}
          title="Editing selections mints a new CC-id on the next assembly"
          onClick={() => dispatch({ type: 'edit-construct', chainId: chain.id })}
        >
          Edit selections
        </button>
      </div>

      {registered.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <p className="panel-title" style={{ marginBottom: 4 }}>
            Inventory
          </p>
          {registered.map((reg) => (
            <div key={reg.id}>
              <div className="kv">
                <span className="mono">{reg.id}</span>
                <span>{reg.chainName}</span>
              </div>
              <div className="kv">
                <span>Location</span>
                <span>{reg.inventory.location}</span>
              </div>
              <div className="kv">
                <span>Plasmid</span>
                <span>
                  {reg.inventory.plasmidUg
                    ? `${reg.inventory.plasmidUg} µg`
                    : 'none prepped yet'}
                  {reg.inventory.glycerolStock ? ' · glycerol stock' : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
