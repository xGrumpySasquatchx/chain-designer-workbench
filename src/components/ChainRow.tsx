import type { DragEvent, MouseEvent } from 'react';
import { effectiveResolution, useApp, useDispatch } from '../state/store';
import { suppliedByVector, variantCount } from '../model/combinatorics';
import { RESOLUTION_LABELS } from '../model/parts';
import { ChevronIcon, CloseIcon, GripIcon, NoteIcon } from './Icons';
import { SlotCell } from './SlotCell';

export const NODE_DRAG_TYPE = 'application/x-msab-node';

interface Props {
  chainId: string;
  inGroup: boolean;
  onRowDragOver: (e: DragEvent<HTMLElement>, nodeId: string) => void;
  onRowDrop: (e: DragEvent<HTMLElement>) => void;
  dropBefore: boolean;
}

export function ChainRow({ chainId, inGroup, onRowDragOver, onRowDrop, dropBefore }: Props) {
  const state = useApp();
  const dispatch = useDispatch();
  const chain = state.chains[chainId];
  if (!chain) return null;

  const resolution = effectiveResolution(state, chainId);
  const supplied = suppliedByVector(chain, state.registry);
  const selected = state.selection.includes(chainId);
  const hiddenCombinatorics = chain.slots.some(
    (s) => s.level > resolution && s.blockIds.length > 0,
  );
  const variants = variantCount(chain);

  function onSelect(e: MouseEvent<HTMLDivElement>) {
    const mode = e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'single';
    dispatch({ type: 'select', id: chainId, mode });
    dispatch({ type: 'focus-chain', chainId });
  }

  return (
    <div
      className={[
        'row',
        selected ? 'selected' : '',
        state.focusChainId === chainId ? 'focused' : '',
        state.flashChainId === chainId ? 'flash' : '',
        dropBefore ? 'drop-before' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      draggable
      onDragStart={(e) => e.dataTransfer.setData(NODE_DRAG_TYPE, chainId)}
      onDragOver={(e) => onRowDragOver(e, chainId)}
      onDrop={onRowDrop}
      onClick={onSelect}
    >
      <span className="grip">
        <GripIcon />
      </span>
      {hiddenCombinatorics && (
        <span
          className="hidden-dot"
          data-tip={`A part is set at a finer resolution than “${RESOLUTION_LABELS[resolution]}”, so it is not shown on this row`}
        />
      )}
      <span
        className="row-label"
        data-tip={
          chain.note
            ? `Note: ${chain.note}`
            : `${chain.name} — ${chain.kind} chain. Click to focus it, shift-click for a range, cmd-click to toggle it.`
        }
      >
        {chain.name}
        <span className="row-kind"> · {chain.kind}</span>
      </span>

      <span className="slots">
        {chain.slots.map((slot, i) =>
          slot.level <= resolution ? (
            <SlotCell
              key={`${chain.id}-${i}`}
              chainId={chain.id}
              slotIndex={i}
              slot={slot}
              fromVector={supplied.includes(slot.type)}
            />
          ) : null,
        )}
      </span>

      {variants > 1 && (
        <button
          className="badge warn"
          data-tip={`${variants} combinations come out of the stacked options on this chain — open the gallery to see them`}
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: 'open-gallery', chainId });
          }}
        >
          {variants} variants
        </button>
      )}
      {chain.regIds.length > 0 && (
        <span
          className="badge reg"
          data-tip={`Registered in inventory as ${chain.regIds.join(', ')}`}
        >
          {chain.regIds.length > 1 ? `${chain.regIds.length} REG` : chain.regIds[0]}
        </span>
      )}
      {chain.regIds.length === 0 && chain.constructIds.length > 0 && (
        <span
          className="badge cc"
          data-tip={`Assembled as ${chain.constructIds.join(', ')} — not yet registered`}
        >
          {chain.constructIds.length > 1
            ? `${chain.constructIds.length} CC`
            : chain.constructIds[0]}
        </span>
      )}

      <button
        className="icon-btn"
        data-tip={`Resolution for this row alone: ${RESOLUTION_LABELS[resolution]}${
          chain.resolutionOverride ? ' (overriding the bench setting)' : ''
        }. Click to cycle it.`}
        onClick={(e) => {
          e.stopPropagation();
          dispatch({ type: 'cycle-row-resolution', chainId });
        }}
      >
        <ChevronIcon />
      </button>
      <button
        className={`icon-btn${chain.note ? ' has-note' : ''}`}
        data-tip={chain.note ? `Note: ${chain.note} — click to edit` : 'Attach a note to this chain'}
        onClick={(e) => {
          e.stopPropagation();
          const note = window.prompt(`Annotation for ${chain.name}:`, chain.note ?? '');
          if (note !== null) dispatch({ type: 'annotate', ids: [chainId], note });
        }}
      >
        <NoteIcon />
      </button>
      {inGroup && (
        <button
          className="icon-btn danger"
          data-tip="Eject this chain from the group, leaving it on the bench"
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: 'eject', chainId });
          }}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}
