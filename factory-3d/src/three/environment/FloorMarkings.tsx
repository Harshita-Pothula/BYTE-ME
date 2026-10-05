import { std } from '../machines/kit';
import { G, flat } from '../machines/helpers';
import { TEX, cloneTex } from '../core/textures';
import { useBuilt } from '../core/useBuilt';
import { mergeStatic } from '../core/mergeStatic';

/** Teal walkways with yellow edge lines, and hazard hatching. polygonOffset prevents flicker. */
export function FloorMarkings() {
  const obj = useBuilt(() => {
    const g = G(null);
    const walk = std(0x245a52, 0, 0.5, { polygonOffset: true, polygonOffsetFactor: -1, clearcoat: 0.25 }, true);
    const line = std(0xe0ae35, 0, 0.5, { polygonOffset: true, polygonOffsetFactor: -2 });
    for (const zc of [-8, 4, 16]) {
      flat(g, 57, 2.6, walk, 0, zc, 0.012);
      for (const off of [-1.42, 1.42]) flat(g, 57, 0.12, line, 0, zc + off, 0.016);
    }
    flat(g, 2.6, 46, walk, 28.2, 2, 0.013);
    for (const off of [-1.42, 1.42]) flat(g, 0.12, 46, line, 28.2 + off, 2, 0.017);

    const hatch = (w: number, d: number, x: number, z: number) =>
      flat(g, w, d, std(0xffffff, 0, 0.6, { map: cloneTex(TEX.hatch(), w / 1.2, d / 1.2), polygonOffset: true, polygonOffsetFactor: -2 }), x, z, 0.018);
    hatch(1.0, 6.6, 29.2, 10);
    hatch(8.6, 0.5, 21.4, 23.6);
    mergeStatic(g);
    return g;
  });
  return <primitive object={obj} />;
}
