/**
 * Preset well palettes. Each row is nine swatches; molecule elements take
 * colours in plate order, wrapping if needed.
 */
export interface ColorPalette {
  id: string;
  name: string;
  colors: readonly string[];
}

export const PLATE_PALETTES: readonly ColorPalette[] = [
  {
    id: 'magenta-dream',
    name: 'Magenta Dream',
    colors: [
      '#B7094C',
      '#A01A58',
      '#892B64',
      '#723C70',
      '#5C4D7D',
      '#455E89',
      '#2E6F95',
      '#1780A1',
      '#0091AD',
    ],
  },
  {
    id: 'golden-sunrise',
    name: 'Golden Sunrise Escape',
    colors: [
      '#F7CA45',
      '#E99E47',
      '#DD7261',
      '#9D5E5C',
      '#5D4A59',
      '#56757F',
      '#58A1A4',
      '#8BB96B',
      '#C5D149',
    ],
  },
  {
    id: 'forest-hiking',
    name: 'Forest Hiking Adventure',
    colors: [
      '#2E4552',
      '#3E7171',
      '#509B8F',
      '#92B082',
      '#E3C677',
      '#E6B672',
      '#E8A66C',
      '#E18E63',
      '#D87659',
    ],
  },
  {
    id: 'ocean-blue',
    name: 'Ocean Blue Serenity',
    colors: [
      '#03045E',
      '#023E8A',
      '#0077B6',
      '#0096C7',
      '#00B4D8',
      '#48CAE4',
      '#90E0EF',
      '#ADE8F4',
      '#CAF0F8',
    ],
  },
  {
    id: 'earthy-boho',
    name: 'Earthy Boho Delight',
    colors: [
      '#7A7D65',
      '#9B9B7E',
      '#D2B098',
      '#E0C6A3',
      '#EEDDAD',
      '#F7CD79',
      '#C68F67',
      '#AE8668',
      '#947C69',
    ],
  },
  {
    id: 'dreamy-pastel',
    name: 'Dreamy Pastel Clouds',
    colors: [
      '#ACDBFC',
      '#A8C6FA',
      '#C5B7FA',
      '#D3BCFA',
      '#E1C1FB',
      '#F0C6FC',
      '#F7D0FC',
      '#F9DBFD',
      '#FFD9FF',
    ],
  },
];

export const DEFAULT_PALETTE_ID = 'magenta-dream';

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
