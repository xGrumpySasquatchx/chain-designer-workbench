import { useMemo, useState } from 'react';
import { Panel } from './Panel';
import {
  PROGRAM_START,
  STAGES,
  STATUS_LABEL,
  TAB_LABEL,
  TAB_TIP,
  bottleneck,
  buildTracker,
  chainSchedule,
  cloneStages,
  computeStage,
  emptyActuals,
  fmtDate,
  fmtDays,
  parseNumber,
  programDuration,
  programStartDate,
  weeksToClear,
  type PepTab,
  type Stage,
  type StageActual,
} from '../model/pep';

const TABS: PepTab[] = ['matrix', 'tracker', 'capacity'];

export function PepPanel() {
  const [tab, setTab] = useState<PepTab>('matrix');
  const [stages, setStages] = useState(() => cloneStages());
  const [actuals, setActuals] = useState(() => emptyActuals());
  const [targets, setTargets] = useState(12);
  const start = useMemo(() => programStartDate(PROGRAM_START), []);
  const baseline = useMemo(() => chainSchedule(STAGES, start), [start]);
  const tracker = useMemo(
    () => buildTracker(stages, actuals, baseline, start),
    [stages, actuals, baseline, start],
  );
  const neck = bottleneck(stages);
  const lead = programDuration(stages);
  const last = tracker[tracker.length - 1];
  const inProcess = tracker.filter((r) => r.status !== 'not-started').length;

  function patchStage(id: number, patch: Partial<Stage>) {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function patchActual(id: number, patch: Partial<StageActual>) {
    setActuals((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  return (
    <Panel
      title="Protein Expression & Purification — Process Matrix & Time Estimator"
      tip="PERT durations, live forecast and weekly throughput for construct request through a stored protein lot. The three tabs share one set of stage numbers."
      trailing={`${fmtDays(lead, 1)} d lead · bottleneck ${neck.stage.id}`}
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
        <MatrixTab stages={stages} onPatch={patchStage} neckId={neck.stage.id} />
      )}
      {tab === 'tracker' && (
        <TrackerTab
          tracker={tracker}
          onPatch={patchActual}
          baselineFinish={baseline[baseline.length - 1].finish}
          forecastFinish={last.forecastFinish}
          inProcess={inProcess}
        />
      )}
      {tab === 'capacity' && (
        <CapacityTab
          stages={stages}
          neckId={neck.stage.id}
          neckWeekly={neck.weekly}
          targets={targets}
          onTargets={setTargets}
          start={start}
        />
      )}
    </Panel>
  );
}

function MatrixTab({
  stages,
  onPatch,
  neckId,
}: {
  stages: Stage[];
  onPatch: (id: number, patch: Partial<Stage>) => void;
  neckId: number;
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
              return (
                <tr
                  key={stage.id}
                  className={stage.id === neckId ? 'pep-bottleneck' : ''}
                  data-tip={stage.notes}
                >
                  <td className="pep-sticky pep-num">{stage.id}</td>
                  <td className="pep-sticky-2 pep-name">{stage.name}</td>
                  <td className="pep-actor">{stage.actor}</td>
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
        Expected = (optimistic + 4 × most likely + pessimistic) / 6. Effective duration adds the
        buffer. Hover a row for the notes. Harvest / purify is the expected bottleneck — chromatography
        skid availability.
      </p>
    </>
  );
}

function TrackerTab({
  tracker,
  onPatch,
  baselineFinish,
  forecastFinish,
  inProcess,
}: {
  tracker: ReturnType<typeof buildTracker>;
  onPatch: (id: number, patch: Partial<StageActual>) => void;
  baselineFinish: Date;
  forecastFinish: Date;
  inProcess: number;
}) {
  const variance = (forecastFinish.getTime() - baselineFinish.getTime()) / 86_400_000;
  const baselineDays = tracker.reduce((sum, r) => sum + r.baselineDuration, 0);
  const forecastDays = tracker.reduce((sum, r) => sum + r.forecastDuration, 0);

  return (
    <>
      <div className="pep-kpis">
        <Kpi label="Baseline finish" value={fmtDate(baselineFinish)} />
        <Kpi label="Forecast finish" value={fmtDate(forecastFinish)} />
        <Kpi
          label="Variance"
          value={`${variance >= 0 ? '+' : ''}${fmtDays(variance)} d`}
          tone={variance > 0.05 ? 'warn' : variance < -0.05 ? 'pass' : undefined}
        />
        <Kpi label="Stages touched" value={`${inProcess} / ${tracker.length}`} />
        <Kpi label="Baseline span" value={`${fmtDays(baselineDays, 1)} d`} />
        <Kpi label="Forecast span" value={`${fmtDays(forecastDays, 1)} d`} />
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
              <tr key={row.stage.id} data-tip={row.stage.notes}>
                <td className="pep-sticky pep-num">{row.stage.id}</td>
                <td className="pep-sticky-2 pep-name">{row.stage.name}</td>
                <td>
                  <span className={`pep-status ${row.status}`}>{STATUS_LABEL[row.status]}</span>
                </td>
                <td className="pep-date">{fmtDate(row.baselineStart)}</td>
                <td className="pep-num">{fmtDays(row.baselineDuration)}</td>
                <td className="pep-date">{fmtDate(row.baselineFinish)}</td>
                <td>
                  <input
                    className="pep-input pep-date-input"
                    type="date"
                    value={row.actual.start}
                    data-tip="Actual start date. Filling this marks the stage in progress and holds the forecast at this day."
                    onChange={(e) => onPatch(row.stage.id, { start: e.target.value })}
                  />
                </td>
                <td>
                  <NumInput
                    value={parseNumber(row.actual.duration)}
                    allowEmpty
                    tip="Actual duration in days. Filling this with a start date marks the stage complete."
                    onChange={(n) =>
                      onPatch(row.stage.id, { duration: n == null ? '' : String(n) })
                    }
                  />
                </td>
                <td>
                  <div className="pep-rework">
                    <NumInput
                      value={parseNumber(row.actual.reworkDelay) ?? 0}
                      tip="Extra days logged when a rework loop is caught at this stage. Shifts every later forecast."
                      onChange={(n) => onPatch(row.stage.id, { reworkDelay: String(n ?? 0) })}
                    />
                    {row.computed.reworkCost != null && (
                      <button
                        type="button"
                        className="btn ghost pep-apply"
                        data-tip={`Apply the pre-computed rework cost (${fmtDays(row.computed.reworkCost)} d) from the process matrix`}
                        onClick={() =>
                          onPatch(row.stage.id, { reworkDelay: String(row.computed.reworkCost) })
                        }
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
                  {row.varianceD === 0 ? '0' : `${row.varianceD > 0 ? '+' : ''}${fmtDays(row.varianceD)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Baseline is frozen from the opening plan (1 Sep 2026). Forecast uses live matrix durations
        until you enter actuals. Apply copies the matrix rework cost onto the stage where the
        failure was caught.
      </p>
    </>
  );
}

function CapacityTab({
  stages,
  neckId,
  neckWeekly,
  targets,
  onTargets,
  start,
}: {
  stages: Stage[];
  neckId: number;
  neckWeekly: number;
  targets: number;
  onTargets: (n: number) => void;
  start: Date;
}) {
  const weeks = weeksToClear(targets, neckWeekly);
  const completion = weeks == null ? null : new Date(start.getTime() + weeks * WORK_MS);
  const maxWeekly = Math.max(...stages.map((s) => computeStage(s, stages).weeklyCapacity));
  const neck = stages.find((s) => s.id === neckId);

  return (
    <>
      <div className="pep-kpis">
        <label className="pep-kpi" data-tip="How many targets this quarter. Yellow input on the Capacity sheet.">
          <span>Targets planned</span>
          <input
            className="pep-input pep-targets"
            type="number"
            min={0}
            value={targets}
            onChange={(e) => onTargets(Number(e.target.value) || 0)}
          />
        </label>
        <Kpi label="Bottleneck" value={neck ? `${neck.id} · ${shortName(neck.name)}` : '—'} tone="warn" />
        <Kpi label="Bottleneck rate" value={`${fmtDays(neckWeekly, 1)} /wk`} />
        <Kpi
          label="Weeks to clear"
          value={weeks == null ? '—' : fmtDays(weeks, 1)}
        />
        <Kpi label="Est. completion" value={completion ? fmtDate(completion) : '—'} />
      </div>
      <div className="pep-scroll">
        <table className="pep-table">
          <thead>
            <tr>
              <th className="pep-sticky">ID</th>
              <th className="pep-sticky-2">Stage</th>
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
              return (
                <tr key={stage.id} className={isNeck ? 'pep-bottleneck' : ''} data-tip={stage.notes}>
                  <td className="pep-sticky pep-num">{stage.id}</td>
                  <td className="pep-sticky-2 pep-name">{stage.name}</td>
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
        Weekly throughput = batch × 7 / effective cycle time. Stages without a batch size are treated
        as unconstrained (500 /wk), so the flag lands on the chromatography skid at harvest / purify
        rather than on empty human steps.
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
