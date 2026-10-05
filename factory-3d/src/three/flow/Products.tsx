import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BELT_TOP_Y } from '../../config/layout';
import { std } from '../machines/kit';
import { speedOf } from '../registry';
import { ORDER_IDS, PATH_LEN, pathAt, stageOf } from './path';
import { BELT_SPEED } from './Conveyors';

/** What a product looks like on each span: scale (x, y, z) and colour. */
const LOOK: { s: [number, number, number]; c: number }[] = [
  { s: [0.56, 0.34, 0.84], c: 0xc8a574 }, // sacks
  { s: [0.6, 0.22, 0.5], c: 0x6b4423 }, // roasted beans
  { s: [0.6, 0.24, 0.5], c: 0x4e3020 }, // liquor
  { s: [0.55, 0.28, 0.55], c: 0x8d8a85 }, // steel tubs
  { s: [0.55, 0.28, 0.55], c: 0x8d8a85 },
  { s: [0.55, 0.28, 0.55], c: 0x8d8a85 },
  { s: [0.55, 0.28, 0.55], c: 0x8d8a85 },
  { s: [0.7, 0.12, 0.42], c: 0x2e1a0e }, // filled moulds
  { s: [0.6, 0.11, 0.28], c: 0x3a2214 }, // bars
  { s: [0.62, 0.16, 0.32], c: 0xe3a72f }, // wrapped bars
  { s: [0.8, 0.55, 0.6], c: 0xc9a27a }, // cartons
];
const COLORS = LOOK.map((l) => new THREE.Color(l.c));

const NP = 92;
const GAP = 1.05;

/**
 * Products travel the path and queue: never closer than GAP to the one
 * ahead, never backwards, and only wrap to the start when there is room.
 */
export function Products() {
  const sim = useMemo(() => {
    const ps = new Float32Array(NP);
    for (let i = 0; i < NP; i++) ps[i] = i * (PATH_LEN / NP);
    const mesh = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 2, 0.12), std(0xffffff, 0.2, 0.35, { clearcoat: 0.6 }, true), NP);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    for (let i = 0; i < NP; i++) mesh.setColorAt(i, COLORS[0]);
    return { ps, mesh, order: Array.from({ length: NP }, (_, i) => i) };
  }, []);

  useEffect(
    () => () => {
      sim.mesh.geometry.dispose();
      (sim.mesh.material as THREE.Material).dispose();
    },
    [sim],
  );

  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), sc: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), pt: { x: 0, z: 0, ry: 0 } }),
    [],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const { ps, order, mesh } = sim;
    order.sort((a, b) => ps[b] - ps[a]);
    let minS = Infinity;
    for (let i = 0; i < NP; i++) if (ps[i] < minS) minS = ps[i];
    let ahead: number | null = null;
    for (const i of order) {
      const s = ps[i];
      const v = BELT_SPEED * speedOf(ORDER_IDS[stageOf(s)]);
      let ns = s + v * dt;
      if (ahead !== null) ns = Math.min(ns, ahead - GAP);
      if (ns < s) ns = s;
      if (ns >= PATH_LEN) {
        if (minS >= GAP) {
          ps[i] = 0;
          minS = 0; // only one product wraps per frame
          ahead = null;
          continue;
        }
        ns = PATH_LEN - 0.001;
      }
      ps[i] = ns;
      ahead = ns;
    }
    for (let i = 0; i < NP; i++) {
      const k = stageOf(ps[i]);
      const lk = LOOK[k];
      pathAt(ps[i], tmp.pt);
      tmp.q.setFromAxisAngle(tmp.up, tmp.pt.ry);
      tmp.v.set(tmp.pt.x, BELT_TOP_Y + lk.s[1] / 2, tmp.pt.z);
      tmp.sc.set(lk.s[0], lk.s[1], lk.s[2]);
      mesh.setMatrixAt(i, tmp.m.compose(tmp.v, tmp.q, tmp.sc));
      mesh.setColorAt(i, COLORS[k]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return <primitive object={sim.mesh} />;
}
