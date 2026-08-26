import { useMemo, useState } from 'react';
import { Panel } from './Panel';
import {
  STATUS_LABEL,
  TAB_LABEL,
  TAB_TIP,
  actualsFromLot,
  bottleneck,
  buildTracker,
  chainSchedule,
  cloneStages,
  computeStage,
  fmtDate,
  fmtDays,
  lotsFromWorkbench,
  occupancyByStage,
  parseIsoDate,
  parseNumber,
  programDuration,
  remainingTargets,
  weeksToClear,
  type PepLot,
  type PepTab,
  type Stage,
} from '../model/pep';
import { ForecastTab } from '../planning/forecast/ui/ForecastTab';
import { referenceProcessModel } from '../planning/forecast/model/ProcessModel';
import { openCapacityFromOccupancy, workItemsFromLots } from '../planning/forecast/workbench';
import { useApp, useDispatch } from '../state/store';

const TABS: PepTab[] = ['matrix', 'tracker', 'capacity', 'forecast'];

export function PepPanel() {
  const state = useApp();
  const dispatch = useDispatch();
  const [tab, setTab] = useState<PepTab>('tracker');
  const [stages, setStages] = useState(() => cloneStages());
  const [rework, setRework] = useState<Record<string, Record<number, string>>>({});
  const [targetOverride, setTargetOverride] = useState<number | null>(null);

  const lots = useMemo(
    () => lotsFromWorkbench(state.plateQueue, state.chains, state.activePlateId, state.plate),
    [state.plateQueue, state.chains, state.activePlateId, state.plate],
  );
  const occupancy = useMemo(() => occupancyByStage(lots), [lots]);
  const remaining = useMemo(() => remainingTargets(lots), [lots]);
  const forecastModel = useMemo(() => referenceProcessModel(), []);
  const forecastBaseline = useMemo(() => workItemsFromLots(lots), [lots]);
  const forecastOpen = useMemo(
    () => openCapacityFromOccupancy(occupancy, forecastModel),
    [occupancy, forecastModel],
  );
  const targets = targetOverride ?? remaining;
  const selected = lots.find((lot) => lot.id === state.activePlateId) ?? lots[0];
  const startKey = selected?.started ?? '2026-08-20';
  const start = useMemo(() => parseIsoDate(startKey) ?? new Date(2026, 7, 20), [startKey]);
  const baseline = useMemo(
    () => chainSchedule(stages, start),
    [stages, start],
  );
  const actuals = useMemo(
    () => (selected ? actualsFromLot(selected, stages, rework[selected.id] ?? {}) : {}),
    [selected, stages, rework],
  );
  const tracker = useMemo(
    () => (selected ? buildTracker(stages, actuals, baseline, start) : []),
    [selected, stages, actuals, baseline, start],
  );
  const neck = bottleneck(stages);
  const lead = programDuration(stages);
  const last = tracker[tracker.length - 1];

  function patchStage(id: number, patch: Partial<Stage>) {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function patchRework(stageId: number, delay: string) {
    if (!selected) return;
    setRework((prev) => ({
      ...prev,
      [selected.id]: { ...prev[selected.id], [stageId]: delay },
    }));
  }

  return (
    <Panel
      title="Protein Expression & Purification — Process Matrix & Time Estimator"
      tip="PERT durations, live forecast and weekly throughput for the plates on the cloning bench. The open plate advances as you assemble and register chains."
      trailing={`${selected ? `${selected.id} · stage ${selected.stageId}` : 'no plate'} · ${remaining} targets left`}
      defaultHeight={360}
    >
      <div className="tabs" role="tablist" aria-label="Expression and purification views">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'active' : ''}
            data-tip={TAB_TIP[id]}
            onClick={() => setTab(id)}
          >
            {TAB_LABEL[id]}
          </button>
        ))}
      </div>

      {tab === 'matrix' && (
        <MatrixTab stages={stages} onPatch={patchStage} neckId={neck.stage.id} occupancy={occupancy} />
      )}
      {tab === 'tracker' && selected && last && (
        <TrackerTab
          lots={lots}
          selectedId={selected.id}
          stages={stages}
          tracker={tracker}
          onRework={patchRework}
          baselineFinish={baseline[baseline.length - 1].finish}
          forecastFinish={last.forecastFinish}
          onOpenLot={(id) => dispatch({ type: 'open-queue-plate', plateId: id, mode: 'single' })}
        />
      )}
      {tab === 'capacity' && (
        <CapacityTab
          stages={stages}
          lots={lots}
          occupancy={occupancy}
          neckId={neck.stage.id}
          neckWeekly={neck.weekly}
          targets={targets}
          remaining={remaining}
          overridden={targetOverride != null}
          onTargets={setTargetOverride}
          start={start}
          lead={lead}
        />
      )}
      <div hidden={tab !== 'forecast'}>
        <ForecastTab model={forecastModel} baseline={forecastBaseline} openCapacity={forecastOpen} />
      </div>
    </Panel>
  );
}

