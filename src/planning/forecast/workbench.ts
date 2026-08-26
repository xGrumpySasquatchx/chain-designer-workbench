import type { PepLot } from '../../model/pep';
import type { FormatCode } from './model/ProcessModel';
import type { OpenCapacity, ProcessModel, WorkItem } from './model/types';

export function formatFromLabel(label: string): FormatCode {
  const text = label.toLowerCase();
  if (text.includes('adc')) return 'ADC';
  if (text.includes('tri')) return 'triAb';
  if (text.includes('bispecific') || text.includes('kih')) return 'bsAb_kih';
  return 'mAb';
}

export function workItemsFromLots(lots: PepLot[]): WorkItem[] {
  return lots
    .map((lot) => {
      const status: WorkItem['status'] =
        lot.stageId >= 15 ? 'complete' : lot.stageId > 1 ? 'in_flight' : 'committed';
      return {
        id: lot.id,
        label: lot.name,
        formatCode: formatFromLabel(lot.formatLabel),
        variantCount: Math.max(1, lot.n),
        requestedStart: lot.started,
        dueDate: null,
        hardness: (lot.program === 'HER2-001' ? 'internal' : 'soft') as WorkItem['hardness'],
        priorityClass: lot.stageId >= 11 ? 1 : 3,
        status,
        acceptedForecastId: null,
        consolidate: false,
      };
    })
    .filter((item) => item.status !== 'complete');
}

export function openCapacityFromOccupancy(
  occupancy: Record<number, number>,
  model: ProcessModel,
): OpenCapacity {
  const open: OpenCapacity = {};
  for (const resource of model.resources) {
    const stage = Number(resource.id.replace('res-', ''));
    const load = occupancy[stage] ?? 0;
    const quantum = resource.batchQuantum;
    open[stage] = load <= 0 ? 0 : (quantum - (load % quantum)) % quantum;
  }
  return open;
}

export function newCandidate(partial?: Partial<WorkItem>): WorkItem {
  return {
    id: `PRJ-${String(Date.now()).slice(-4)}`,
    label: 'New panel',
    formatCode: 'bsAb_kih',
    variantCount: 24,
    requestedStart: new Date().toISOString().slice(0, 10),
    dueDate: null,
    hardness: 'soft',
    priorityClass: 4,
    status: 'proposed',
    acceptedForecastId: null,
    consolidate: false,
    ...partial,
  };
}
