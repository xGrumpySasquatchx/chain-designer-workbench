export function batchCycles(
  units: number,
  quantum: number,
  openBatchCapacity: number,
): { newCycles: number; absorbedUnits: number } {
  const q = Math.max(1, quantum);
  const absorbedUnits = Math.min(Math.max(0, units), Math.max(0, openBatchCapacity));
  const spill = Math.max(0, units - absorbedUnits);
  return { newCycles: Math.ceil(spill / q), absorbedUnits };
}

export function teCycle(setupDays: number, fill: number, unitDays: number, fallbackTe: number): number {
  const te = setupDays + fill * unitDays;
  return te > 0 ? te : fallbackTe;
}
