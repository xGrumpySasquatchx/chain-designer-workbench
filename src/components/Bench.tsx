import { useState, type DragEvent } from 'react';
import { RESOLUTION_LABELS } from '../model/parts';
import { variantCount } from '../model/combinatorics';
import { useApp, useDispatch } from '../state/store';
import { ChainRow, NODE_DRAG_TYPE } from './ChainRow';
import { GripIcon } from './Icons';
import type { BenchGroup, Resolution } from '../model/types';

interface DropTarget {
  beforeId: string | null;
  container: string | null;
}

export function Bench() {
  const state = useApp();
  const dispatch = useDispatch();
  const [drop, setDrop] = useState<DropTarget | null>(null);

  const selectedChains = state.selection.filter((id) => state.chains[id]);
  const selectedGroups = state.bench.filter(
    (n) => n.kind === 'group' && state.selection.includes(n.id),
  );
  const focusedChain = state.chains[state.focusChainId];

  /** Insertion point is the half of the hovered row the pointer is in. */
  function handleRowDragOver(e: DragEvent<HTMLElement>, nodeId: string) {
    if (!e.dataTransfer.types.includes(NODE_DRAG_TYPE)) return;
    e.preventDefault();
    e.stopPropagation();
    const box = e.currentTarget.getBoundingClientRect();
    const before = e.clientY < box.top + box.height / 2;
    const group = state.bench.find(
      (n): n is BenchGroup => n.kind === 'group' && n.children.includes(nodeId),
    );
    const siblings = group ? group.children : state.bench.map((n) => n.id);
    const index = siblings.indexOf(nodeId);
    const beforeId = before ? nodeId : (siblings[index + 1] ?? null);
    setDrop({ beforeId, container: group?.id ?? null });
  }

  function handleDrop(e: DragEvent<HTMLElement>) {
    const dragId = e.dataTransfer.getData(NODE_DRAG_TYPE);
    if (!dragId || !drop) return;
    e.preventDefault();
    e.stopPropagation();
    dispatch({ type: 'reorder', dragId, beforeId: drop.beforeId, container: drop.container });
    setDrop(null);
  }

  function annotateSelected() {
    if (!selectedChains.length) return;
    const note = window.prompt(`Annotation for ${selectedChains.length} selected chains:`);
    if (note !== null) dispatch({ type: 'annotate', ids: selectedChains, note });
  }

  return (
    <div className="panel grow" onDragEnd={() => setDrop(null)}>
      <div className="toolbar">
        <div className="seg">
          {([1, 2, 3] as Resolution[]).map((lvl) => (
            <button
              key={lvl}
              className={state.resolution === lvl ? 'active' : ''}
              onClick={() => dispatch({ type: 'set-resolution', level: lvl })}
            >
              {RESOLUTION_LABELS[lvl]}
            </button>
          ))}
        </div>
        <button
          className="btn"
          disabled={selectedChains.length < 2}
          onClick={() => dispatch({ type: 'group-selected' })}
        >
          Group selected
        </button>
        <button
          className="btn"
          disabled={selectedGroups.length === 0}
          onClick={() => dispatch({ type: 'ungroup-selected' })}
        >
          Ungroup selected
        </button>
        <button className="btn" disabled={!selectedChains.length} onClick={annotateSelected}>
          Annotate selected
        </button>
        <span className="spacer" />
        <button className="btn" onClick={() => dispatch({ type: 'add-chain', kind: 'heavy' })}>
          + Heavy
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'add-chain', kind: 'light' })}>
          + Light
        </button>
        <button
          className="btn"
          disabled={!focusedChain || variantCount(focusedChain) < 2}
          title="Expand the stacked options on the focused chain into individual constructs"
          onClick={() => dispatch({ type: 'open-gallery', chainId: state.focusChainId })}
        >
          Generate all
        </button>
        <span className="sel-count">{state.selection.length} selected</span>
      </div>

      <div className="bench-list" onDragOver={(e) => e.preventDefault()}>
        {state.bench.map((node) =>
          node.kind === 'chain' ? (
            <ChainRow
              key={node.id}
              chainId={node.id}
              inGroup={false}
              onRowDragOver={handleRowDragOver}
              onRowDrop={handleDrop}
              dropBefore={drop?.beforeId === node.id && drop.container === null}
            />
          ) : (
            <div
              key={node.id}
              className={`group${state.selection.includes(node.id) ? ' selected' : ''}`}
              draggable
              onDragStart={(e) => e.dataTransfer.setData(NODE_DRAG_TYPE, node.id)}
              onDragOver={(e) => handleRowDragOver(e, node.id)}
              onDrop={handleDrop}
            >
              <div
                className="group-header"
                onClick={(e) =>
                  dispatch({
                    type: 'select',
                    id: node.id,
                    mode: e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'single',
                  })
                }
              >
                <span className="grip">
                  <GripIcon />
                </span>
                <input
                  value={node.name}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    dispatch({ type: 'rename-group', groupId: node.id, name: e.target.value })
                  }
                />
                <span className="group-meta">{node.children.length} chains</span>
                <button
                  className="btn ghost"
                  style={{ marginLeft: 'auto' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: 'toggle-group-collapsed', groupId: node.id });
                  }}
                >
                  {node.collapsed ? 'Expand' : 'Collapse'}
                </button>
                <button
                  className="btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: 'ungroup', groupId: node.id });
                  }}
                >
                  Ungroup
                </button>
              </div>
              {!node.collapsed && (
                <div className="group-body">
                  {node.children.map((childId) => (
                    <ChainRow
                      key={childId}
                      chainId={childId}
                      inGroup
                      onRowDragOver={handleRowDragOver}
                      onRowDrop={handleDrop}
                      dropBefore={drop?.beforeId === childId && drop.container === node.id}
                    />
                  ))}
                </div>
              )}
            </div>
          ),
        )}
      </div>

      <p className="hint">
        Click a row to focus it, shift-click for a range, cmd-click to toggle one in or out. The
        chevron overrides resolution for that row alone; an amber dot means a part is set at a level
        you are not currently viewing. The × on a grouped row ejects just that chain.
      </p>
    </div>
  );
}
