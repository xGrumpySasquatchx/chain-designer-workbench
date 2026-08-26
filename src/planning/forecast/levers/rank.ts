import type { Lever, OpenCapacity, ProcessModel, WorkItem } from '../model/types';
import { solveBatchConsolidate } from './solveBatchConsolidate';
import { solveDefer } from './solveDefer';
import { solveTrimScope } from './solveTrimScope';

export function rankLevers(
  model: ProcessModel,
  baseline: WorkItem[],
  candidate: WorkItem,
  openCapacity: OpenCapacity,
): Lever[] {
  const levers = [
    solveBatchConsolidate(model, baseline, candidate, openCapacity),
    solveTrimScope(model, baseline, candidate, openCapacity),
    solveDefer(model, baseline, candidate, openCapacity),
  ].filter((lever): lever is Lever => lever != null);
  return levers.sort((a, b) => b.efficiency - a.efficiency);
}
