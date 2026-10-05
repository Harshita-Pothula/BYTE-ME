/** World units: 1 unit = 1 metre, Y up, north = -z. */
export const HALL = { x0: -30, x1: 30, z0: -22, z1: 26, cx: 0, cz: 2, width: 60, depth: 48 } as const;

export type MachineId =
  | 'raw_material_storage'
  | 'roaster'
  | 'grinder'
  | 'mixer'
  | 'refiner'
  | 'conche'
  | 'tempering'
  | 'moulding'
  | 'cooling'
  | 'packaging'
  | 'finished_goods_storage';

export interface LayoutEntry {
  id: MachineId;
  stage: string;
  x: number;
  z: number;
  /** Rotated 180 degrees around Y so it faces the right-to-left flow of the middle row. */
  flip?: boolean;
}

export const LAYOUT: LayoutEntry[] = [
  { id: 'raw_material_storage', stage: 'Raw materials', x: -21, z: -14 },
  { id: 'roaster', stage: 'Roasting', x: -7, z: -14 },
  { id: 'grinder', stage: 'Grinding', x: 7, z: -14 },
  { id: 'mixer', stage: 'Mixing', x: 21, z: -14 },
  { id: 'refiner', stage: 'Refining', x: 21, z: -2, flip: true },
  { id: 'conche', stage: 'Conching', x: 7, z: -2, flip: true },
  { id: 'tempering', stage: 'Tempering', x: -7, z: -2, flip: true },
  { id: 'moulding', stage: 'Moulding', x: -21, z: -2, flip: true },
  { id: 'cooling', stage: 'Cooling', x: -21, z: 10 },
  { id: 'packaging', stage: 'Packaging', x: -7, z: 10 },
  { id: 'finished_goods_storage', stage: 'Finished goods', x: 7, z: 10 },
];

export const LAYOUT_BY_ID = Object.fromEntries(LAYOUT.map((d, i) => [d.id, { ...d, index: i }])) as Record<
  MachineId,
  LayoutEntry & { index: number }
>;

/** Conveyor belt top in machine-local space; the belt runs along local X at z = 0. */
export const BELT_TOP_Y = 1.04;

/** Product path (x, z). Total length 148. */
export const FLOW_PATH: [number, number][] = [
  [-21, -14],
  [21, -14],
  [21, -2],
  [-21, -2],
  [-21, 10],
  [19, 10],
];

/** Distance along FLOW_PATH of each station, in LAYOUT order. */
export const STATION_S = [0, 14, 28, 42, 54, 68, 82, 96, 108, 122, 136];

/** Infrastructure labels (no status dot). */
export const INFRA_LABELS: { key: string; text: string; pos: [number, number, number] }[] = [
  { key: 'hvac', text: 'HVAC and refrigeration', pos: [-22, 4.6, 20.5] },
  { key: 'maint', text: 'Maintenance', pos: [1, 3.6, 21] },
  { key: 'energy', text: 'Energy center', pos: [21, 3.8, 21.2] },
  { key: 'solar', text: 'Solar array', pos: [46, 5.6, -9] },
  { key: 'dock', text: 'Loading dock', pos: [25, 3.4, 10] },
  { key: 'grid', text: 'Grid supply', pos: [14, 9.4, 34.5] },
];
