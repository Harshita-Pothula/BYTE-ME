import * as THREE from 'three';
import { useViewStore } from '../../state/viewStore';
import { basic, std } from '../machines/kit';
import { B, C, G, cylBetween, mesh } from '../machines/helpers';
import { useBuilt } from '../core/useBuilt';
import { mergeStatic } from '../core/mergeStatic';
import { envMats } from './materials';
import { claddingMat } from './Walls';

const PI = Math.PI;

/** Roof structure, closing walls and lamps. Only visible in walk-through so it never blocks the overview. */
export function IndoorGroup() {
  const walk = useViewStore((s) => s.mode === 'walk');
  const obj = useBuilt(() => {
    const g = G(null);
    const { steel } = envMats();
    // Trusses every 8 m along z.
    for (let z = -22; z <= 26; z += 8) {
      B(g, 60.4, 0.35, 0.25, steel, 0, 9.0, z);
      for (let x = -27; x <= 27; x += 6) cylBetween(g, [x, 9.0, z], [x + 3, 9.9, z], 0.05, steel);
      B(g, 60.4, 0.2, 0.2, steel, 0, 9.9, z);
    }
    for (const x of [-20, -10, 0, 10, 20]) B(g, 0.2, 0.2, 48.4, steel, x, 10.0, 2);
    for (const x of [-30, -20, -10, 0, 10, 20, 30]) B(g, 0.4, 9, 0.4, steel, x, 4.5, 26);
    for (const z of [-14, -6, 2, 10, 18]) B(g, 0.4, 9, 0.4, steel, 30, 4.5, z);
    const roof = mesh(new THREE.PlaneGeometry(61, 49), std(0x9c958b, 0.3, 0.6, { side: THREE.DoubleSide }), 0, 10.2, 2, g, true);
    roof.rotation.x = -PI / 2;
    roof.receiveShadow = true;
    // High-bay lamps.
    const lamp = basic(0xfff6e2);
    lamp.toneMapped = false;
    for (let x = -24; x <= 24; x += 8)
      for (let z = -16; z <= 22; z += 9.5) {
        C(g, 0.5, 0.7, 0.35, steel, x, 8.1, z, 20);
        mesh(new THREE.CircleGeometry(0.6, 20), lamp, x, 7.92, z, g, true).rotation.x = PI / 2;
        cylBetween(g, [x, 8.3, z], [x, 9.9, z], 0.02, steel);
      }
    B(g, 60.4, 9, 0.3, claddingMat(), 0, 4.5, 26.3);
    B(g, 0.3, 9, 48.4, claddingMat(), 30.3, 4.5, 2);
    mergeStatic(g);
    return g;
  });
  return <primitive object={obj} visible={walk} />;
}
