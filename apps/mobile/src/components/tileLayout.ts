export type TileDensity = 'regular' | 'compact' | 'dense';

export type TileLayoutPresetId = 'standard' | 'compact' | 'wide' | 'dense';

export interface TileLayoutPreset {
  id: TileLayoutPresetId;
  label: string;
  summary: string;
  idealTileWidth: number;
  aspectRatio: number;
  density: TileDensity;
}

export const TILE_LAYOUT_PRESETS: TileLayoutPreset[] = [
  {
    id: 'standard',
    label: 'Standard',
    summary: '3 / square',
    idealTileWidth: 120,
    aspectRatio: 1,
    density: 'regular',
  },
  {
    id: 'compact',
    label: 'Compact',
    summary: '4 / square',
    idealTileWidth: 94,
    aspectRatio: 1,
    density: 'compact',
  },
  {
    id: 'wide',
    label: 'Wide',
    summary: '4 / short',
    idealTileWidth: 92,
    aspectRatio: 1.28,
    density: 'compact',
  },
  {
    id: 'dense',
    label: 'Dense',
    summary: '5 / short',
    idealTileWidth: 74,
    aspectRatio: 1.18,
    density: 'dense',
  },
];

const PRESET_BY_ID = new Map(TILE_LAYOUT_PRESETS.map((preset) => [preset.id, preset]));

export function getTileLayoutPreset(id: TileLayoutPresetId): TileLayoutPreset {
  return PRESET_BY_ID.get(id) ?? TILE_LAYOUT_PRESETS[0];
}

export function normalizeTileLayoutPresetId(value: unknown): TileLayoutPresetId {
  return TILE_LAYOUT_PRESETS.some((preset) => preset.id === value)
    ? (value as TileLayoutPresetId)
    : 'standard';
}
