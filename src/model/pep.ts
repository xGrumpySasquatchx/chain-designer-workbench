/**
 * Protein expression & purification process matrix. Numbers and stage list
 * come from the PERT workbook; every derived value is the same formula the
 * sheet uses so the three tabs stay in lockstep.
 */

export const PROGRAM_START = '2026-09-01';
/** Sentinel weekly capacity when a stage has no batch limit (Process Matrix col M). */
export const UNCONSTRAINED_WEEKLY = 500;
export const WORK_DAYS_PER_WEEK = 7;

export type PepTab = 'matrix' | 'tracker' | 'capacity';
export type StageStatus = 'not-started' | 'in-progress' | 'complete';

export interface Stage {
  id: number;
  name: string;
  actor: string;
  predecessor: number | null;
  optimistic: number;
  mostLikely: number;
  pessimistic: number;
  buffer: number;
  batchCapacity: number | null;
  reworkTarget: number | null;
  reworkProbability: number | null;
  notes: string;
}

export interface StageActual {
  start: string;
  duration: string;
  reworkDelay: string;
}

export interface StageComputed {
  expected: number;
  stdDev: number;
  totalEffective: number;
  weeklyCapacity: number;
  reworkCost: number | null;
  expectedReworkDelay: number | null;
}

export interface TrackerRow {
  stage: Stage;
  computed: StageComputed;
  actual: StageActual;
  status: StageStatus;
  baselineStart: Date;
  baselineDuration: number;
  baselineFinish: Date;
  forecastStart: Date;
  forecastDuration: number;
  forecastFinish: Date;
  varianceD: number;
}

