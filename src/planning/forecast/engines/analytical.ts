import { computeStageLoads } from './impact';
import { analyticalCycleTime, disagrees, simulatePercentiles } from './montecarlo';
import { rankLevers } from '../levers/rank';
import { addIsoDays } from '../model/work';
import type {
  AccuracySummary,
  ImpactForecast,
  OpenCapacity,
  ProcessModel,
  ScheduleImpact,
  WorkItem,
} from '../model/types';

export const SEEDED_ACCURACY: AccuracySummary = {
  windowSize: 20,
  medianAbsPctError: 0.18,
  p80CoverageRate: 0.75,
  lastRefitAt: '2026-08-01',
};

let forecastSeq = 1;

export function forecastImpact(
  model: ProcessModel,
  baselineItems: WorkItem[],
  candidate: WorkItem,
  openCapacity: OpenCapacity,
  options?: { monteCarlo?: boolean; accuracy?: AccuracySummary },
): ImpactForecast {
  const load = computeStageLoads(model, baselineItems, candidate, openCapacity);
  const infeasible = load.stages.some((s) => s.infeasible);
  const breaches = load.stages.some((s) => s.breachesCeiling);
  const binding = load.stages.reduce((best, stage) => {
    if (stage.infeasible && !best.infeasible) return stage;
    if (stage.shareOfTotalDelta > best.shareOfTotalDelta) return stage;
    return best;
  }, load.stages[0]);

  const p50 = analyticalCycleTime(load.stages);
  const simulated = options?.monteCarlo === false ? { p50, p80: p50, p95: p50 } : simulatePercentiles(load.stages);
  const cycleTime = options?.monteCarlo === false
    ? { p50, p80: Number.isFinite(p50) ? p50 * 1.12 : p50, p95: Number.isFinite(p50) ? p50 * 1.28 : p50 }
    : simulated;

  const slip = Number.isFinite(load.totalQueueDaysAfter)
    ? load.totalQueueDaysAfter - load.totalQueueDaysBefore
    : Number.POSITIVE_INFINITY;

  const scheduleImpacts: ScheduleImpact[] = baselineItems
    .filter((item) => item.status === 'committed' || item.status === 'in_flight')
    .map((item) => {
      const start = item.requestedStart;
      const before = addIsoDays(start, load.totalQueueDaysBefore);
      const after = Number.isFinite(load.totalQueueDaysAfter)
        ? addIsoDays(start, load.totalQueueDaysAfter)
        : 'no feasible date';
      return {
        workItemId: item.id,
        label: item.label,
        hardness: item.hardness,
        completionBefore: before,
        completionAfter: after,
        slipDays: slip,
      };
    })
    .filter((row) => row.slipDays > 0.05);

  return {
    forecastId: `fc-${forecastSeq++}`,
    candidate,
    verdict: infeasible ? 'infeasible' : breaches ? 'breaches_ceiling' : 'fits_within_slack',
    stages: load.stages,
    bindingStageIndex: binding?.stageIndex ?? 10,
    scheduleImpacts,
    candidateCycleTime: cycleTime,
    totalQueueDaysBefore: load.totalQueueDaysBefore,
    totalQueueDaysAfter: load.totalQueueDaysAfter,
    levers: rankLevers(model, baselineItems, candidate, openCapacity),
    modelAccuracy: options?.accuracy ?? SEEDED_ACCURACY,
    computedAt: new Date().toISOString(),
    designedConstructs: load.designedConstructs,
    yieldAmplification: load.yieldAmplification,
    modelDisagreement: disagrees(p50, simulated.p50),
  };
}
