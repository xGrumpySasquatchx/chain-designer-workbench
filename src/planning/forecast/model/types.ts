export type ActorClass = 'human' | 'robot' | 'instrument' | 'in_silico' | 'vendor';

export interface Resource {
  id: string;
  name: string;
  actorClass: ActorClass;
  cyclesPerPeriod: number;
  periodDays: number;
  availability: number;
  batchQuantum: number;
  setupDays: number;
  unitDays: number;
  /** Cycle time used by the Kingman wait when the batch is full. */
  teDays: number;
  targetUtilizationCeiling: number;
  cs2: number;
  calendarId: string;
  /** Booked utilization of the current committed load. */
  seedRho: number;
}

export interface RoutingStep {
  stageIndex: number;
  stageName: string;
  resourceId: string;
  unitsPerConstruct: number;
  yieldRate: number;
  reworkProbability: number;
  reworkTargetStage: number | null;
  maxReworkPasses: number;
}

export interface RoutingTemplate {
  id: string;
  formatCode: string;
  chainCount: number;
  steps: RoutingStep[];
}

export type CommitmentHardness = 'contractual' | 'internal' | 'soft';

export type WorkStatus =
  | 'proposed'
  | 'committed'
  | 'in_flight'
  | 'complete'
  | 'declined'
  | 'deferred';

export interface WorkItem {
  id: string;
  label: string;
  formatCode: string;
  variantCount: number;
  requestedStart: string;
  dueDate: string | null;
  hardness: CommitmentHardness;
  priorityClass: number;
  status: WorkStatus;
  acceptedForecastId: string | null;
  /** When true, unused wells in already-scheduled batches absorb new units first. */
  consolidate: boolean;
}

export interface ProcessModel {
  resources: Resource[];
  templates: RoutingTemplate[];
  ca2Seed: number;
  horizonDays: number;
}

export interface StageImpact {
  stageIndex: number;
  stageName: string;
  resourceId: string;
  rhoBefore: number;
  rhoAfter: number;
  ceiling: number;
  breachesCeiling: boolean;
  waitMultiplierBefore: number;
  waitMultiplierAfter: number;
  waitDaysBefore: number;
  waitDaysAfter: number;
  deltaDays: number;
  shareOfTotalDelta: number;
  openBatchCapacity: number;
  infeasible: boolean;
  teDays: number;
  ca2: number;
  cs2: number;
  newCycles: number;
  absorbedUnits: number;
}

export interface ScheduleImpact {
  workItemId: string;
  label: string;
  hardness: CommitmentHardness;
  completionBefore: string;
  completionAfter: string;
  slipDays: number;
}

export type ForecastVerdict = 'fits_within_slack' | 'breaches_ceiling' | 'infeasible';

export type LeverKind =
  | 'batch_consolidate'
  | 'trim_scope'
  | 'defer_start'
  | 'reroute_step'
  | 'reduce_analytics'
  | 'preempt'
  | 'split_tranche';

export interface Lever {
  kind: LeverKind;
  label: string;
  detail: string;
  slackRecoveredPct: number;
  scopeCostPct: number;
  daysRecovered: number;
  efficiency: number;
  apply: () => WorkItem;
}

export interface AccuracySummary {
  windowSize: number;
  medianAbsPctError: number;
  p80CoverageRate: number;
  lastRefitAt: string;
}

export interface ImpactForecast {
  forecastId: string;
  candidate: WorkItem;
  verdict: ForecastVerdict;
  stages: StageImpact[];
  bindingStageIndex: number;
  scheduleImpacts: ScheduleImpact[];
  candidateCycleTime: { p50: number; p80: number; p95: number };
  totalQueueDaysBefore: number;
  totalQueueDaysAfter: number;
  levers: Lever[];
  modelAccuracy: AccuracySummary;
  computedAt: string;
  designedConstructs: number;
  yieldAmplification: number;
  modelDisagreement: boolean;
}

export interface DeclinedWorkRecord {
  workItem: WorkItem;
  forecastId: string;
  bindingStageIndex: number;
  reason: 'declined' | 'deferred' | 'trimmed';
  scopeReductionPct: number;
  decidedBy: string;
  decidedAt: string;
}

export type OpenCapacity = Record<number, number>;