export const STAGES: Stage[] = [
  {
    id: 1,
    name: 'Construct request',
    actor: 'Human',
    predecessor: null,
    optimistic: 0.5,
    mostLikely: 1,
    pessimistic: 2,
    buffer: 0.25,
    batchCapacity: null,
    reworkTarget: null,
    reworkProbability: null,
    notes: 'ELN entry; requester specifies target/construct intent.',
  },
  {
    id: 2,
    name: 'Target/gene registration (org_id, target_id, gene_id)',
    actor: 'Human',
    predecessor: 1,
    optimistic: 0.5,
    mostLikely: 1,
    pessimistic: 2,
    buffer: 0.25,
    batchCapacity: null,
    reworkTarget: null,
    reworkProbability: null,
    notes: 'Curation against existing records; assigns root identifiers.',
  },
  {
    id: 3,
    name: 'Sequence design & codon optimization',
    actor: 'in silico',
    predecessor: 2,
    optimistic: 0.5,
    mostLikely: 1,
    pessimistic: 2,
    buffer: 0.25,
    batchCapacity: null,
    reworkTarget: null,
    reworkProbability: null,
    notes: 'Codon optimization, liability screen; native vs. construct-derived sequence begin to diverge here.',
  },
  {
    id: 4,
    name: 'Primer design/gene synthesis',
    actor: 'in silico + vendor',
    predecessor: 3,
    optimistic: 1,
    mostLikely: 3,
    pessimistic: 10,
    buffer: 1,
    batchCapacity: 40,
    reworkTarget: null,
    reworkProbability: null,
    notes: 'Wide range driven by outside gene-synthesis vendor turnaround when required.',
  },
  {
    id: 5,
    name: 'PCR amplification (LIC, 96-well)',
    actor: 'Robot/automated',
    predecessor: 4,
    optimistic: 0.5,
    mostLikely: 1,
    pessimistic: 1.5,
    buffer: 0.5,
    batchCapacity: 96,
    reworkTarget: null,
    reworkProbability: null,
    notes: '96-well batch; ligation-independent cloning.',
  },
  {
    id: 6,
    name: 'Cloning (ligation/anneal into vector)',
    actor: 'Robot/automated',
    predecessor: 5,
    optimistic: 0.5,
    mostLikely: 1,
    pessimistic: 1.5,
    buffer: 0.5,
    batchCapacity: 96,
    reworkTarget: 3,
    reworkProbability: 0.05,
    notes: 'Failure here (no viable construct) sends the target back to sequence/primer design.',
  },
  {
    id: 7,
    name: 'Transformation & recovery',
    actor: 'Robot/automated',
    predecessor: 6,
    optimistic: 1,
    mostLikely: 1.5,
    pessimistic: 3,
    buffer: 0.5,
    batchCapacity: 96,
    reworkTarget: null,
    reworkProbability: null,
    notes: 'Overnight recovery is most of the range.',
  },
  {
    id: 8,
    name: 'Colony pick & selection',
    actor: 'Human',
    predecessor: 7,
    optimistic: 0.5,
    mostLikely: 1,
    pessimistic: 2,
    buffer: 0.5,
    batchCapacity: null,
    reworkTarget: null,
    reworkProbability: null,
    notes: 'Manual judgment call on colony morphology/growth.',
  },
  {
    id: 9,
    name: 'Clone confirmation (sequencing QC, clone_id fixed)',
    actor: 'Human + vendor sequencing',
    predecessor: 8,
    optimistic: 1,
    mostLikely: 2,
    pessimistic: 4,
    buffer: 1,
    batchCapacity: 96,
    reworkTarget: 8,
    reworkProbability: 0.15,
    notes: 'Identity checkpoint. A bad sequencing read sends the pick back to colony selection — the cheap rework loop.',
  },
  {
    id: 10,
    name: 'Glycerol stock (seed bank)',
    actor: 'Human',
    predecessor: 9,
    optimistic: 0.1,
    mostLikely: 0.25,
    pessimistic: 0.5,
    buffer: 0,
    batchCapacity: null,
    reworkTarget: null,
    reworkProbability: null,
    notes: 'Same-day task once a clone is confirmed.',
  },
  {
    id: 11,
    name: 'Expression screening (plate_id, 96-well)',
    actor: 'Robot/automated',
    predecessor: 10,
    optimistic: 3,
    mostLikely: 4,
    pessimistic: 6,
    buffer: 1,
    batchCapacity: 96,
    reworkTarget: null,
    reworkProbability: null,
    notes: 'Failed targets are sometimes routed to a cell-free rescue attempt rather than modeled as rework here.',
  },
  {
    id: 12,
    name: 'Scale-up production (batch_id)',
    actor: 'Robot/automated',
    predecessor: 11,
    optimistic: 5,
    mostLikely: 7,
    pessimistic: 10,
    buffer: 1.5,
    batchCapacity: 48,
    reworkTarget: 8,
    reworkProbability: 0.08,
    notes: '48-vessel parallel bioreactor. Poor titer at scale can require picking a different clone.',
  },
  {
    id: 13,
    name: 'Harvest, lyse, purify (prod_id)',
    actor: 'Robot/automated',
    predecessor: 12,
    optimistic: 5,
    mostLikely: 5,
    pessimistic: 6,
    buffer: 1.5,
    batchCapacity: 8,
    reworkTarget: null,
    reworkProbability: null,
    notes: 'Well-defined 5-day protocol, but chromatography-skid availability caps parallel throughput — expect this to be the bottleneck.',
  },
  {
    id: 14,
    name: 'QC & release (SDS-PAGE, MS, assay concordance)',
    actor: 'Human + in silico',
    predecessor: 13,
    optimistic: 2,
    mostLikely: 3,
    pessimistic: 5,
    buffer: 1,
    batchCapacity: 30,
    reworkTarget: 9,
    reworkProbability: 0.05,
    notes: 'The expensive rework loop: a construct mismatch caught here means redoing confirmation through purification.',
  },
  {
    id: 15,
    name: 'Storage (freezer_id)',
    actor: 'Robot/Human',
    predecessor: 14,
    optimistic: 0.1,
    mostLikely: 0.25,
    pessimistic: 0.5,
    buffer: 0,
    batchCapacity: null,
    reworkTarget: null,
    reworkProbability: null,
    notes: 'Same-day aliquoting and freezing.',
  },
];

export function cloneStages(stages: Stage[] = STAGES): Stage[] {
  return stages.map((s) => ({ ...s }));
}

export function emptyActuals(stages: Stage[] = STAGES): Record<number, StageActual> {
  return Object.fromEntries(
    stages.map((s) => [s.id, { start: '', duration: '', reworkDelay: '0' }]),
  );
}

export function expectedDuration(stage: Stage): number {
  return (stage.optimistic + 4 * stage.mostLikely + stage.pessimistic) / 6;
}

export function stdDev(stage: Stage): number {
  return (stage.pessimistic - stage.optimistic) / 6;
}

export function totalEffective(stage: Stage): number {
  return expectedDuration(stage) + stage.buffer;
}

export function weeklyCapacity(stage: Stage): number {
  if (stage.batchCapacity == null) return UNCONSTRAINED_WEEKLY;
  const cycle = totalEffective(stage);
  return cycle === 0 ? UNCONSTRAINED_WEEKLY : (stage.batchCapacity * WORK_DAYS_PER_WEEK) / cycle;
}

