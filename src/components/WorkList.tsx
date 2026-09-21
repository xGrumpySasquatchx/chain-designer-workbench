import { useState } from 'react';
import { Panel } from './Panel';
import { PaletteSelect } from './PaletteSelect';
import { chainTarget } from '../model/bioglyph';
import { flowState } from '../model/flow';
import { componentColor, uniqueChainIds } from '../model/plate';
import { COLORS, PART_LABELS, lengthIn } from '../model/parts';
import { chainSegments, fasta, sequenceOf, sequenceRows, type Segment } from '../model/sequence';
import { searchRegistry } from '../model/worksearch';
import { useApp, useDispatch } from '../state/store';
import type { Alphabet, ChainDesign } from '../model/types';

const PER_ROW = 60;

/**
 * The entities picked in the work list above, read out one by one with the
 * sequence underneath each of them. Picking several is the point: a bispecific
 * is three chains, and they are compared by reading them together.
 */
export function WorkList() {
  const state = useApp();
  const dispatch = useDispatch();
  const chains = state.workSelection
    .map((id) => state.chains[id])
    .filter((c): c is ChainDesign => !!c);
  // Registered the way the list above counts it: what the registry has, not
  // only what this bench chain already carries.
  const registered = chains.filter(
    (c) => searchRegistry(c, state.registry).status === 'registered',
  ).length;

  return (
    <Panel
      title="Work List"
      tip="The entities picked in the work list above, each read out to its sequence. Sequences are generated per building block rather than fetched, so they are stable and plausible, not real."
      trailing={
        <span className="wl-trailing">
          <span
            data-tip={`${chains.length} ${chains.length === 1 ? 'entity' : 'entities'} picked · ${registered} registered. Cmd-click or shift-click rows above to gather more.`}
          >
            {`${registered} of ${chains.length} registered`}
          </span>
          <PaletteSelect
            align="end"
            value={state.wellPaletteId}
            onChange={(paletteId) => dispatch({ type: 'set-well-palette', paletteId })}
          />
        </span>
      }
      defaultHeight={300}
    >
      <div className="worklist">
        {chains.length === 0 && (
          <p className="hint">
            Nothing picked. Click an entity in the list above, or cmd-click several.
          </p>
        )}
        {chains.map((chain) => (
          <EntityCard key={chain.id} chain={chain} />
        ))}
      </div>
    </Panel>
  );
}

function EntityCard({ chain }: { chain: ChainDesign }) {
  const state = useApp();
  const dispatch = useDispatch();
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const alphabet: Alphabet = state.alphabet;
  const segments = chainSegments(chain, state.registry, alphabet);
  const sequence = sequenceOf(segments);
  const rows = sequenceRows(segments, PER_ROW);
  const match = searchRegistry(chain, state.registry);
  const flow = flowState(chain, state.registry);
  const target = chainTarget(chain, state.registry);
  const focused = state.focusChainId === chain.id;
  const color = componentColor(
    chain.id,
    state.chains,
    state.registry,
    state.wellComponentColors,
    state.wellPaletteId,
    uniqueChainIds(state.plate),
  );
  const wells = state.plate.filter((w) => w.chainIds.includes(chain.id)).map((w) => w.id);

  function copy() {
    const name = `${chain.id} ${chain.name}${match.regId ? ` ${match.regId}` : ''}${
      alphabet === 'aa' ? ' | protein' : ''
    }`;
    void navigator.clipboard?.writeText(fasta(name, sequence)).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <div className={`ent${focused ? ' focused' : ''}`}>
      <div className="ent-head">
        <span className="ent-dot" style={{ background: color }} aria-hidden />
        <button
          type="button"
          className="ent-name"
          data-tip={`Focus ${chain.name} on the bench, the pad and the map. Next step: ${flow.next.label}.`}
          onClick={() => {
            dispatch({ type: 'focus-chain', chainId: chain.id });
            dispatch({ type: 'select', id: chain.id, mode: 'single' });
          }}
        >
          {chain.name}
        </button>
        <span className="ent-meta">
          {chain.id} · {chain.kind}
          {target ? ` · binds ${target}` : ''}
          {wells.length ? ` · ${wells.length} ${wells.length === 1 ? 'well' : 'wells'}` : ''}
        </span>
        <span
          className={`ent-badge ${match.status}`}
          data-tip={
            match.status === 'registered'
              ? `${match.regId} in inventory, from ${match.constructId}`
              : match.status === 'assembled'
                ? `${match.constructId} assembled, not yet registered`
                : `Nothing registered yet. Next step: ${flow.next.label}.`
          }
        >
          {match.regId ?? match.constructId ?? 'draft'}
        </span>
        <span className="ent-size">
          {sequence.length
            ? alphabet === 'aa'
              ? `${sequence.length.toLocaleString()} aa`
              : lengthIn(sequence.length, 'nt')
            : 'no sequence'}
        </span>
        <button
          type="button"
          className="ent-tool"
          disabled={!sequence.length}
          data-tip={`Copy this ${alphabet === 'aa' ? 'protein' : 'DNA'} sequence as FASTA`}
          onClick={copy}
        >
          {copied ? 'copied' : 'FASTA'}
        </button>
        <button
          type="button"
          className="ent-tool"
          data-tip={open ? 'Hide the sequence' : 'Show the sequence'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '▾' : '▸'}
        </button>
      </div>

      {open &&
        (segments.length === 0 ? (
          <p className="ent-empty">
            {alphabet === 'aa' && chain.slots.some((s) => s.blockIds.length)
              ? 'Only regulatory elements are chosen, and those have no protein to read. Switch to nucleotide view.'
              : 'No components chosen yet, so there is nothing to sequence.'}
          </p>
        ) : (
          <>
            <div className="ent-segs">
              {segments.map((segment) => (
                <SegmentChip key={`${segment.blockId}-${segment.start}`} segment={segment} alphabet={alphabet} />
              ))}
            </div>
            <div className="seq" role="img" aria-label={`${chain.name} sequence, ${sequence.length} residues`}>
              {rows.map((row) => (
                <div className="seq-row" key={row.start}>
                  <span className="seq-pos">{row.start.toLocaleString()}</span>
                  <span className="seq-bases">
                    {row.parts.map((part, i) => (
                      <span key={i} style={{ color: COLORS[part.type] }}>
                        {part.text}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </>
        ))}
    </div>
  );
}

function SegmentChip({ segment, alphabet }: { segment: Segment; alphabet: Alphabet }) {
  const unit = alphabet === 'aa' ? 'aa' : 'bp';
  return (
    <span
      className="ent-seg"
      style={{ color: COLORS[segment.type], borderColor: COLORS[segment.type] }}
      data-tip={`${segment.blockName} (${segment.blockId}) — ${PART_LABELS[segment.type]}, ${segment.start.toLocaleString()}–${segment.end.toLocaleString()} of the chain, ${(segment.end - segment.start + 1).toLocaleString()} ${unit}`}
    >
      {PART_LABELS[segment.type]}
      <span className="ent-seg-range">
        {segment.start.toLocaleString()}–{segment.end.toLocaleString()}
      </span>
    </span>
  );
}
