import { Panel } from './Panel';
import { flowState, type FlowStepId, type NodeStatus } from '../model/flow';
import { useApp, useDispatch } from '../state/store';

/**
 * The cloning loop as an actual flowchart: fixed geometry, one shape per node
 * kind, orthogonal connectors, and branch labels sitting in the corridors
 * between rows rather than on top of the nodes.
 */

type Shape = 'stadium' | 'decision' | 'action';

interface NodeBox {
  id: FlowStepId;
  label: string;
  sub: string;
  shape: Shape;
  x: number;
  y: number;
  w: number;
}

const H = 30;
const ROW_MAIN = 62;
const ROW_LOWER = 128;
const ROW_SIDE = 14;

/** Row 1 runs left to right; row 2 runs right to left, under it. */
function layout(): NodeBox[] {
  const main: Array<[FlowStepId, string, string, Shape, number]> = [
    ['select-chain', 'Select chain', 'from worklist', 'stadium', 74],
    ['check-reg', 'Registered?', 'check REG-id', 'decision', 84],
    ['define-components', 'Define components', 'from BB-id', 'action', 112],
    ['select-insert', 'Select insert', 'per component, INS-id', 'action', 104],
    ['check-cc', 'Construct exists?', 'check CC-id', 'decision', 96],
  ];
  const lower: Array<[FlowStepId, string, string, Shape, number]> = [
    ['select-or-edit', 'Existing or edit?', 'CC-id branch', 'decision', 96],
    ['check-vec', 'Backbone exists?', 'check VEC-id', 'decision', 98],
    ['assemble', 'Assemble', 'insert + vector, new CC-id', 'action', 98],
    ['validate', 'Validate', 'QC check', 'decision', 88],
    ['register', 'Register chain', 'new REG-id', 'stadium', 92],
  ];

  const boxes: NodeBox[] = [];
  let x = 10;
  main.forEach(([id, label, sub, shape, w]) => {
    boxes.push({ id, label, sub, shape, x, y: ROW_MAIN, w });
    x += w + 24;
  });
  const mainRight = x - 24;

  let right = mainRight;
  lower.forEach(([id, label, sub, shape, w]) => {
    right -= w;
    boxes.push({ id, label, sub, shape, x: right, y: ROW_LOWER, w });
    right -= 18;
  });

  // The registered branch is a side path above the decision that reaches it.
  const checkReg = boxes.find((b) => b.id === 'check-reg')!;
  boxes.push({
    id: 'reg-info',
    label: 'Show REG info',
    sub: '+ inventory status',
    shape: 'action',
    x: checkReg.x + checkReg.w + 24,
    y: ROW_SIDE,
    w: 104,
  });

  return boxes;
}

const BOXES = layout();
const VIEW_W = 620;
const VIEW_H = 196;

function box(id: FlowStepId): NodeBox {
  return BOXES.find((b) => b.id === id)!;
}

const FILL: Record<Shape, string> = {
  stadium: '#eef4ec',
  decision: '#fdf6ee',
  action: 'var(--surface-2)',
};

function style(shape: Shape, status: NodeStatus) {
  if (status === 'active') {
    return { fill: 'var(--bg-accent)', stroke: 'var(--border-accent)', width: 1.8, opacity: 1 };
  }
  if (status === 'skipped') {
    return { fill: FILL[shape], stroke: 'var(--border)', width: 0.8, opacity: 0.35 };
  }
  if (status === 'done') {
    return { fill: FILL[shape], stroke: 'var(--border-strong)', width: 0.8, opacity: 0.85 };
  }
  return { fill: FILL[shape], stroke: 'var(--border-strong)', width: 0.8, opacity: 1 };
}

/** Decisions get chamfered corners so they read as branch points. */
function shapePath(node: NodeBox): string {
  const { x, y, w } = node;
  if (node.shape === 'decision') {
    const c = 9;
    return `M ${x + c} ${y} H ${x + w - c} L ${x + w} ${y + H / 2} L ${x + w - c} ${y + H} H ${x + c} L ${x} ${y + H / 2} Z`;
  }
  return '';
}

interface EdgeProps {
  d: string;
  label?: string;
  labelAt?: { x: number; y: number };
  dashed?: boolean;
  dim?: boolean;
}

