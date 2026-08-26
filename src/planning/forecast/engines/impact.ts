import { batchCycles } from '../model/batching';
import { expandDemand, endToEndYield } from '../model/demandExpansion';
import { clampRho, kingmanWq, waitMultiplier } from '../model/kingman';
import { resourceById, templateFor } from '../model/ProcessModel';
import type {
  OpenCapacity,
  ProcessModel,
  StageImpact,
  WorkItem,
} from '../model/types';

const ACTIVE: WorkItem['status'][] = ['committed', 'in_flight', 'proposed'];

export function activeOutput(items: WorkItem[]): number {
  return items
    .filter((item) => ACTIVE.includes(item.status) && item.status !== 'proposed')
    .reduce((sum, item) => sum + item.variantCount, 0);
}

export function designedFor(model: ProcessModel, formatCode: string, outputCount: number): number {
  const demand = expandDemand(templateFor(model, formatCode), outputCount);
  return demand.get(1) ?? outputCount;
}

export interface StageLoad {
  stages: StageImpact[];
  totalQueueDaysBefore: number;
  totalQueueDaysAfter: number;
  designedConstructs: number;
  yieldAmplification: number;
}

/**
 * Baseline ρ is the §6 seed (the lab's current book). Candidate demand scales
 * that book by the ratio of batch-cycles after / before, so work that fits an
 * open batch does not move ρ and work that spills a quantum does.
 */
export function computeStageLoads(
  model: ProcessModel,
  baselineItems: WorkItem[],
  candidate: WorkItem,
  openCapacity: OpenCapacity,
): StageLoad {
  const template = templateFor(model, candidate.formatCode);
  const booked = Math.max(activeOutput(baselineItems), 48);
  const beforeDemand = expandDemand(template, booked);
  const afterDemand = expandDemand(template, booked + Math.max(0, candidate.variantCount));
  const y = endToEndYield(template);
  const designed = expandDemand(template, candidate.variantCount).get(1) ?? candidate.variantCount;

  const stages: StageImpact[] = [];
  let ca2 = model.ca2Seed;

  for (const step of [...template.steps].sort((a, b) => a.stageIndex - b.stageIndex)) {
    const resource = resourceById(model, step.resourceId);
    if (!resource) continue;
    const unitsBefore = beforeDemand.get(step.stageIndex) ?? 0;
    const unitsAfter = afterDemand.get(step.stageIndex) ?? 0;
    const open = candidate.consolidate ? (openCapacity[step.stageIndex] ?? 0) : 0;
    const before = batchCycles(unitsBefore, resource.batchQuantum, 0);
    const increment = Math.max(0, unitsAfter - unitsBefore);
    const added = batchCycles(increment, resource.batchQuantum, open);
    const cyclesAfter = before.newCycles + added.newCycles;
    const cycleRatio =
      before.newCycles <= 0 ? (added.newCycles > 0 ? 1 + added.newCycles : 1) : cyclesAfter / before.newCycles;
    const rhoBefore = resource.seedRho;
    const rhoRaw = rhoBefore * cycleRatio;
    const infeasible = rhoRaw >= 1;
    const rhoAfter = infeasible ? 1 : clampRho(rhoRaw);
    const te = resource.teDays;
    const cs2 = resource.cs2;
    const waitBefore = kingmanWq(rhoBefore, te, ca2, cs2);
    const waitAfter = infeasible ? Number.POSITIVE_INFINITY : kingmanWq(rhoAfter, te, ca2, cs2);
    const deltaDays = infeasible ? Number.POSITIVE_INFINITY : waitAfter - waitBefore;
    stages.push({
      stageIndex: step.stageIndex,
      stageName: step.stageName,
      resourceId: resource.id,
      rhoBefore,
      rhoAfter: infeasible ? 1 : rhoAfter,
      ceiling: resource.targetUtilizationCeiling,
      breachesCeiling: !infeasible && rhoAfter > resource.targetUtilizationCeiling + 1e-9,
      waitMultiplierBefore: waitMultiplier(rhoBefore),
      waitMultiplierAfter: infeasible ? Number.POSITIVE_INFINITY : waitMultiplier(rhoAfter),
      waitDaysBefore: waitBefore,
      waitDaysAfter: waitAfter,
      deltaDays,
      shareOfTotalDelta: 0,
      openBatchCapacity: open,
      infeasible,
      teDays: te,
      ca2,
      cs2,
      newCycles: added.newCycles,
      absorbedUnits: added.absorbedUnits,
    });
    if (!infeasible) {
      ca2 = (1 - rhoAfter * rhoAfter) * ca2 + rhoAfter * rhoAfter * cs2;
    }
  }

  const finite = stages.filter((s) => Number.isFinite(s.deltaDays) && s.deltaDays > 0);
  const totalDelta = finite.reduce((sum, s) => sum + s.deltaDays, 0);
  for (const stage of stages) {
    stage.shareOfTotalDelta = totalDelta <= 0 || !Number.isFinite(stage.deltaDays) ? 0 : stage.deltaDays / totalDelta;
  }

  const totalQueueDaysBefore = stages.reduce((sum, s) => sum + (Number.isFinite(s.waitDaysBefore) ? s.waitDaysBefore : 0), 0);
  const totalQueueDaysAfter = stages.some((s) => s.infeasible)
    ? Number.POSITIVE_INFINITY
    : stages.reduce((sum, s) => sum + s.waitDaysAfter, 0);

  return {
    stages,
    totalQueueDaysBefore,
    totalQueueDaysAfter,
    designedConstructs: designed,
    yieldAmplification: y <= 0 ? 1 : 1 / y,
  };
}

/** §6.1 fixture: uniform demand shock, VUT variability term = 1, no batching. */
export function uniformDemandShock(model: ProcessModel, factor: number): StageImpact[] {
  const template = templateFor(model, 'mAb');
  return template.steps.map((step) => {
    const resource = resourceById(model, step.resourceId)!;
    const rhoBefore = resource.seedRho;
    const rhoRaw = rhoBefore * factor;
    const infeasible = rhoRaw >= 1;
    const rhoAfter = infeasible ? 1 : rhoRaw;
    const te = resource.teDays;
    const waitBefore = kingmanWq(rhoBefore, te, 1, 1);
    const waitAfter = infeasible ? Number.POSITIVE_INFINITY : kingmanWq(rhoAfter, te, 1, 1);
    return {
      stageIndex: step.stageIndex,
      stageName: step.stageName,
      resourceId: resource.id,
      rhoBefore,
      rhoAfter,
      ceiling: resource.targetUtilizationCeiling,
      breachesCeiling: !infeasible && rhoAfter > resource.targetUtilizationCeiling,
      waitMultiplierBefore: waitMultiplier(rhoBefore),
      waitMultiplierAfter: infeasible ? Number.POSITIVE_INFINITY : waitMultiplier(rhoAfter),
      waitDaysBefore: waitBefore,
      waitDaysAfter: waitAfter,
      deltaDays: infeasible ? Number.POSITIVE_INFINITY : waitAfter - waitBefore,
      shareOfTotalDelta: 0,
      openBatchCapacity: 0,
      infeasible,
      teDays: te,
      ca2: 1,
      cs2: 1,
      newCycles: 0,
      absorbedUnits: 0,
    };
  });
}
