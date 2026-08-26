import { computeStageLoads } from '../engines/impact';
import type { Lever, OpenCapacity, ProcessModel, WorkItem } from '../model/types';
import { cloneWork } from '../model/work';

export function solveBatchConsolidate(
  model: ProcessModel,
  baseline: WorkItem[],
  candidate: WorkItem,
  openCapacity: OpenCapacity,
): Lever | null {
  if (candidate.consolidate) return null;
  const closed = computeStageLoads(model, baseline, { ...candidate, consolidate: false }, openCapacity);
  const open = computeStageLoads(model, baseline, { ...candidate, consolidate: true }, openCapacity);
  const binding = closed.stages.reduce((best, s) => (s.shareOfTotalDelta > best.shareOfTotalDelta ? s : best), closed.stages[0]);
  const after = open.stages.find((s) => s.stageIndex === binding.stageIndex) ?? open.stages[0];
  const recovered = (binding.rhoAfter - after.rhoAfter) * 100;
  const openWells = Object.values(openCapacity).reduce((sum, n) => sum + n, 0);
  if (openWells <= 0 && recovered <= 0.05) return null;
  const days = Number.isFinite(closed.totalQueueDaysAfter) && Number.isFinite(open.totalQueueDaysAfter)
    ? closed.totalQueueDaysAfter - open.totalQueueDaysAfter
    : 0;
  const next = cloneWork(candidate);
  next.consolidate = true;
  return {
    kind: 'batch_consolidate',
    label: 'Fill open batches first',
    detail: `${openWells} unused well${openWells === 1 ? '' : 's'} already scheduled. Merging into them adds no plate cycle at those stages.`,
    slackRecoveredPct: recovered,
    scopeCostPct: 0,
    daysRecovered: days,
    efficiency: recovered / 0.01,
    apply: () => cloneWork(next),
  };
}