function Edge({ d, label, labelAt, dashed, dim }: EdgeProps) {
  return (
    <g opacity={dim ? 0.35 : 1}>
      <path
        d={d}
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth={1}
        strokeDasharray={dashed ? '3 3' : undefined}
        markerEnd="url(#flow-arrow)"
      />
      {label && labelAt && (
        <>
          <rect
            x={labelAt.x - label.length * 2.1 - 3}
            y={labelAt.y - 7}
            width={label.length * 4.2 + 6}
            height={10}
            rx={2}
            fill="var(--surface-2)"
          />
          <text x={labelAt.x} y={labelAt.y} textAnchor="middle" fontSize="7.5" fill="var(--text-secondary)">
            {label}
          </text>
        </>
      )}
    </g>
  );
}

export function FlowDiagram() {
  const state = useApp();
  const dispatch = useDispatch();
  const chain = state.chains[state.focusChainId];
  if (!chain) return null;
  const flow = flowState(chain, state.registry);

  const selectChain = box('select-chain');
  const checkReg = box('check-reg');
  const regInfo = box('reg-info');
  const define = box('define-components');
  const selectInsert = box('select-insert');
  const checkCc = box('check-cc');
  const orEdit = box('select-or-edit');
  const checkVec = box('check-vec');
  const assemble = box('assemble');
  const validate = box('validate');
  const register = box('register');

  const midY = (b: NodeBox) => b.y + H / 2;
  const right = (b: NodeBox) => b.x + b.w;
  const cx = (b: NodeBox) => b.x + b.w / 2;

  // Corridors: horizontal runs live between the rows so nothing overlaps a node.
  const CORRIDOR_TOP = ROW_LOWER - 18;
  const CORRIDOR_FAIL = ROW_LOWER - 8;
  const CORRIDOR_EDIT = ROW_LOWER + H + 12;
  const CORRIDOR_EXISTING = ROW_LOWER + H + 26;

  const dim = (id: FlowStepId) => flow.statuses[id] === 'skipped';

  return (
    <Panel
      title="Cloning loop"
      tip="Where the focused chain sits in the process: the highlighted node is the current step, and dimmed nodes are branches it did not take"
      trailing={
        <>
          <span className="badge">{chain.name}</span>
          <span className="flow-next">Next: {flow.next.label}</span>
          <button
            className="btn"
            disabled={flow.next.kind !== 'assemble' && flow.next.kind !== 'register'}
            data-tip={
              flow.next.kind === 'register'
                ? 'Register this chain now — it has passed QC'
                : flow.next.kind === 'assemble'
                  ? 'Assemble the insert with the backbone now'
                  : `The next step is “${flow.next.label}”, which happens on the bench rather than here`
            }
            onClick={() =>
              dispatch(
                flow.next.kind === 'register'
                  ? { type: 'register', chainId: chain.id }
                  : { type: 'assemble', chainId: chain.id },
              )
            }
          >
            {flow.next.kind === 'register' ? 'Register' : 'Assemble'}
          </button>
        </>
      }
    >
      <svg
        className="flow-svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label="Cloning loop for the focused chain"
      >
        <defs>
          <marker id="flow-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 1 L 7 4 L 0 7 z" fill="var(--border-strong)" />
          </marker>
        </defs>

        {/* Main row */}
        <Edge d={`M ${right(selectChain)} ${midY(selectChain)} H ${checkReg.x - 2}`} />
        <Edge
          d={`M ${cx(checkReg)} ${checkReg.y} V ${regInfo.y + H + 8} H ${regInfo.x - 2}`}
          label="Yes"
          labelAt={{ x: cx(checkReg) + 16, y: ROW_SIDE + H + 6 }}
          dim={dim('reg-info')}
        />
        <Edge
          d={`M ${right(checkReg)} ${midY(checkReg)} H ${define.x - 2}`}
          label="No"
          labelAt={{ x: (right(checkReg) + define.x) / 2, y: midY(checkReg) - 5 }}
          dim={dim('define-components')}
        />
        <Edge d={`M ${right(define)} ${midY(define)} H ${selectInsert.x - 2}`} dim={dim('define-components')} />
        <Edge d={`M ${right(selectInsert)} ${midY(selectInsert)} H ${checkCc.x - 2}`} dim={dim('select-insert')} />

        {/* Construct exists? — Yes drops straight down, No runs left along a corridor */}
        <Edge
          d={`M ${cx(checkCc)} ${checkCc.y + H} V ${orEdit.y - 2}`}
          label="Yes"
          labelAt={{ x: cx(checkCc) + 15, y: CORRIDOR_TOP - 6 }}
          dim={dim('select-or-edit')}
        />
        <Edge
          d={`M ${checkCc.x} ${midY(checkCc)} H ${checkCc.x - 12} V ${CORRIDOR_TOP} H ${cx(checkVec)} V ${checkVec.y - 2}`}
          label="No"
          labelAt={{ x: cx(checkVec) + 26, y: CORRIDOR_TOP - 3 }}
          dim={dim('check-vec')}
        />

        {/* Lower row, running right to left */}
        <Edge
          d={`M ${checkVec.x} ${midY(checkVec)} H ${right(assemble) + 2}`}
          label="Yes"
          labelAt={{ x: (checkVec.x + right(assemble)) / 2, y: midY(checkVec) - 5 }}
        />
        <Edge d={`M ${assemble.x} ${midY(assemble)} H ${right(validate) + 2}`} />
        <Edge
          d={`M ${validate.x} ${midY(validate)} H ${right(register) + 2}`}
          label="Pass"
          labelAt={{ x: (validate.x + right(register)) / 2, y: midY(validate) - 5 }}
        />
        <Edge
          d={`M ${cx(validate)} ${validate.y} V ${CORRIDOR_FAIL} H ${cx(assemble)} V ${assemble.y - 2}`}
          label="Fail"
          labelAt={{ x: (cx(validate) + cx(assemble)) / 2, y: CORRIDOR_FAIL - 3 }}
        />

        {/* Existing or edit? — both paths converge on registration */}
        <Edge
          d={`M ${cx(orEdit) - 18} ${orEdit.y + H} V ${CORRIDOR_EDIT} H ${cx(assemble)} V ${assemble.y + H + 2}`}
          label="Edit"
          labelAt={{ x: cx(orEdit) - 44, y: CORRIDOR_EDIT - 3 }}
          dim={dim('select-or-edit')}
        />
        <Edge
          d={`M ${cx(orEdit) + 6} ${orEdit.y + H} V ${CORRIDOR_EXISTING} H ${cx(register)} V ${register.y + H + 2}`}
          label="Select existing"
          labelAt={{ x: cx(register) + 74, y: CORRIDOR_EXISTING - 3 }}
          dim={dim('select-or-edit')}
        />

        {/* The loop closes: the next chain in the worklist */}
        <Edge
          d={`M ${register.x} ${midY(register)} H 6 V ${midY(selectChain)} H ${selectChain.x - 2}`}
          label="next chain"
          labelAt={{ x: 44, y: ROW_MAIN + H + 16 }}
          dashed
        />

        {BOXES.map((node) => {
          const status = flow.statuses[node.id];
          const s = style(node.shape, status);
          return (
            <g key={node.id} opacity={s.opacity}>
              {node.shape === 'decision' ? (
                <path d={shapePath(node)} fill={s.fill} stroke={s.stroke} strokeWidth={s.width} />
              ) : (
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.w}
                  height={H}
                  rx={node.shape === 'stadium' ? H / 2 : 5}
                  fill={s.fill}
                  stroke={s.stroke}
                  strokeWidth={s.width}
                />
              )}
              <text
                x={cx(node)}
                y={node.y + 13}
                textAnchor="middle"
                fontSize="8.5"
                fill="var(--text-primary)"
                fontWeight={status === 'active' ? 600 : 400}
              >
                {node.label}
              </text>
              <text x={cx(node)} y={node.y + 23} textAnchor="middle" fontSize="6.8" fill="var(--text-muted)">
                {node.sub}
              </text>
              <title>{`${node.label} — ${node.sub} (${status})`}</title>
            </g>
          );
        })}
      </svg>

      <p className="flow-legend">
        <span className="flow-key active" /> current step
        <span className="flow-key done" /> completed
        <span className="flow-key skipped" /> branch not taken
      </p>
    </Panel>
  );
}
