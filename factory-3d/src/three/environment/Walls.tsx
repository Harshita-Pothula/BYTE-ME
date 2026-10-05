import { std } from '../machines/kit';
import { B, C, G, RB, plane } from '../machines/helpers';
import { TEX, cloneTex } from '../core/textures';
import { useBuilt } from '../core/useBuilt';
import { mergeStatic } from '../core/mergeStatic';
import { envMats } from './materials';

const PI = Math.PI;

export function claddingMat(repeatX = 30) {
  return std(0xffffff, 0.2, 0.55, { map: cloneTex(TEX.cladding(), repeatX, 1) });
}

/** Cutaway shell: full walls at back and left, low walls at front and right. */
export function Walls() {
  const obj = useBuilt(() => {
    const g = G(null);
    const { steel } = envMats();
    const clad = claddingMat();
    const dado = std(0x5a3a26, 0.1, 0.5);
    const cap = std(0x3b2416, 0.2, 0.5);
    const glass = std(0xbfd5da, 0.2, 0.05, { transparent: true, opacity: 0.5 });
    const low = std(0xc9c1b5, 0, 0.8);

    // Back wall + left wall with brown dado.
    B(g, 60.4, 9, 0.3, clad, 0, 4.5, -22.15);
    B(g, 60.4, 1.4, 0.34, dado, 0, 0.7, -22.1);
    B(g, 0.3, 9, 48.4, clad, -30.15, 4.5, 2);
    B(g, 0.34, 1.4, 48.4, dado, -30.1, 0.7, 2);

    // Window bands.
    B(g, 56, 1.2, 0.05, glass, 0, 7.1, -21.98);
    for (let x = -28; x <= 28; x += 2.8) B(g, 0.08, 1.3, 0.1, steel, x, 7.1, -21.97);
    B(g, 56, 0.1, 0.12, steel, 0, 6.45, -21.97);
    B(g, 56, 0.1, 0.12, steel, 0, 7.75, -21.97);
    B(g, 0.05, 1.2, 44, glass, -29.98, 7.1, 2);
    for (let z = -20; z <= 24; z += 2.8) B(g, 0.1, 1.3, 0.08, steel, -29.97, 7.1, z);
    B(g, 0.12, 0.1, 44, steel, -29.97, 6.45, 2);
    B(g, 0.12, 0.1, 44, steel, -29.97, 7.75, 2);

    // ByteMe sign.
    const sign = plane(g, 10, 2.5, std(0xffffff, 0, 0.5, { map: TEX.sign() }), 0, 4.4, -21.97);
    sign.receiveShadow = true;

    // Low front wall and right wall with the dock door gap (z 6.5..13.5).
    B(g, 60.4, 0.9, 0.35, low, 0, 0.45, 26.15);
    B(g, 60.4, 0.08, 0.45, cap, 0, 0.92, 26.15);
    B(g, 0.35, 0.9, 28.5, low, 30.15, 0.45, -7.75);
    B(g, 0.45, 0.08, 28.5, cap, 30.15, 0.92, -7.75);
    B(g, 0.35, 0.9, 12.5, low, 30.15, 0.45, 19.75);
    B(g, 0.45, 0.08, 12.5, cap, 30.15, 0.92, 19.75);

    // Loading dock door.
    const rubber = std(0x1e1b19, 0, 0.8);
    for (const z of [6.5, 13.5]) {
      B(g, 0.5, 5.2, 0.5, steel, 30.2, 2.6, z);
      RB(g, 0.3, 0.5, 0.25, 0.05, rubber, 30.5, 0.7, z + (z < 10 ? 0.5 : -0.5));
    }
    B(g, 0.6, 0.6, 7.5, steel, 30.2, 5.3, 10);
    C(g, 0.42, 0.42, 7, std(0x8d8278, 0.6, 0.35), 30.2, 4.8, 10, 20).rotation.x = PI / 2;

    // Columns.
    for (let x = -30; x <= 30; x += 10) B(g, 0.4, 9, 0.4, steel, x, 4.5, -21.8);
    for (let z = -14; z <= 18; z += 8) B(g, 0.4, 9, 0.4, steel, -29.8, 4.5, z);
    mergeStatic(g);
    return g;
  });
  return <primitive object={obj} />;
}

