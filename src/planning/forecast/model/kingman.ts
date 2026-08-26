/**
 * Queue wait Wq = ((Ca² + Cs²) / 2) × (ρ / (1 - ρ)) × te
 * Variability, utilization, time — the lever that helps depends on which term dominates.
 */

export function waitMultiplier(rho: number): number {
  if (rho >= 1) return Number.POSITIVE_INFINITY;
  if (rho <= 0) return 0;
  return rho / (1 - rho);
}

export function kingmanWq(rho: number, te: number, ca2: number, cs2: number): number {
  if (rho >= 1) return Number.POSITIVE_INFINITY;
  return ((ca2 + cs2) / 2) * waitMultiplier(rho) * te;
}

export function departureCv2(rho: number, ca2: number, cs2: number): number {
  const r = Math.min(Math.max(rho, 0), 0.999);
  return (1 - r * r) * ca2 + r * r * cs2;
}

export function batchArrivalCv2(ca2: number, quantum: number): number {
  if (quantum <= 1) return ca2;
  return ca2 / quantum + (quantum - 1) / quantum;
}

export function clampRho(rho: number): number {
  if (rho < 0) return 0;
  if (rho >= 1) return 0.99;
  return rho;
}
