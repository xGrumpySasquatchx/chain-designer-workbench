/**
 * Preset well palettes. Each row is six swatches; molecule elements take
 * colours in plate order, wrapping if needed.
 */
export interface ColorPalette {
  id: string;
  name: string;
  colors: readonly string[];
}

export const PLATE_PALETTES: readonly ColorPalette[] = [
  {
    id: 'sunset-harbor',
    name: 'Sunset Harbor',
    colors: ['#DD5571', '#E99272', '#F8D377', '#62D3A4', '#3F88AE', '#193A4B'],
  },
  {
    id: 'neon-carnival',
    name: 'Neon Carnival',
    colors: ['#56BBF8', '#FADE4B', '#EF8432', '#EA336E', '#BFFD50', '#8318F5'],
  },
  {
    id: 'terracotta-tide',
    name: 'Terracotta Tide',
    colors: ['#E4786D', '#F4B6B0', '#FDF5F2', '#4695A4', '#2B5F6A', '#F6C561'],
  },
  {
    id: 'festival-market',
    name: 'Festival Market',
    colors: ['#EC6564', '#F1985B', '#F7CC59', '#98C848', '#3E80BF', '#664D8F'],
  },
  {
    id: 'forest-hiking',
    name: 'Forest Hiking',
    colors: ['#2E4552', '#509B8F', '#92B082', '#E3C677', '#E8A66C', '#D87659'],
  },
  {
    id: 'twilight-meadow',
    name: 'Twilight Meadow',
    colors: ['#6667A7', '#E38FAC', '#DA6F5F', '#EA9463', '#ECC870', '#97C191'],
  },
  {
    id: 'dusky-clay',
    name: 'Dusky Clay',
    colors: ['#3B506E', '#6A5A78', '#AA6977', '#D67272', '#DB9181', '#E1AF90'],
  },
];

export const DEFAULT_PALETTE_ID = 'sunset-harbor';

export function paletteById(id: string): ColorPalette {
  return PLATE_PALETTES.find((p) => p.id === id) ?? PLATE_PALETTES[0];
}

/** Equal pie slices, starting at 12 o'clock. */
export function wellPieBackground(colors: string[]): string {
  if (!colors.length) return 'var(--surface-1)';
  if (colors.length === 1) return colors[0];
  const step = 100 / colors.length;
  const stops = colors
    .map((color, i) => `${color} ${(i * step).toFixed(3)}% ${((i + 1) * step).toFixed(3)}%`)
    .join(', ');
  return `conic-gradient(from -90deg, ${stops})`;
}
