import { chosenCount, componentsComplete, variantCount } from './combinatorics';
import { runQc } from './qc';
import type { ChainDesign, QcResult, Registry } from './types';

export type FlowStepId =
  | 'select-chain'
  | 'check-reg'
  | 'reg-info'
  | 'define-components'
  | 'select-insert'
  | 'check-cc'
  | 'select-or-edit'
  | 'check-vec'
  | 'assemble'
  | 'validate'
  | 'register';

export type NodeKind = 'start' | 'decision' | 'action' | 'terminal';
export type NodeStatus = 'done' | 'active' | 'pending' | 'skipped';

export interface FlowNodeDef {
  id: FlowStepId;
  label: string;
  sub?: string;
  kind: NodeKind;
  /** Branch label from the preceding decision, as drawn in the flow diagram. */
  branch?: string;
}

/** The cloning loop, node for node from the process diagram. */
export const FLOW_NODES: FlowNodeDef[] = [
  { id: 'select-chain', label: 'Select chain', sub: 'from worklist', kind: 'start' },
  { id: 'check-reg', label: 'Registered?', sub: 'check REG-id', kind: 'decision' },
  { id: 'reg-info', label: 'Show REG info + inventory', branch: 'Yes', kind: 'action' },
  {
    id: 'define-components',
    label: 'Define chain components',
    sub: 'from building blocks, BB-id',
    branch: 'No',
    kind: 'action',
  },
  { id: 'select-insert', label: 'Select insert per component', sub: 'INS-id options', kind: 'action' },
  { id: 'check-cc', label: 'Construct exists?', sub: 'check CC-id', kind: 'decision' },
  { id: 'select-or-edit', label: 'Select existing or edit?', branch: 'Yes', kind: 'decision' },
  { id: 'check-vec', label: 'Vector backbone exists?', sub: 'check VEC-id', branch: 'No', kind: 'decision' },
  { id: 'assemble', label: 'Assemble insert + vector', sub: 'new CC-id', kind: 'action' },
  { id: 'validate', label: 'Validate construct', sub: 'QC check', kind: 'decision' },
  { id: 'register', label: 'Register chain', sub: 'REG-id, loop continues', kind: 'terminal' },
];

export interface FlowState {
  activeId: FlowStepId;
  statuses: Record<FlowStepId, NodeStatus>;
  qc: QcResult;
  /** The one thing this chain needs next, driving the primary action button. */
  next:
    | { kind: 'components'; label: string }
    | { kind: 'vector'; label: string }
    | { kind: 'assemble'; label: string }
    | { kind: 'fix-qc'; label: string }
    | { kind: 'register'; label: string }
    | { kind: 'done'; label: string };
}

function order(id: FlowStepId) {
  return FLOW_NODES.findIndex((n) => n.id === id);
}

export function flowState(chain: ChainDesign, registry: Registry): FlowState {
  const qc = runQc(chain, registry);
  const complete = componentsComplete(chain, registry);

  let activeId: FlowStepId;
  let next: FlowState['next'];

  if (chain.regIds.length) {
    activeId = 'reg-info';
    next = {
      kind: 'done',
      label:
        chain.regIds.length > 1
          ? `Registered as ${chain.regIds.length} chains`
          : `Registered as ${chain.regIds[0]}`,
    };
  } else if (!complete) {
    activeId = chosenCount(chain) === 0 ? 'define-components' : 'select-insert';
    next = { kind: 'components', label: 'Fill remaining components' };
  } else if (!chain.vectorId) {
    activeId = 'check-vec';
    next = { kind: 'vector', label: 'Choose a vector backbone' };
  } else if (!chain.constructIds.length) {
    activeId = 'assemble';
    const n = variantCount(chain);
    next = { kind: 'assemble', label: n > 1 ? `Assemble ${n} constructs` : 'Assemble insert + vector' };
  } else if (qc.status === 'fail') {
    activeId = 'validate';
    next = { kind: 'fix-qc', label: 'Return to assemble or edit selections' };
  } else {
    activeId = 'register';
    next = { kind: 'register', label: 'Register chain' };
  }

  const activeOrder = order(activeId);
  const statuses = {} as Record<FlowStepId, NodeStatus>;
  for (const node of FLOW_NODES) {
    const o = order(node.id);
    if (node.id === activeId) statuses[node.id] = 'active';
    else if (o < activeOrder) statuses[node.id] = 'done';
    else statuses[node.id] = 'pending';
  }

  // Mark the branches this chain did not take.
  if (chain.regIds.length) {
    (['define-components', 'select-insert', 'check-cc', 'check-vec', 'assemble', 'validate'] as FlowStepId[]).forEach(
      (id) => (statuses[id] = 'skipped'),
    );
    statuses.register = 'done';
    statuses['select-or-edit'] = 'skipped';
  } else {
    // No pre-existing CC-id in v0 means the "select existing or edit" branch is
    // only reachable after this session has minted a construct.
    statuses['select-or-edit'] = chain.constructIds.length ? 'done' : 'skipped';
    statuses['reg-info'] = 'skipped';
  }

  return { activeId, statuses, qc, next };
}
