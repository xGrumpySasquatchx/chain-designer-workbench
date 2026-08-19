/**
 * Preset well palettes sampled from the colour-picker mock. Each row is nine
 * swatches; molecule elements take colours in plate order, wrapping if needed.
 */
export interface ColorPalette {
  id: string;
  name: string;
  colors: readonly string[];
}

export const PLATE_PALETTES: readonly ColorPalette[] = [
  {
    id: 'classic',
    name: 'Classic',
    colors: [
      '#3b76af',
      '#ef8636',
      '#529e3f',
      '#c53a32',
      '#8e69b8',
      '#85594e',
      '#d57dbf',
      '#7f7f7f',
      '#bcbd45',
    ],
  },
  {
    id: 'paired',
    name: 'Paired',
    colors: [
      '#aecde1',
      '#3c76af',
      '#bbde93',
      '#559e3f',
      '#ee9f9c',
      '#d1352b',
      '#f4c27c',
      '#ef8633',
      '#c6b3d4',
    ],
  },
  {
    id: 'muted',
    name: 'Muted',
    colors: [
      '#5878a3',
      '#e59344',
      '#d1605e',
      '#85b6b2',
      '#6b9f59',
      '#e7cb60',
      '#a77c9f',
      '#f2a2a9',
      '#967762',
    ],
  },
  {
    id: 'jewel',
    name: 'Jewel',
    colors: [
      '#312383',
      '#97caeb',
      '#61a89a',
      '#37753b',
      '#999945',
      '#dacd82',
      '#bf6c78',
      '#7d2b54',
      '#9e4b95',
    ],
  },
  {
    id: 'vibrant',
    name: 'Vibrant',
    colors: [
      '#6842a4',
      '#7ff180',
      '#ec6470',
      '#4f88db',
      '#c3e162',
      '#a945ab',
      '#67d8ab',
      '#f08d4d',
      '#5d57c4',
    ],
  },
  {
    id: 'contrast',
    name: 'High contrast',
    colors: [
      '#21171b',
      '#e6d554',
      '#59b2e3',
      '#c74826',
      '#a0fa74',
      '#4c51cc',
      '#f2a444',
      '#6edfb6',
      '#922313',
    ],
  },
];

export const DEFAULT_PALETTE_ID = 'contrast';

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
