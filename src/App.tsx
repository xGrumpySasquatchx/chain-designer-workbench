import { COLORS, PART_LABELS } from './model/parts';
import { ActivityLog } from './components/ActivityLog';
import { Bench } from './components/Bench';
import { ConstructMap } from './components/ConstructMap';
import { DesignPad } from './components/DesignPad';
import { FlowDiagram } from './components/FlowDiagram';
import { QcPanel } from './components/QcPanel';
import { RegistryRail } from './components/RegistryRail';
import { VariantGallery } from './components/VariantGallery';
import { WorklistStrip } from './components/WorklistStrip';
import type { PartType } from './model/types';

const LEGEND_ORDER: PartType[] = [
  'promoter',
  'vh',
  'hinge',
  'ch1',
  'ch2',
  'ch3',
  'vl',
  'cl',
  'linker',
  'term',
];

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>
            MsAb construct designer <span className="version">v0</span>
          </h1>
          <p>
            Multiple-insert cloning bench — parts registry, chain bench, live molecule and construct
            views, wired to the BB → INS → VEC → CC → REG loop.
          </p>
        </div>
        <div className="legend">
          {LEGEND_ORDER.map((type) => (
            <span key={type}>
              <span className="swatch" style={{ background: COLORS[type] }} />
              {PART_LABELS[type]}
            </span>
          ))}
        </div>
      </header>

      <div className="columns">
        <div className="column col-rail">
          <RegistryRail />
        </div>
        <div className="column col-bench">
          <FlowDiagram />
          <WorklistStrip />
          <Bench />
        </div>
        <div className="column col-inspector">
          <DesignPad />
          <ConstructMap />
          <QcPanel />
          <ActivityLog />
        </div>
      </div>

      <VariantGallery />
    </div>
  );
}
