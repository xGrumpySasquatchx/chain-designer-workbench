import type { StageImpact } from '../model/types';

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleLognormal(rand: () => number, mean: number, cs2: number): number {
  if (mean <= 0) return 0;
  const sigma = Math.sqrt(Math.log(1 + Math.max(cs2, 1e-6)));
  const mu = Math.log(mean) - (sigma * sigma) / 2;
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(mu + sigma * z);
}

export function analyticalCycleTime(stages: StageImpact[]): number {
  if (stages.some((s) => s.infeasible)) return Number.POSITIVE_INFINITY;
  return stages.reduce((sum, s) => sum + s.waitDaysAfter + s.teDays, 0);
}

export function simulatePercentiles(
  stages: StageImpact[],
  reps = 500,
  seed = 2201,
): { p50: number; p80: number; p95: number } {
  const mean = analyticalCycleTime(stages);
  if (!Number.isFinite(mean)) {
    return { p50: Number.POSITIVE_INFINITY, p80: Number.POSITIVE_INFINITY, p95: Number.POSITIVE_INFINITY };
  }
  const rand = mulberry32(seed);
  const samples: number[] = [];
  for (let i = 0; i < reps; i++) {
    let ct = 0;
    for (const stage of stages) {
      ct += sampleLognormal(rand, stage.waitDaysAfter + stage.teDays, stage.cs2);
    }
    samples.push(ct);
  }
  samples.sort((a, b) => a - b);
  const at = (p: number) => samples[Math.min(samples.length - 1, Math.floor(p * (samples.length - 1)))];
  return { p50: at(0.5), p80: at(0.8), p95: at(0.95) };
}

export function disagrees(analyticalP50: number, simulatedP50: number): boolean {
  if (!Number.isFinite(analyticalP50) || !Number.isFinite(simulatedP50) || analyticalP50 <= 0) return false;
  return Math.abs(simulatedP50 - analyticalP50) / analyticalP50 > 0.15;
}
