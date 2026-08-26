import type { RoutingTemplate } from './types';

const TOLERANCE = 0.001;
const MAX_ITERS = 20;

/** Same-stage rework: geometric series truncated at maxReworkPasses. */
export function effectiveYield(y: number, r: number, maxPasses: number, sameStage: boolean): number {
  if (y >= 1 || r <= 0 || !sameStage) return y;
  let surviving = 0;
  let remaining = 1;
  const cap = Math.max(0, maxPasses);
  for (let pass = 0; pass <= cap; pass++) {
    surviving += remaining * y;
    remaining *= (1 - y) * r;
    if (remaining < 1e-12) break;
  }
  return surviving;
}

/**
 * To deliver N_out usable constructs, stage i must start N_out / Π y_j for j ≥ i.
 * Upstream rework is resolved to a 0.1% fixed point, capped at 20 iterations.
 */
export function expandDemand(template: RoutingTemplate, outputCount: number): Map<number, number> {
  const steps = [...template.steps].sort((a, b) => a.stageIndex - b.stageIndex);
  const yEff = new Map<number, number>();
  for (const step of steps) {
    const same = step.reworkTargetStage === step.stageIndex;
    yEff.set(
      step.stageIndex,
      effectiveYield(step.yieldRate, step.reworkProbability, step.maxReworkPasses, same),
    );
  }

  function productFrom(index: number): number {
    let p = 1;
    for (const step of steps) {
      if (step.stageIndex >= index) p *= yEff.get(step.stageIndex) ?? step.yieldRate;
    }
    return p <= 0 ? Number.EPSILON : p;
  }

  const demand = new Map<number, number>();
  for (const step of steps) {
    demand.set(step.stageIndex, (outputCount / productFrom(step.stageIndex)) * step.unitsPerConstruct);
  }

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const extra = new Map<number, number>();
    for (const step of steps) {
      const n = demand.get(step.stageIndex) ?? 0;
      const y = yEff.get(step.stageIndex) ?? step.yieldRate;
      const failed = n * (1 - Math.min(y, 1));
      const reworked = failed * step.reworkProbability;
      const target = step.reworkTargetStage;
      if (target == null || target === step.stageIndex || reworked <= 0) continue;
      extra.set(target, (extra.get(target) ?? 0) + reworked);
    }
    let maxChange = 0;
    for (const [stage, add] of extra) {
      const prev = demand.get(stage) ?? 0;
      const next = prev + add;
      maxChange = Math.max(maxChange, prev === 0 ? 1 : Math.abs(next - prev) / prev);
      demand.set(stage, next);
    }
    if (maxChange < TOLERANCE) break;
  }

  return demand;
}

export function endToEndYield(template: RoutingTemplate): number {
  let p = 1;
  for (const step of template.steps) {
    const same = step.reworkTargetStage === step.stageIndex;
    p *= effectiveYield(step.yieldRate, step.reworkProbability, step.maxReworkPasses, same);
  }
  return p;
}
