import { computeStageLoads } from '../engines/impact';
import type { Lever, OpenCapacity, ProcessModel, WorkItem } from '../model/types';
import { cloneWork } from '../model/work';

function fits(model: ProcessModel, baseline: WorkItem[], candidate: WorkItem, open: OpenCapacity): boolean {
  const load = computeStageLoads(model, baseline, candidate, open);
  return load.stages.every((s) => !s.infeasible && !s.breachesCeiling);
}

/** Integer binary search: largest variantCount that stays under every ceiling. */
export function solveTrimScope(
  model: ProcessModel,
  baseline: WorkItem[],
  candidate: WorkItem,
  openCapacity: OpenCapacity,
): Lever | null {
  if (candidate.variantCount <= 1) return null;
  if (fits(model, baseline, candidate, openCapacity)) return null;
  let lo = 0;
  let hi = candidate.variantCount;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const probe = { ...candidate, variantCount: mid };
    if (fits(model, baseline, probe, openCapacity)) lo = mid;
    else hi = mid - 1;
  }
  if (lo <= 0 || lo >= candidate.variantCount) return null;
  const trimmed = cloneWork(candidate);
  trimmed.variantCount = lo;
  const before = computeStageLoads(model, baseline, candidate, openCapacity);
  const after = computeStageLoads(model, baseline, trimmed, openCapacity);
  const bind = before.stages.reduce((b, s) => (s.shareOfTotalDelta > b.shareOfTotalDelta ? s : b), before.stages[0]);
  const afterBind = after.stages.find((s) => s.stageIndex === bind.stageIndex) ?? after.stages[0];
  const recovered = (bind.rhoAfter - afterBind.rhoAfter) * 100;
  const scopeCost = ((candidate.variantCount - lo) / candidate.variantCount) * 100;
  const days = Number.isFinite(before.totalQueueDaysAfter) && Number.isFinite(after.totalQueueDaysAfter)
    ? before.totalQueueDaysAfter - after.totalQueueDaysAfter
    : 0;
  return {
    kind: 'trim_scope',
    label: `Trim to ${lo} constructs`,
    detail: `Largest panel that stays under every stage ceiling. Drops ${candidate.variantCount - lo} of ${candidate.variantCount} requested outputs.`,
    slackRecoveredPct: recovered,
    scopeCostPct: scopeCost,
    daysRecovered: days,
    efficiency: recovered / Math.max(scopeCost, 0.01),
    apply: () => cloneWork(trimmed),
  };
}
