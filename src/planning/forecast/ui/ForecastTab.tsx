import { useEffect, useMemo, useState } from 'react';
import { forecastImpact } from '../engines/analytical';
import { TIPS } from '../learn';
import { FORMAT_LABEL, type FormatCode } from '../model/ProcessModel';
import type {
  DeclinedWorkRecord,
  ImpactForecast,
  Lever,
  OpenCapacity,
  ProcessModel,
  StageImpact,
  WorkItem,
} from '../model/types';
import { newCandidate } from '../workbench';

export function ForecastTab({
  model,
  baseline,
  openCapacity,
}: {
  model: ProcessModel;
  baseline: WorkItem[];
  openCapacity: OpenCapacity;
}) {
  const [draft, setDraft] = useState<WorkItem>(() => newCandidate());
  const [debounced, setDebounced] = useState(draft);
  const [accepted, setAccepted] = useState<WorkItem[]>([]);
  const [shadow, setShadow] = useState<DeclinedWorkRecord[]>([]);
  const [appliedLever, setAppliedLever] = useState<LeverKindLabel | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(draft), 150);
    return () => window.clearTimeout(handle);
  }, [draft]);

  const booked = useMemo(() => [...baseline, ...accepted], [baseline, accepted]);
  const forecast = useMemo(
    () => forecastImpact(model, booked, debounced, openCapacity),
    [model, booked, debounced, openCapacity],
  );

  function patch(partial: Partial<WorkItem>) {
    setAppliedLever(null);
    setDraft((prev) => ({ ...prev, ...partial }));
  }

  function applyLever(lever: Lever) {
    setDraft(lever.apply());
    setAppliedLever(lever.kind);
  }

  function accept() {
    if (forecast.verdict === 'infeasible') return;
    const item: WorkItem = {
      ...debounced,
      status: 'committed',
      acceptedForecastId: forecast.forecastId,
    };
    setAccepted((prev) => [...prev, item]);
    setDraft(newCandidate({ id: `PRJ-${String(Date.now()).slice(-4)}` }));
    setAppliedLever(null);
  }

  function decline(reason: DeclinedWorkRecord['reason']) {
    setShadow((prev) => [
      {
        workItem: debounced,
        forecastId: forecast.forecastId,
        bindingStageIndex: forecast.bindingStageIndex,
        reason,
        scopeReductionPct:
          reason === 'trimmed' && appliedLever === 'trim_scope'
            ? 100 - (debounced.variantCount / Math.max(draft.variantCount, 1)) * 100
            : 0,
        decidedBy: 'C. Olsen',
        decidedAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setDraft(newCandidate({ id: `PRJ-${String(Date.now()).slice(-4)}` }));
    setAppliedLever(null);
  }

  const binding = forecast.stages.find((s) => s.stageIndex === forecast.bindingStageIndex);
  const changed = [...forecast.stages]
    .filter((s) => s.deltaDays > 0.05 || s.breachesCeiling || s.infeasible)
    .sort((a, b) => b.shareOfTotalDelta - a.shareOfTotalDelta);
  const shown = changed.slice(0, 5);
  const rest = changed.length - shown.length;

  return (
    <div className="fc">
      <p className="fc-prompt" data-tip={TIPS.slack}>
        Slack preservation, not throughput. A pipeline booked to 95% has no room for failed ligations
        or low-titer preps. Preview the consequence, then accept, adjust, or decline — decline is
        recorded.
      </p>

      <CapacityRibbon stages={forecast.stages} binding={forecast.bindingStageIndex} />

      <div className="fc-propose">
        <label data-tip="Name the panel so accepted and declined rows stay traceable.">
          <span>Proposed work</span>
          <input
            className="pep-input"
            value={draft.label}
            onChange={(e) => patch({ label: e.target.value })}
          />
        </label>
        <label data-tip="Routing is keyed on format. A bispecific generates more cloning reactions and expression volume per variant than a mAb.">
          <span>Format</span>
          <select
            className="pep-input"
            value={draft.formatCode}
            onChange={(e) => patch({ formatCode: e.target.value })}
          >
            {(Object.keys(FORMAT_LABEL) as FormatCode[]).map((code) => (
              <option key={code} value={code}>
                {FORMAT_LABEL[code]}
              </option>
            ))}
          </select>
        </label>
        <label data-tip={TIPS.yield}>
          <span>Requested outputs</span>
          <input
            className="pep-input"
            type="number"
            min={1}
            value={draft.variantCount}
            onChange={(e) => patch({ variantCount: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <label data-tip="Soft commitments can be preempted. Contractual ones only slip; they are not displaced.">
          <span>Hardness</span>
          <select
            className="pep-input"
            value={draft.hardness}
            onChange={(e) => patch({ hardness: e.target.value as WorkItem['hardness'] })}
          >
            <option value="soft">Soft</option>
            <option value="internal">Internal</option>
            <option value="contractual">Contractual</option>
          </select>
        </label>
        <label data-tip="The analytical engine updates as you type (150 ms). This is not a scheduler — it does not assign days or operators.">
          <span>Start</span>
          <input
            className="pep-input"
            type="date"
            value={draft.requestedStart}
            onChange={(e) => patch({ requestedStart: e.target.value })}
          />
        </label>
      </div>

      <VerdictBanner forecast={forecast} />

      <div className="pep-kpis">
        <Kpi
          label="Designed constructs"
          value={fmt(forecast.designedConstructs, 0)}
          tip={TIPS.yield}
        />
        <Kpi
          label="Demand amplification"
          value={`${fmt(forecast.yieldAmplification, 2)}×`}
          tip={TIPS.yield}
        />
        <Kpi
          label="Queue before"
          value={`${fmt(forecast.totalQueueDaysBefore, 1)} d`}
          tip={TIPS.kingman}
        />
        <Kpi
          label="Queue after"
          value={
            Number.isFinite(forecast.totalQueueDaysAfter)
              ? `${fmt(forecast.totalQueueDaysAfter, 1)} d`
              : 'infeasible'
          }
          tip={TIPS.waitMultiplier}
          tone={forecast.verdict === 'infeasible' ? 'warn' : undefined}
        />
        <Kpi
          label="P50 cycle time"
          value={finiteDays(forecast.candidateCycleTime.p50)}
          tip="Analytical point estimate. Monte Carlo P80 / P95 sit beside it once sampled."
        />
        <Kpi
          label="P80 / P95"
          value={`${finiteDays(forecast.candidateCycleTime.p80)} / ${finiteDays(forecast.candidateCycleTime.p95)}`}
          tip="Percentiles from 500 simulated replications of stage time. Use P80 for planning conversations."
        />
      </div>

      {forecast.modelDisagreement && (
        <p className="fc-warn" data-tip="Analytical and Monte Carlo P50 differ by more than 15%. Batch spill or rework loops are doing more work than the closed form captures.">
          Model disagreement: closed-form P50 and simulated P50 have diverged. Treat the band as the
          more honest number.
        </p>
      )}

      {binding && <BindingCallout stage={binding} shockTip={TIPS.shock} />}

      <div className="fc-bars" data-tip={TIPS.rho}>
        {shown.map((stage) => (
          <StageBar key={stage.stageIndex} stage={stage} />
        ))}
        {rest > 0 && (
          <p className="hint">{rest} quieter stages collapsed — they are not the decision.</p>
        )}
      </div>

      {forecast.scheduleImpacts.length > 0 && (
        <ScheduleSlips rows={forecast.scheduleImpacts} />
      )}

      <LeverList
        levers={forecast.levers}
        applied={appliedLever}
        onApply={applyLever}
        verdict={forecast.verdict}
      />

      <div className="fc-actions">
        <button
          className="btn primary"
          disabled={forecast.verdict === 'infeasible'}
          data-tip={TIPS.accept}
          onClick={accept}
        >
          Accept work
        </button>
        <button
          className="btn"
          disabled={forecast.levers.length === 0}
          data-tip="Apply the highest-efficiency lever. Batch consolidation ranks first when open wells exist because its scope cost is zero."
          onClick={() => forecast.levers[0] && applyLever(forecast.levers[0])}
        >
          Adjust with top lever
        </button>
        <button className="btn" data-tip={TIPS.decline} onClick={() => decline('declined')}>
          Decline
        </button>
      </div>

      {accepted.length > 0 && (
        <p className="hint">
          Accepted into this session’s book: {accepted.map((item) => item.label).join(', ')}. Reload
          clears it — this is a preview, not MES.
        </p>
      )}

      <ShadowBacklog records={shadow} />

      <p className="fc-cal" data-tip={TIPS.calibrate}>
        Calibration · last {forecast.modelAccuracy.windowSize} completed items · median |error|{' '}
        {(forecast.modelAccuracy.medianAbsPctError * 100).toFixed(0)}% · P80 coverage{' '}
        {(forecast.modelAccuracy.p80CoverageRate * 100).toFixed(0)}% · refit{' '}
        {forecast.modelAccuracy.lastRefitAt}
      </p>
    </div>
  );
}

type LeverKindLabel = Lever['kind'];

function VerdictBanner({ forecast }: { forecast: ImpactForecast }) {
  const copy =
    forecast.verdict === 'fits_within_slack'
      ? 'Fits within slack. Accepting still shows any schedule slips below.'
      : forecast.verdict === 'breaches_ceiling'
        ? forecast.levers.length > 0
          ? 'Breaches a slack ceiling. Adjust is the primary action; Accept stays available.'
          : 'Breaches a slack ceiling. No reversible lever recovers the slack — decline, cut requested outputs, or accept knowing the wait. Accept stays available.'
        : 'Structurally infeasible — at least one stage is at or above 100% utilization. Accept is disabled.';
  return (
    <div className={`fc-banner ${forecast.verdict}`} data-tip={TIPS.ceiling}>
      {copy}
    </div>
  );
}

function BindingCallout({ stage, shockTip }: { stage: StageImpact; shockTip: string }) {
  const waitPct =
    stage.waitDaysBefore > 0 && Number.isFinite(stage.waitDaysAfter)
      ? ((stage.waitDaysAfter / stage.waitDaysBefore - 1) * 100).toFixed(0)
      : '—';
  return (
    <div className="fc-bind" data-tip={TIPS.binding}>
      <strong>Binding constraint · stage {stage.stageIndex} {stage.stageName}</strong>
      <span data-tip={shockTip}>
        {fmt(stage.shareOfTotalDelta * 100, 0)}% of added delay · wait {fmt(stage.waitDaysBefore, 1)} d
        → {Number.isFinite(stage.waitDaysAfter) ? `${fmt(stage.waitDaysAfter, 1)} d` : 'infeasible'} (
        {waitPct}%)
      </span>
    </div>
  );
}

function StageBar({ stage }: { stage: StageImpact }) {
  const before = Math.min(100, stage.rhoBefore * 100);
  const after = Math.min(100, stage.rhoAfter * 100);
  const ceil = stage.ceiling * 100;
  return (
    <div
      className={`fc-bar${stage.infeasible ? ' infeasible' : stage.breachesCeiling ? ' breach' : ''}`}
      data-tip={`${stage.stageName}. ρ ${pct(stage.rhoBefore)} → ${pct(stage.rhoAfter)} (ceiling ${pct(stage.ceiling)}). Wait multiplier ${fmt(stage.waitMultiplierBefore, 2)} → ${Number.isFinite(stage.waitMultiplierAfter) ? fmt(stage.waitMultiplierAfter, 2) : '∞'}. ${stage.openBatchCapacity ? `${stage.openBatchCapacity} open wells can absorb new units.` : ''} ${TIPS.kingman}`}
    >
      <span className="fc-bar-id">{stage.stageIndex}</span>
      <span className="fc-bar-name">{stage.stageName}</span>
      <div className="fc-track">
        <span className="fc-fill before" style={{ width: `${before}%` }} />
        <span className="fc-fill delta" style={{ left: `${before}%`, width: `${Math.max(0, after - before)}%` }} />
        <span className="fc-ceil" style={{ left: `${ceil}%` }} data-tip={TIPS.ceiling} />
      </div>
      <span className="fc-bar-rho">
        {pct(stage.rhoBefore)} → {stage.infeasible ? '≥100%' : pct(stage.rhoAfter)}
      </span>
    </div>
  );
}

function CapacityRibbon({ stages, binding }: { stages: StageImpact[]; binding: number }) {
  return (
    <div className="fc-ribbon" data-tip={TIPS.ribbon}>
      {stages.map((stage) => (
        <div
          key={stage.stageIndex}
          className={`fc-tick${stage.stageIndex === binding ? ' bind' : ''}${stage.breachesCeiling || stage.infeasible ? ' hot' : ''}`}
          data-tip={`${stage.stageName}: ${pct(stage.rhoAfter)} booked after this candidate, ceiling ${pct(stage.ceiling)}. ${TIPS.rho}`}
        >
          <span className="fc-tick-bar" style={{ height: `${Math.min(100, stage.rhoAfter * 100)}%` }} />
          <span className="fc-tick-ceil" style={{ bottom: `${stage.ceiling * 100}%` }} />
          <span className="fc-tick-id">{stage.stageIndex}</span>
        </div>
      ))}
    </div>
  );
}

function ScheduleSlips({
  rows,
}: {
  rows: ImpactForecast['scheduleImpacts'];
}) {
  const groups = ['contractual', 'internal', 'soft'] as const;
  return (
    <div className="fc-slips" data-tip="Slips grouped by commitment hardness. Soft work can be displaced; contractual work can only move.">
      {groups.map((hardness) => {
        const items = rows.filter((row) => row.hardness === hardness);
        if (!items.length) return null;
        return (
          <div key={hardness}>
            <p className="fc-slip-h">{hardness}</p>
            {items.map((row) => (
              <div key={row.workItemId} className="fc-slip">
                <span>{row.label}</span>
                <span>
                  {row.completionBefore} → {row.completionAfter} (
                  {Number.isFinite(row.slipDays) ? `+${fmt(row.slipDays, 1)} d` : 'blocked'})
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function LeverList({
  levers,
  applied,
  onApply,
  verdict,
}: {
  levers: Lever[];
  applied: LeverKindLabel | null;
  onApply: (lever: Lever) => void;
  verdict: ImpactForecast['verdict'];
}) {
  if (!levers.length) {
    return (
      <p className="hint">
        {verdict === 'fits_within_slack'
          ? 'No lever required — the candidate fits the slack policy.'
          : 'No reversible lever recovers slack inside this horizon. Decline, or cut scope by hand.'}
      </p>
    );
  }
  return (
    <div className="fc-levers">
      {levers.map((lever) => (
        <button
          key={lever.kind}
          type="button"
          className={`fc-lever${applied === lever.kind ? ' on' : ''}`}
          data-tip={`${lever.detail} Efficiency is slack recovered per point of scope given up. Batch consolidation is usually first because its scope cost is zero.`}
          onClick={() => onApply(lever)}
        >
          <strong>{lever.label}</strong>
          <span>{lever.detail}</span>
          <span className="fc-lever-meta">
            {fmt(lever.slackRecoveredPct, 1)} pp slack · {fmt(lever.scopeCostPct, 0)}% scope ·{' '}
            {fmt(lever.daysRecovered, 1)} d recovered
          </span>
        </button>
      ))}
    </div>
  );
}

function ShadowBacklog({ records }: { records: DeclinedWorkRecord[] }) {
  if (!records.length) {
    return (
      <p className="hint" data-tip={TIPS.decline}>
        Shadow backlog is empty. Declined or deferred panels will land here, aggregated by binding
        stage — that is the case for another AKTA or two more shaker slots.
      </p>
    );
  }
  return (
    <div className="fc-shadow" data-tip={TIPS.decline}>
      <p className="fc-slip-h">Shadow backlog</p>
      {records.map((row) => (
        <div key={`${row.forecastId}-${row.decidedAt}`} className="fc-slip">
          <span>
            {row.workItem.label} · {row.workItem.variantCount} outputs · stage {row.bindingStageIndex}
          </span>
          <span>{row.reason}</span>
        </div>
      ))}
    </div>
  );
}

function Kpi({
  label,
  value,
  tip,
  tone,
}: {
  label: string;
  value: string;
  tip: string;
  tone?: 'warn';
}) {
  return (
    <div className={`pep-kpi${tone ? ' warn' : ''}`} data-tip={tip}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function fmt(n: number, digits: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function pct(rho: number): string {
  return `${Math.round(rho * 100)}%`;
}

function finiteDays(n: number): string {
  return Number.isFinite(n) ? `${fmt(n, 1)} d` : '—';
}
