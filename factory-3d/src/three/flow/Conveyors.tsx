import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { STATION_S } from '../../config/layout';
import { std } from '../machines/kit';
import { B, C, G, RB } from '../machines/helpers';
import { TEX, cloneTex } from '../core/textures';
import { useBuilt } from '../core/useBuilt';
import { mergeStatic } from '../core/mergeStatic';
import { speedOf } from '../registry';
import { ORDER_IDS, PATH_LEN, pathAt } from './path';

const PI = Math.PI;
export const BELT_SPEED = 2.2;

/** One belt per span between stations; belt textures scroll with the upstream machine's speed. */
export function Conveyors() {
  const built = useBuilt(() => {
    const root = G(null);
    const frame = std(0xc9c7c2, 0.9, 0.3);
    const leg = std(0x8d8a85, 0.85, 0.4);
    const roller = std(0xe6e4e0, 1, 0.15);
    const edge = std(0x2d7f76, 0.2, 0.4, { clearcoat: 0.5 }, true);
    const belts: { tex: THREE.Texture; k: number }[] = [];
    for (let k = 0; k < STATION_S.length; k++) {
      const s0 = STATION_S[k],
        s1 = k + 1 < STATION_S.length ? STATION_S[k + 1] : PATH_LEN;
      const p0 = pathAt(s0 + 0.001),
        p1 = pathAt(s1 - 0.001);
      const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      const bg = G(root, (p0.x + p1.x) / 2, 0, (p0.z + p1.z) / 2);
      bg.rotation.y = -Math.atan2(p1.z - p0.z, p1.x - p0.x);
      const tex = cloneTex(TEX.belt(), (len + 1.1) / 1.2, 1);
      B(bg, len + 1.1, 0.08, 1.0, std(0xffffff, 0, 0.7, { map: tex }), 0, 1.0, 0);
      for (const z of [-0.56, 0.56]) {
        RB(bg, len + 1.1, 0.22, 0.1, 0.03, frame, 0, 0.96, z);
        B(bg, len + 1.1, 0.04, 0.1, edge, 0, 1.09, z);
      }
      for (let x = -len / 2; x <= len / 2 + 0.01; x += 2.4) {
        for (const z of [-0.5, 0.5]) {
          C(bg, 0.045, 0.045, 0.85, leg, x, 0.43, z, 10);
          C(bg, 0.1, 0.1, 0.04, leg, x, 0.02, z, 12);
        }
        B(bg, 0.06, 0.06, 1.0, leg, x, 0.3, 0);
      }
      for (const x of [-len / 2 - 0.5, len / 2 + 0.5]) C(bg, 0.07, 0.07, 1.0, roller, x, 0.98, 0, 14).rotation.x = PI / 2;
      belts.push({ tex, k });
    }
    mergeStatic(root);
    return { root, belts };
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    for (const b of built.belts) b.tex.offset.x -= (dt * BELT_SPEED * speedOf(ORDER_IDS[b.k])) / 1.2;
  });

  return <primitive object={built.root} />;
}
