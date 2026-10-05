import { FLOW_PATH, LAYOUT, STATION_S } from '../../config/layout';

interface Seg {
  x1: number;
  z1: number;
  dx: number;
  dz: number;
  len: number;
  s0: number;
}

export const SEGS: Seg[] = [];
let total = 0;
for (let i = 0; i < FLOW_PATH.length - 1; i++) {
  const [x1, z1] = FLOW_PATH[i],
    [x2, z2] = FLOW_PATH[i + 1];
  const len = Math.hypot(x2 - x1, z2 - z1);
  SEGS.push({ x1, z1, dx: (x2 - x1) / len, dz: (z2 - z1) / len, len, s0: total });
  total += len;
}
/** 148 m. */
export const PATH_LEN = total;

export interface PathPoint {
  x: number;
  z: number;
  ry: number;
}

/** Position and heading at distance `s` along the path. */
export function pathAt(s: number, out: PathPoint = { x: 0, z: 0, ry: 0 }): PathPoint {
  for (let i = 0; i < SEGS.length; i++) {
    const sg = SEGS[i];
    if (s <= sg.s0 + sg.len || i === SEGS.length - 1) {
      const d = Math.min(s - sg.s0, sg.len);
      out.x = sg.x1 + sg.dx * d;
      out.z = sg.z1 + sg.dz * d;
      out.ry = -Math.atan2(sg.dz, sg.dx);
      return out;
    }
  }
  return out;
}

/** Index of the span (station) a distance falls in. */
export function stageOf(s: number) {
  let k = 0;
  for (let i = 0; i < STATION_S.length; i++) if (s >= STATION_S[i]) k = i;
  return k;
}

export const ORDER_IDS = LAYOUT.map((d) => d.id);