export function computeStage(stage: Stage, all: Stage[]): StageComputed {
  const byId = new Map(all.map((s) => [s.id, s]));
  let reworkCost: number | null = null;
  let expectedReworkDelay: number | null = null;
  if (stage.reworkTarget != null && stage.reworkProbability != null) {
    reworkCost = 0;
    for (const s of all) {
      if (s.id >= stage.reworkTarget && s.id <= stage.id) reworkCost += totalEffective(s);
    }
    if (!byId.has(stage.reworkTarget)) reworkCost = null;
    expectedReworkDelay = reworkCost == null ? null : reworkCost * stage.reworkProbability;
  }
  return {
    expected: expectedDuration(stage),
    stdDev: stdDev(stage),
    totalEffective: totalEffective(stage),
    weeklyCapacity: weeklyCapacity(stage),
    reworkCost,
    expectedReworkDelay,
  };
}

export function programDuration(stages: Stage[]): number {
  return stages.reduce((sum, s) => sum + totalEffective(s), 0);
}

export function bottleneck(stages: Stage[]): { stage: Stage; weekly: number } {
  const ranked = stages
    .map((s) => ({ stage: s, weekly: weeklyCapacity(s) }))
    .sort((a, b) => a.weekly - b.weekly);
  return ranked[0];
}

export function parseNumber(value: string): number | null {
  const n = Number(value);
  return value.trim() === '' || !Number.isFinite(n) ? null : n;
}

export function addDays(start: Date, days: number): Date {
  return new Date(start.getTime() + days * 86_400_000);
}

export function parseIsoDate(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function programStartDate(iso = PROGRAM_START): Date {
  return parseIsoDate(iso) ?? new Date(2026, 8, 1);
}

export function chainSchedule(stages: Stage[], start: Date): { start: Date; finish: Date; duration: number }[] {
  const out: { start: Date; finish: Date; duration: number }[] = [];
  let cursor = start;
  for (const stage of stages) {
    const duration = totalEffective(stage);
    const finish = addDays(cursor, duration);
    out.push({ start: cursor, finish, duration });
    cursor = finish;
  }
  return out;
}

export function stageStatus(actual: StageActual): StageStatus {
  if (parseNumber(actual.duration) != null && actual.start) return 'complete';
  if (actual.start) return 'in-progress';
  return 'not-started';
}

export function buildTracker(
  stages: Stage[],
  actuals: Record<number, StageActual>,
  baseline: { start: Date; finish: Date; duration: number }[],
  start: Date,
): TrackerRow[] {
  const rows: TrackerRow[] = [];
  let cursor = start;
  stages.forEach((stage, i) => {
    const computed = computeStage(stage, stages);
    const actual = actuals[stage.id] ?? { start: '', duration: '', reworkDelay: '0' };
    const status = stageStatus(actual);
    const actualStart = parseIsoDate(actual.start);
    const actualDuration = parseNumber(actual.duration);
    const delay = parseNumber(actual.reworkDelay) ?? 0;
    const forecastStart = actualStart ?? cursor;
    const forecastDuration = actualDuration ?? computed.totalEffective;
    const forecastFinish = addDays(forecastStart, forecastDuration + delay);
    rows.push({
      stage,
      computed,
      actual,
      status,
      baselineStart: baseline[i].start,
      baselineDuration: baseline[i].duration,
      baselineFinish: baseline[i].finish,
      forecastStart,
      forecastDuration,
      forecastFinish,
      varianceD: (forecastFinish.getTime() - baseline[i].finish.getTime()) / 86_400_000,
    });
    cursor = forecastFinish;
  });
  return rows;
}

export function weeksToClear(targets: number, weekly: number): number | null {
  if (weekly <= 0 || targets < 0) return null;
  return targets / weekly;
}

export function fmtDays(n: number, digits = 2): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function fmtDate(d: Date): string {
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const hours = d.getHours();
  const mins = d.getMinutes();
  if (hours === 0 && mins === 0) return date;
  return `${date} ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export const STATUS_LABEL: Record<StageStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  complete: 'Complete',
};

export const TAB_LABEL: Record<PepTab, string> = {
  matrix: 'Process Matrix',
  tracker: 'Live Tracker',
  capacity: 'Capacity',
};

export const TAB_TIP: Record<PepTab, string> = {
  matrix:
    'One row per pipeline stage. Three-point PERT durations, scheduling buffer, batch capacity and rework. Blue cells are inputs.',
  tracker:
    'One program instance. Enter actual start and duration as stages complete; forecast and variance vs baseline recompute downstream.',
  capacity:
    'Weekly throughput from batch size and cycle time. The lowest bounded stage is the bottleneck that gates how fast a queue of targets clears.',
};
