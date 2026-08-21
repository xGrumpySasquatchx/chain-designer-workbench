import { useEffect, useState, type PointerEvent } from 'react';
import { ActivityLog } from './components/ActivityLog';
import { Bench } from './components/Bench';
import { ConstructMap } from './components/ConstructMap';
import { DesignPad } from './components/DesignPad';
import { Plate } from './components/Plate';
import { PlateQueue } from './components/PlateQueue';
import { QcPanel } from './components/QcPanel';
import { RegistryRail } from './components/RegistryRail';
import { RegistryReview } from './components/RegistryReview';
import { TooltipLayer } from './components/Tooltip';
import { VariantGallery } from './components/VariantGallery';
import { WorklistStrip } from './components/WorklistStrip';
import { useApp, useDispatch } from './state/store';

const RAIL_RANGE: [number, number] = [186, 460];
const INSPECTOR_RANGE: [number, number] = [260, 640];

function clamp(value: number, [min, max]: [number, number]) {
  return Math.min(Math.max(value, min), max);
}

/** Column widths are only adjustable while the three-column layout is in play. */
function useMinWidth(px: number) {
  const [wide, setWide] = useState(() => window.matchMedia(`(min-width: ${px}px)`).matches);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${px}px)`);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [px]);
  return wide;
}

interface ResizerProps {
  area: 'res-rail' | 'res-inspector';
  tip: string;
  onDelta: (dx: number) => void;
}

function ColResizer({ area, tip, onDelta }: ResizerProps) {
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    let last = e.clientX;
    const move = (ev: globalThis.PointerEvent) => {
      onDelta(ev.clientX - last);
      last = ev.clientX;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing-h');
    };
    document.body.classList.add('resizing-h');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <div
      className={`col-resizer ${area}`}
      role="separator"
      aria-orientation="vertical"
      data-tip={tip}
      onPointerDown={onPointerDown}
    />
  );
}

export default function App() {
  const [railWidth, setRailWidth] = useState(252);
  const [inspectorWidth, setInspectorWidth] = useState(344);
  const adjustable = useMinWidth(1181);
  const state = useApp();
  const dispatch = useDispatch();
  const regCount = Object.keys(state.registry.registered).length;
  const molCount = Object.keys(state.registry.molecules).length;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Protein Chain Designer</h1>
          <p>
            Multiple-insert cloning bench — parts registry, chain bench, live molecule and construct
            views, wired to the BB → INS → VEC → CC → REG → MOL loop.
          </p>
        </div>
        <button
          className="btn primary review-open"
          data-tip={`Review everything registered: ${molCount} ${
            molCount === 1 ? 'molecule' : 'molecules'
          } and ${regCount} ${regCount === 1 ? 'chain' : 'chains'}, each with the construct, insert and backbone behind it`}
          onClick={() => dispatch({ type: 'open-review', open: true })}
        >
          Registered
          <span className="badge">{molCount ? `${molCount} · ${regCount}` : regCount}</span>
        </button>
      </header>

      <div
        className="columns"
        style={
          adjustable
            ? {
                gridTemplateColumns: `${railWidth}px 8px minmax(0, 1fr) 8px ${inspectorWidth}px`,
              }
            : undefined
        }
      >
        <div className="column col-rail">
          <PlateQueue />
          <RegistryRail />
        </div>

        <ColResizer
          area="res-rail"
          tip="Drag to widen or narrow the plate queue and parts registry column"
          onDelta={(dx) => setRailWidth((w) => clamp(w + dx, RAIL_RANGE))}
        />

        <div className="column col-bench">
          <Plate />
          <WorklistStrip />
          <Bench />
        </div>

        <ColResizer
          area="res-inspector"
          tip="Drag to widen or narrow the inspector column"
          onDelta={(dx) => setInspectorWidth((w) => clamp(w - dx, INSPECTOR_RANGE))}
        />

        <div className="column col-inspector">
          <DesignPad />
          <ConstructMap />
          <QcPanel />
          <ActivityLog />
        </div>
      </div>

      <VariantGallery />
      <RegistryReview />
      <TooltipLayer />
    </div>
  );
}
