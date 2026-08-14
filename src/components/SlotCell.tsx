import { useState } from 'react';
import { COLORS, PART_LABELS } from '../model/parts';
import { useApp, useDispatch } from '../state/store';
import { PART_DRAG_TYPE } from './RegistryRail';
import type { Slot } from '../model/types';

interface Props {
  chainId: string;
  slotIndex: number;
  slot: Slot;
  /** True when the backbone already encodes this region. */
  fromVector: boolean;
}

export function SlotCell({ chainId, slotIndex, slot, fromVector }: Props) {
  const state = useApp();
  const dispatch = useDispatch();
  const [over, setOver] = useState(false);

  const isActive =
    state.activeSlot?.chainId === chainId && state.activeSlot.slotIndex === slotIndex;
  const filled = slot.blockIds.length > 0;
  const names = slot.blockIds.map((id) => state.registry.blocks[id]?.name ?? id);

  const tip = filled
    ? `${PART_LABELS[slot.type]}: ${names.join(' / ')}${
        slot.blockIds.length > 1 ? ` — ${slot.blockIds.length} stacked options` : ''
      }. Click to select it everywhere, double-click to clear it.`
    : fromVector
      ? `${PART_LABELS[slot.type]} is supplied by the backbone, so this slot does not need a part`
      : `${PART_LABELS[slot.type]} — empty. Drag a part here, or click the slot and then a part in the registry.`;

  return (
    <button
      className={[
        'slot',
        filled ? 'filled' : '',
        fromVector && !filled ? 'from-vector' : '',
        isActive ? 'active' : '',
        over ? 'over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-tip={tip}
      onClick={(e) => {
        e.stopPropagation();
        // Linked selection: the pad, the map and the rail all follow this.
        dispatch({ type: 'select-component', chainId, slotIndex });
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        dispatch({ type: 'clear-slot', chainId, slotIndex });
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(PART_DRAG_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        const blockId = e.dataTransfer.getData(PART_DRAG_TYPE);
        setOver(false);
        if (!blockId) return;
        e.preventDefault();
        e.stopPropagation();
        const block = state.registry.blocks[blockId];
        if (!block || block.type !== slot.type) return;
        dispatch({ type: 'place-block', chainId, slotIndex, blockId, stack: e.shiftKey });
      }}
    >
      {filled ? (
        slot.blockIds.map((id) => (
          <span key={id} className="slot-fill" style={{ background: COLORS[slot.type] }} />
        ))
      ) : (
        <span
          className="slot-fill"
          style={{
            background: fromVector ? COLORS[slot.type] : 'transparent',
            opacity: fromVector ? 0.28 : 1,
          }}
        />
      )}
      {!filled && <span className="slot-type">{PART_LABELS[slot.type]}</span>}
      {slot.blockIds.length > 1 && (
        <span className="slot-stack-count">×{slot.blockIds.length}</span>
      )}
    </button>
  );
}
