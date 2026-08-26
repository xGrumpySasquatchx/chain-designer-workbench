import { computeStageLoads } from '../engines/impact';
import type { Lever, OpenCapacity, ProcessModel, WorkItem } from '../model/types';
import { addIsoDays, cloneWork } from '../model/work';

export function solveDefer(
  model: ProcessModel,
  baseline: WorkItem[],
  candidate: WorkItem,
  openCapacity: OpenCapacity,
): Lever | null {
  const load = computeStageLoads(model, baseline, candidate, openCapacity);
  if (load.stages.every((s) => !s.infeasible && !s.breachesCeiling)) return null;
  const horizon = model.horizonDays;
  for (let day = 1; day <= horizon; day++) {
    const probe = cloneWork(candidate);
    probe.requestedStart = addIsoDays(candidate.requestedStart, day);
    // Deferral is a calendar shift; occupancy troughs are represented by
    // treating later starts as consolidating into later open batches.
    probe.consolidate = true;
    const next = computeStageLoads(model, baseline, probe, openCapacity);
    if (next.stages.every((s) => !s.infeasible && !s.breachesCeiling)) {
      const bind = load.stages.reduce((b, s) => (s.shareOfTotalDelta > b.shareOfTotalDelta ? s : b), load.stages[0]);
      const after = next.stages.find((s) => s.stageIndex === bind.stageIndex) ?? next.stages[0];
      const recovered = (bind.rhoAfter - after.rhoAfter) * 100;
      return {
        kind: 'defer_start',
        label: `Defer ${day} day${day === 1 ? '' : 's'}`,
        detail: `First date inside the ${horizon}-day horizon where the candidate fits every ceiling, starting ${probe.requestedStart}.`,
        slackRecoveredPct: recovered,
        scopeCostPct: 0,
        daysRecovered: Number.isFinite(load.totalQueueDaysAfter) && Number.isFinite(next.totalQueueDaysAfter)
          ? load.totalQueueDaysAfter - next.totalQueueDaysAfter
          : 0,
        efficiency: recovered / 0.01,
        apply: () => cloneWork(probe),
      };
    }
  }
  return null;
}
