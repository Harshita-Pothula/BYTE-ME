import * as THREE from 'three';
import { std } from '../machines/kit';
import { B, C, G, RB, mesh, plane } from '../machines/helpers';
import { TEX } from '../core/textures';
import { useBuilt } from '../core/useBuilt';
import { mergeStatic } from '../core/mergeStatic';
import { envMats } from './materials';
import { blob } from './contactShadow';

const PI = Math.PI;

const TREES: [number, number][] = [
  [-38, -18], [-38, -4], [-38, 10], [-38, 24], [-24, 34], [-8, 34], [30, 36], [62, -14],
  [62, 8], [62, 22], [48, 30], [-20, -30], [0, -30], [20, -30], [40, -28],
];

/** Delivery truck, grid pole, trees and the solar canopy. */
export function Outside() {
  const obj = useBuilt(() => {
    const g = G(null);
    const { steel, kit } = envMats();

    // Delivery truck at the dock.
    const white = std(0xefebe4, 0.2, 0.4, { clearcoat: 0.6 }, true);
    RB(g, 10.5, 3.3, 2.7, 0.12, white, 37.2, 2.3, 10);
    B(g, 10.52, 0.35, 2.72, std(0x5a3a26, 0.1, 0.4), 37.2, 1.25, 10);
    plane(g, 6, 1.5, std(0xffffff, 0, 0.5, { map: TEX.sign() }), 37.2, 2.6, 11.37);
    RB(g, 2.6, 2.7, 2.6, 0.25, std(0x1e6e68, 0.3, 0.3, { clearcoat: 0.8 }, true), 43.8, 1.95, 10);
    B(g, 0.05, 1.0, 2.1, std(0x2a3238, 0.5, 0.1), 45.12, 2.6, 10);
    const tyre = std(0x1e1b19, 0, 0.8);
    for (const x of [33.5, 35, 41.5, 44]) for (const z of [8.75, 11.25]) C(g, 0.5, 0.5, 0.38, tyre, x, 0.5, z, 20).rotation.x = PI / 2;
    blob(g, 39.5, 10, 14, 4.2);

    // Grid pole.
    C(g, 0.16, 0.2, 8.6, std(0x6e5038, 0, 0.9), 14, 4.3, 34.5, 12);
    B(g, 2.4, 0.15, 0.15, steel, 14, 8.0, 34.5);
    C(g, 0.4, 0.4, 0.9, std(0x7e8c78, 0.3, 0.5), 14.5, 6.9, 34.5, 16);

    // Low-poly trees.
    const leafA = std(0x55704a, 0, 0.85, { flatShading: true });
    const leafB = std(0x6b8455, 0, 0.85, { flatShading: true });
    const bark = std(0x5a4130, 0, 0.9);
    TREES.forEach(([x, z], i) => {
      C(g, 0.18, 0.26, 2.2, bark, x, 1.1, z, 8);
      const s = 1.4 + (i % 3) * 0.35;
      mesh(new THREE.IcosahedronGeometry(1.6 * s, 0), i % 2 ? leafA : leafB, x, 2.9 + s, z, g);
      mesh(new THREE.IcosahedronGeometry(1.1 * s, 0), i % 2 ? leafB : leafA, x + 0.5, 4.1 + s * 1.3, z - 0.3, g);
      blob(g, x, z, 5 * s, 5 * s);
    });

    // Solar canopy: 45 instanced panels, 5 rows x 9.
    const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(1.95, 0.06, 3.3), std(0xffffff, 0.5, 0.2, { map: TEX.solarPanel() }), 45);
    panels.castShadow = panels.receiveShadow = true;
    const m4 = new THREE.Matrix4(),
      q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.28, 0, 0)),
      one = new THREE.Vector3(1, 1, 1);
    let n = 0;
    for (let r = 0; r < 5; r++) {
      const z = -19 + r * 4.3;
      for (let c = 0; c < 9; c++) panels.setMatrixAt(n++, m4.compose(new THREE.Vector3(38 + c * 2.05, 3.1, z), q, one));
      for (const x of [37.5, 46, 54.6]) {
        C(g, 0.07, 0.07, 2.6, kit.brushed, x, 1.3, z + 0.9, 10);
        C(g, 0.07, 0.07, 3.5, kit.brushed, x, 1.75, z - 0.9, 10);
        C(g, 0.2, 0.2, 0.1, steel, x, 0.05, z + 0.9, 10);
        C(g, 0.2, 0.2, 0.1, steel, x, 0.05, z - 0.9, 10);
      }
      B(g, 18.4, 0.1, 0.1, kit.brushed, 46.2, 2.85, z);
    }
    panels.computeBoundingSphere();
    g.add(panels);
    mergeStatic(g);
    return g;
  });
  return <primitive object={obj} />;
}
