import { makePlateWells } from './plate';
import type { QueuedPlate } from './types';

/**
 * Today's plate queue. The opening plate is the current HER2 × CD3 campaign;
 * the rest are distinct jobs the operator will cycle through without leaving
 * the bench.
 */
export function initialPlateQueue(): QueuedPlate[] {
  return [
    {
      id: 'PLT-0001',
      barcode: 'MSAB-2026-0820-A',
      name: 'HER2 × CD3 campaign',
      program: 'HER2-001',
      operator: 'C. Olsen',
      status: 'active',
      wellCount: 96,
      formatLabel: 'IgG1 bispecific',
      due: 'Now',
      note: 'Opening plate — shared light chain with row × column heavies',
      wells: makePlateWells(0, 96),
    },
    {
      id: 'PLT-0002',
      barcode: 'MSAB-2026-0820-B',
      name: 'TFR-001 screening p4',
      program: 'TFR-001',
      operator: 'C. Olsen',
      status: 'queued',
      wellCount: 96,
      formatLabel: 'mAb IgG1',
      due: '11:30',
      note: 'Primary screen plate 4 of 6 — rows A–D filled',
      wells: makePlateWells(1, 48),
    },
    {
      id: 'PLT-0003',
      barcode: 'MSAB-2026-0820-C',
      name: 'CD20 × CD3 bispecific',
      program: 'CD20-BS',
      operator: 'A. Chen',
      status: 'in-progress',
      wellCount: 96,
      formatLabel: 'IgG1 bispecific',
      due: '13:00',
      note: 'Resume after lunch — format fitness still open on row G',
      wells: makePlateWells(2, 72),
    },
    {
      id: 'PLT-0004',
      barcode: 'MSAB-2026-0820-D',
      name: 'VHH BoltzGen panel',
      program: 'VHH-BG',
      operator: 'C. Olsen',
      status: 'queued',
      wellCount: 96,
      formatLabel: 'VHH-Fc',
      due: '15:15',
      note: 'Humanization levels 1–3 across the plate',
      wells: makePlateWells(3, 96),
    },
    {
      id: 'PLT-0005',
      barcode: 'MSAB-2026-0819-Q',
      name: 'Developability QC',
      program: 'HER2-001',
      operator: 'M. Patel',
      status: 'done',
      wellCount: 96,
      formatLabel: 'IgG1 mAb',
      due: 'Done',
      note: 'Yesterday’s QC plate — SEC and intact mass signed off',
      wells: makePlateWells(4, 96),
    },
    {
      id: 'PLT-0006',
      barcode: 'MSAB-2026-0820-E',
      name: 'Humanization variants',
      program: 'TFR-001',
      operator: 'C. Olsen',
      status: 'queued',
      wellCount: 96,
      formatLabel: 'IgG1 mAb',
      due: '16:45',
      note: 'FR-graft series — first two rows only',
      wells: makePlateWells(5, 24),
    },
  ];
}

export function plateMatches(query: string, plate: QueuedPlate): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return [plate.id, plate.barcode, plate.name, plate.program, plate.operator, plate.formatLabel, plate.due, plate.note, plate.status]
    .join(' ')
    .toLowerCase()
    .includes(q);
}