function MatrixTab({
  stages,
  onPatch,
  neckId,
  occupancy,
}: {
  stages: Stage[];
  onPatch: (id: number, patch: Partial<Stage>) => void;
  neckId: number;
  occupancy: Record<number, number>;
}) {
  return (
    <>
      <div className="pep-scroll">
        <table className="pep-table">
          <thead>
            <tr>
              <th className="pep-sticky">ID</th>
              <th className="pep-sticky-2">Stage</th>
              <th>Actor</th>
              <th>Load</th>
              <th>Pred.</th>
              <th>Opt.</th>
              <th>Likely</th>
              <th>Pess.</th>
              <th>Expected</th>
              <th>σ</th>
              <th>Buffer</th>
              <th>Effective</th>
              <th>Batch</th>
              <th>Wk cap.</th>
              <th>Rework →</th>
              <th>P(rework)</th>
              <th>Rework cost</th>
              <th>E[delay]</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => {
              const c = computeStage(stage, stages);
              const load = occupancy[stage.id] ?? 0;
              return (
                <tr
                  key={stage.id}
                  className={stage.id === neckId ? 'pep-bottleneck' : ''}
                  data-tip={`${stage.notes}${load ? ` ${load} well${load === 1 ? '' : 's'} from the plate queue are here.` : ''}`}
                >
                  <td className="pep-sticky pep-num">{stage.id}</td>
                  <td className="pep-sticky-2 pep-name">{stage.name}</td>
                  <td className="pep-actor">{stage.actor}</td>
                  <td className={`pep-num${load ? ' pep-strong' : ''}`}>{load || '—'}</td>
                  <td className="pep-num">{stage.predecessor ?? '—'}</td>
                  <td>
                    <NumInput
                      value={stage.optimistic}
                      tip="Optimistic duration in days — blue input"
                      onChange={(n) => onPatch(stage.id, { optimistic: n ?? 0 })}
                    />
                  </td>
                  <td>
                    <NumInput
                      value={stage.mostLikely}
                      tip="Most likely duration in days — blue input"
                      onChange={(n) => onPatch(stage.id, { mostLikely: n ?? 0 })}
                    />
                  </td>
                  <td>
                    <NumInput
                      value={stage.pessimistic}
                      tip="Pessimistic duration in days — blue input"
                      onChange={(n) => onPatch(stage.id, { pessimistic: n ?? 0 })}
                    />
                  </td>
                  <td className="pep-num">{fmtDays(c.expected)}</td>
                  <td className="pep-num">{fmtDays(c.stdDev)}</td>
                  <td>
                    <NumInput
                      value={stage.buffer}
                      tip="Scheduling buffer in days, added to the PERT expected duration"
                      onChange={(n) => onPatch(stage.id, { buffer: n ?? 0 })}
                    />
                  </td>
                  <td className="pep-num pep-strong">{fmtDays(c.totalEffective)}</td>
                  <td>
                    <NumInput
                      value={stage.batchCapacity}
                      allowEmpty
                      tip="Batch capacity in units per run. Leave blank if the stage is not batch-limited."
                      onChange={(n) => onPatch(stage.id, { batchCapacity: n })}
                    />
                  </td>
                  <td className="pep-num">{fmtDays(c.weeklyCapacity, 1)}</td>
                  <td className="pep-num">{stage.reworkTarget ?? '—'}</td>
                  <td>
                    {stage.reworkProbability == null ? (
                      '—'
                    ) : (
                      <NumInput
                        value={stage.reworkProbability}
                        tip="Probability that this stage triggers a rework loop"
                        onChange={(n) => onPatch(stage.id, { reworkProbability: n ?? 0 })}
                      />
                    )}
                  </td>
                  <td className="pep-num">{c.reworkCost == null ? '—' : fmtDays(c.reworkCost)}</td>
                  <td className="pep-num">
                    {c.expectedReworkDelay == null ? '—' : fmtDays(c.expectedReworkDelay)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Load is filled wells from today’s plate queue. The open plate moves as you place parts,
        assemble constructs and register chains. Harvest / purify remains the cycle-time bottleneck.
      </p>
    </>
  );
}

function TrackerTab({
  lots,
  selectedId,
  stages,
  tracker,
  onRework,
  baselineFinish,
  forecastFinish,
  onOpenLot,
}: {
  lots: PepLot[];
  selectedId: string;
  stages: Stage[];
  tracker: ReturnType<typeof buildTracker>;
  onRework: (stageId: number, delay: string) => void;
  baselineFinish: Date;
  forecastFinish: Date;
  onOpenLot: (id: string) => void;
}) {
  const variance = (forecastFinish.getTime() - baselineFinish.getTime()) / 86_400_000;
  const selected = lots.find((lot) => lot.id === selectedId);
  const stageName = stages.find((s) => s.id === selected?.stageId)?.name ?? '—';

  return (
    <>
      <div className="pep-lot-list" role="list">
        {lots.map((lot) => {
          const stage = stages.find((s) => s.id === lot.stageId);
          const current = lot.id === selectedId;
          return (
            <button
              key={lot.id}
              type="button"
              role="listitem"
              className={`pep-lot${current ? ' current' : ''}`}
              data-tip={`${lot.barcode} · ${lot.program} · ${lot.formatLabel}. ${lot.n} wells. ${lot.note} ${current ? 'On the bench — cloning progress updates this row.' : 'Click to open this plate on the bench.'}`}
              onClick={() => onOpenLot(lot.id)}
            >
              <span className="pep-lot-id">{lot.id}</span>
              <span className="pep-lot-name">{lot.name}</span>
              <span className="pep-lot-meta">
                {lot.program} · {lot.n} wells · {lot.operator}
              </span>
              <span className="pep-lot-stage">
                {lot.stageId}. {stage ? shortName(stage.name) : '—'}
              </span>
            </button>
          );
        })}
      </div>
      <div className="pep-kpis">
        <Kpi label="On bench" value={selected?.name ?? '—'} />
        <Kpi label="Now at" value={`${selected?.stageId ?? '—'} · ${shortName(stageName)}`} />
        <Kpi label="Forecast finish" value={fmtDate(forecastFinish)} />
        <Kpi
          label="Variance vs plan"
          value={`${variance >= 0 ? '+' : ''}${fmtDays(variance)} d`}
          tone={variance > 0.05 ? 'warn' : variance < -0.05 ? 'pass' : undefined}
        />
      </div>
      <div className="pep-scroll">
        <table className="pep-table">
          <thead>
            <tr>
              <th className="pep-sticky">ID</th>
              <th className="pep-sticky-2">Stage</th>
              <th>Status</th>
              <th>Baseline start</th>
              <th>Baseline dur.</th>
              <th>Baseline finish</th>
              <th>Actual start</th>
              <th>Actual dur.</th>
              <th>Rework delay</th>
              <th>Forecast start</th>
              <th>Forecast dur.</th>
              <th>Forecast finish</th>
              <th>Variance</th>
            </tr>
          </thead>
          <tbody>
            {tracker.map((row) => (
              <tr
                key={row.stage.id}
                className={row.stage.id === selected?.stageId ? 'pep-bottleneck' : ''}
                data-tip={row.stage.notes}
              >
                <td className="pep-sticky pep-num">{row.stage.id}</td>
                <td className="pep-sticky-2 pep-name">{row.stage.name}</td>
                <td>
                  <span className={`pep-status ${row.status}`}>{STATUS_LABEL[row.status]}</span>
                </td>
                <td className="pep-date">{fmtDate(row.baselineStart)}</td>
                <td className="pep-num">{fmtDays(row.baselineDuration)}</td>
                <td className="pep-date">{fmtDate(row.baselineFinish)}</td>
                <td className="pep-date">{row.actual.start ? fmtDate(parseIsoDate(row.actual.start) ?? row.forecastStart) : '—'}</td>
                <td className="pep-num">{row.actual.duration ? fmtDays(Number(row.actual.duration)) : '—'}</td>
                <td>
                  <div className="pep-rework">
                    <NumInput
                      value={parseNumber(row.actual.reworkDelay) ?? 0}
                      tip="Extra days logged when a rework loop is caught at this stage. Shifts every later forecast."
                      onChange={(n) => onRework(row.stage.id, String(n ?? 0))}
                    />
                    {row.computed.reworkCost != null && (
                      <button
                        type="button"
                        className="btn ghost pep-apply"
                        data-tip={`Apply the pre-computed rework cost (${fmtDays(row.computed.reworkCost)} d) from the process matrix`}
                        onClick={() => onRework(row.stage.id, String(row.computed.reworkCost))}
                      >
                        Apply
                      </button>
                    )}
                  </div>
                </td>
                <td className="pep-date">{fmtDate(row.forecastStart)}</td>
                <td className="pep-num">{fmtDays(row.forecastDuration)}</td>
                <td className="pep-date">{fmtDate(row.forecastFinish)}</td>
                <td className={`pep-num${row.varianceD > 0.05 ? ' pep-late' : ''}`}>
                  {row.varianceD === 0
                    ? '0'
                    : `${row.varianceD > 0 ? '+' : ''}${fmtDays(row.varianceD)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Actuals are taken from the plate: completed stages behind the current one, the current stage
        in progress. Place a VH, choose a backbone or register a chain on the open plate to move it
        through construct request → glycerol stock.
      </p>
    </>
  );
}

function CapacityTab({
  stages,
  lots,
  occupancy,
  neckId,
  neckWeekly,
  targets,
  remaining,
  overridden,
  onTargets,
  start,
  lead,
}: {
  stages: Stage[];
  lots: PepLot[];
  occupancy: Record<number, number>;
  neckId: number;
  neckWeekly: number;
  targets: number;
  remaining: number;
  overridden: boolean;
  onTargets: (n: number | null) => void;
  start: Date;
  lead: number;
}) {
  const weeks = weeksToClear(targets, neckWeekly);
  const completion = weeks == null ? null : new Date(start.getTime() + weeks * WORK_MS);
  const maxWeekly = Math.max(...stages.map((s) => computeStage(s, stages).weeklyCapacity));
  const neck = stages.find((s) => s.id === neckId);
  const programs = new Set(lots.map((lot) => lot.program)).size;
  const atNeck = occupancy[neckId] ?? 0;

  return (
    <>
      <div className="pep-kpis">
        <label
          className="pep-kpi"
          data-tip="Filled wells still short of storage. Typed values override the queue until you clear the field."
        >
          <span>Targets planned</span>
          <input
            className="pep-input pep-targets"
            type="number"
            min={0}
            value={targets}
            onChange={(e) => {
              if (e.target.value === '') onTargets(null);
              else onTargets(Number(e.target.value));
            }}
          />
        </label>
        <Kpi label="From queue" value={`${remaining} wells · ${programs} programs`} />
        <Kpi label="Bottleneck" value={neck ? `${neck.id} · ${shortName(neck.name)}` : '—'} tone="warn" />
        <Kpi label="At bottleneck" value={`${atNeck} wells`} />
        <Kpi label="Bottleneck rate" value={`${fmtDays(neckWeekly, 1)} /wk`} />
        <Kpi label="Weeks to clear" value={weeks == null ? '—' : fmtDays(weeks, 1)} />
        <Kpi label="Est. completion" value={completion ? fmtDate(completion) : '—'} />
        <Kpi label="One-construct lead" value={`${fmtDays(lead, 1)} d`} />
      </div>
      {overridden && (
        <p className="hint" style={{ marginTop: 0 }}>
          Targets planned is an override of the {remaining} wells still in the queue.
        </p>
      )}
      <div className="pep-scroll">
        <table className="pep-table">
          <thead>
            <tr>
              <th className="pep-sticky">ID</th>
              <th className="pep-sticky-2">Stage</th>
              <th>On hand</th>
              <th>Batch</th>
              <th>Cycle (d)</th>
              <th>Weekly throughput</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => {
              const c = computeStage(stage, stages);
              const pct = maxWeekly === 0 ? 0 : (c.weeklyCapacity / maxWeekly) * 100;
              const isNeck = stage.id === neckId;
              const load = occupancy[stage.id] ?? 0;
              return (
                <tr key={stage.id} className={isNeck ? 'pep-bottleneck' : ''} data-tip={stage.notes}>
                  <td className="pep-sticky pep-num">{stage.id}</td>
                  <td className="pep-sticky-2 pep-name">{stage.name}</td>
                  <td className={`pep-num${load ? ' pep-strong' : ''}`}>{load || '—'}</td>
                  <td className="pep-num">{stage.batchCapacity ?? '—'}</td>
                  <td className="pep-num">{fmtDays(c.totalEffective)}</td>
                  <td>
                    <div className="pep-bar-cell">
                      <div className={`pep-bar${isNeck ? ' hot' : ''}`}>
                        <span style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <span className="pep-num">{fmtDays(c.weeklyCapacity, 1)}</span>
                    </div>
                  </td>
                  <td className="pep-flag">{isNeck ? '<< bottleneck' : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        On hand is the same well count as the plate queue, parked at each stage. Weekly throughput =
        batch × 7 / effective cycle time. Stages without a batch size are unconstrained, so the flag
        stays on the chromatography skid.
      </p>
    </>
  );
}

const WORK_MS = 7 * 86_400_000;

function shortName(name: string): string {
  const cut = name.indexOf('(');
  return (cut > 0 ? name.slice(0, cut) : name).trim();
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warn' | 'pass';
}) {
  return (
    <div className={`pep-kpi${tone ? ` ${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function NumInput({
  value,
  onChange,
  tip,
  allowEmpty,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  tip: string;
  allowEmpty?: boolean;
}) {
  return (
    <input
      className="pep-input"
      type="number"
      step="any"
      value={value ?? ''}
      data-tip={tip}
      onChange={(e) => {
        if (allowEmpty && e.target.value === '') onChange(null);
        else {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }
      }}
    />
  );
}
