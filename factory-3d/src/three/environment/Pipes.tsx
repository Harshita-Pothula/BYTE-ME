import * as THREE from 'three';
import { std } from '../machines/kit';
import { B, C, G, S, cylBetween, type V3 } from '../machines/helpers';
import { useBuilt } from '../core/useBuilt';
import { mergeStatic } from '../core/mergeStatic';
import { envMats } from './materials';

const UP = new THREE.Vector3(0, 1, 0);

/** Overhead pipe racks (chocolate, water, steam), drops to machines and coolant runs. Always visible. */
export function Pipes() {
  const obj = useBuilt(() => {
    const g = G(null);
    const { steel, kit } = envMats();
    const mats = {
      choc: std(0x6b4423, 0.5, 0.35, { clearcoat: 0.6 }, true),
      water: std(0x2d7f76, 0.3, 0.35, { clearcoat: 0.6 }, true),
      steam: std(0xdad8d3, 0.9, 0.28),
      cool: std(0x7fb3c0, 0.3, 0.35, { clearcoat: 0.6 }, true),
    };
    const run = (pts: V3[], r: number, mat: THREE.Material) => {
      for (let i = 0; i < pts.length - 1; i++) {
        cylBetween(g, pts[i], pts[i + 1], r, mat, 16);
        if (i) S(g, r * 1.02, mat, ...pts[i]);
        const a = new THREE.Vector3(...pts[i]),
          b = new THREE.Vector3(...pts[i + 1]);
        const len = a.distanceTo(b);
        const dir = b.clone().sub(a).normalize();
        for (let s = 3; s < len - 1; s += 6) {
          const p = a.clone().lerp(b, s / len);
          C(g, r * 1.5, r * 1.5, 0.07, kit.brushed, p.x, p.y, p.z, 16).quaternion.setFromUnitVectors(UP, dir);
        }
      }
    };
    for (const zr of [-9.4, 2.4]) {
      run([[-28, 7.4, zr], [28, 7.4, zr]], 0.15, mats.choc);
      run([[-28, 7.4, zr + 0.5], [28, 7.4, zr + 0.5]], 0.12, mats.water);
      run([[-28, 7.4, zr - 0.5], [28, 7.4, zr - 0.5]], 0.18, mats.steam);
      for (let x = -24; x <= 24; x += 8) {
        B(g, 0.08, 0.08, 1.6, steel, x, 7.15, zr);
        cylBetween(g, [x, 7.15, zr - 0.8], [x, 9.0, zr - 0.8], 0.03, steel);
        cylBetween(g, [x, 7.15, zr + 0.8], [x, 9.0, zr + 0.8], 0.03, steel);
      }
    }
    run([[21, 7.4, -9.4], [21, 7.4, -16.35], [21, 4.9, -16.35]], 0.12, mats.choc);
    run([[7, 7.4, 2.4], [7, 7.4, 0.2], [7, 2.6, 0.2]], 0.12, mats.choc);
    run([[-7, 7.4, 2.9], [-7, 7.4, 0], [-7, 3.6, 0]], 0.1, mats.water);
    run([[-19.1, 2.2, 19.4], [-19.1, 6.4, 19.4], [-19.1, 6.4, 10], [-19.1, 3.4, 10]], 0.13, mats.cool);
    run([[-22.9, 2.2, 19.4], [-22.9, 6.6, 19.4], [-22.9, 6.6, 10], [-22.9, 3.4, 10]], 0.13, mats.cool);
    mergeStatic(g);
    return g;
  });
  return <primitive object={obj} />;
}
