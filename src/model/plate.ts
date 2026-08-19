import { chainTarget } from './bioglyph';
import { NEUTRAL, TARGET_SLOTS } from './dpad';
import { COLORS, TARGET_COLORS } from './parts';
import type {
  ArmId,
  BenchNode,
  ChainDesign,
  FormatDesign,
  PlateWell,
  Registry,
} from './types';

export const PLATE_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export const PLATE_COLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export function wellId(row: number, col: number): string {
  return `${PLATE_ROWS[row]}${PLATE_COLS[col]}`;
}

/** Stable Luma molecule UID for a well until a real import lands. */
export function lumaUid(row: number, col: number): string {
  return `LUM-${String(row * 12 + col + 1).padStart(4, '0')}`;
}

export function parseWellId(id: string): { row: number; col: number } | null {
  const match = /^([A-H])(\d{1,2})$/.exec(id);
  if (!match) return null;
  const row = PLATE_ROWS.indexOf(match[1] as (typeof PLATE_ROWS)[number]);
  const col = PLATE_COLS.indexOf(Number(match[2]) as (typeof PLATE_COLS)[number]);
  if (row < 0 || col < 0) return null;
  return { row, col };
}

export function wellFormat(leftHeavyId: string, rightHeavyId: string): FormatDesign {
  return {
    arms: {
      left: { id: 'left', bb: 'fab', heavyChainId: leftHeavyId, lightChainId: null, fused: [] },
      right: { id: 'right', bb: 'fab', heavyChainId: rightHeavyId, lightChainId: null, fused: [] },
    },
    fc: 'none',
    formatId: null,
    moleculeId: null,
  };
}

/**
 * Row heavies are shared across a row, column heavies down a column, and the
 * universal light chain sits in every well. A1 keeps the original three chain
 * ids so the rest of the session still opens on HER2 × CD3.
 */
export const PLATE_LIGHT = 'CH-0001';
export const PLATE_ROW_CHAINS = [
  'CH-0002',
  'CH-0004',
  'CH-0005',
  'CH-0006',
  'CH-0007',
  'CH-0008',
  'CH-0009',
  'CH-0010',
] as const;
export const PLATE_COL_CHAINS = [
  'CH-0003',
  'CH-0011',
  'CH-0012',
  'CH-0013',
  'CH-0014',
  'CH-0015',
  'CH-0016',
  'CH-0017',
  'CH-0018',
  'CH-0019',
  'CH-0020',
  'CH-0021',
] as const;

export function initialPlate(): PlateWell[] {
  const wells: PlateWell[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 12; col++) {
      const left = PLATE_ROW_CHAINS[row];
      const right = PLATE_COL_CHAINS[col];
      wells.push({
        id: wellId(row, col),
        lumaUid: lumaUid(row, col),
        row,
        col,
        chainIds: [PLATE_LIGHT, left, right],
        format: wellFormat(left, right),
      });
    }
  }
  return wells;
}

export function uniqueChainIds(wells: PlateWell[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  wells.forEach((well) => {
    well.chainIds.forEach((id) => {
      if (seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    });
  });
  return ids;
}

export function benchFromChainIds(ids: string[]): BenchNode[] {
  return ids.map((id) => ({ kind: 'chain', id }));
}

/** Shift-click on a plate selects the rectangle between the two wells. */
export function wellRange(fromId: string, toId: string): string[] {
  const from = parseWellId(fromId);
  const to = parseWellId(toId);
  if (!from || !to) return [toId];
  const row0 = Math.min(from.row, to.row);
  const row1 = Math.max(from.row, to.row);
  const col0 = Math.min(from.col, to.col);
  const col1 = Math.max(from.col, to.col);
  const ids: string[] = [];
  for (let row = row0; row <= row1; row++) {
    for (let col = col0; col <= col1; col++) ids.push(wellId(row, col));
  }
  return ids;
}

export function unbindChainFromFormat(format: FormatDesign, chainId: string): FormatDesign {
  let changed = false;
  const arms = { ...format.arms };
  (['left', 'right'] as ArmId[]).forEach((armId) => {
    const arm = arms[armId];
    if (arm.heavyChainId === chainId) {
      arms[armId] = { ...arm, bb: 'empty', heavyChainId: null, lightChainId: null, fused: [] };
      changed = true;
    } else if (arm.lightChainId === chainId) {
      arms[armId] = { ...arm, lightChainId: null };
      changed = true;
    }
  });
  return changed ? { ...format, arms, formatId: null, moleculeId: null } : format;
}

export function isDefaultChainName(name: string): boolean {
  return /^New (heavy|light) chain(?: \d+)?$/.test(name);
}

export function nameFromVRegion(
  block: { name: string; target?: string } | undefined,
  kind: 'heavy' | 'light',
): string | null {
  if (!block) return null;
  if (block.target) return `anti-${block.target} ${kind}`;
  const stripped = block.name.replace(/\s+\(([^)]+)\)/, '').replace(/\s+V[HL].*$/i, '');
  return stripped ? `${stripped} ${kind}` : null;
}

export function wellCaption(
  well: PlateWell,
  chains: Record<string, ChainDesign>,
  registry: Registry,
): string {
  const targets = well.chainIds
    .map((id) => chainTarget(chains[id], registry))
    .filter((t): t is string => !!t);
  const unique = [...new Set(targets)];
  if (unique.length >= 2) return `${unique[0]} × ${unique[1]}`;
  if (unique.length === 1) return unique[0];
  return well.chainIds
    .map((id) => chains[id]?.name)
    .filter(Boolean)
    .join(' · ');
}

const COMPONENT_FALLBACK = [
  ...TARGET_SLOTS.map((slot) => slot.base),
  COLORS.payload,
  COLORS.linker,
  COLORS.tag,
  COLORS.ch2,
];

/** Default plate colour for a molecule element, before any user override. */
export function defaultComponentColor(
  chain: ChainDesign | undefined,
  registry: Registry,
): string {
  if (!chain) return NEUTRAL.base;
  if (chain.kind === 'light') return COLORS.vl;
  const target = chainTarget(chain, registry);
  if (target && TARGET_COLORS[target]) return TARGET_COLORS[target];
  const n = Number(chain.id.replace(/\D/g, '')) || 0;
  return COMPONENT_FALLBACK[n % COMPONENT_FALLBACK.length];
}

export function componentColor(
  chainId: string,
  chains: Record<string, ChainDesign>,
  registry: Registry,
  overrides: Record<string, string>,
): string {
  return overrides[chainId] ?? defaultComponentColor(chains[chainId], registry);
}

/** One colour per chain in the well, in molecule-element order. */
export function wellElementColors(
  well: PlateWell,
  chains: Record<string, ChainDesign>,
  registry: Registry,
  overrides: Record<string, string>,
): string[] {
  return well.chainIds.map((id) => componentColor(id, chains, registry, overrides));
}
