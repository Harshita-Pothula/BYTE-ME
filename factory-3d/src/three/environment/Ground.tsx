import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useViewStore } from '../../state/viewStore';
import { SCENE_COLORS } from '../../config/palette';
import { std } from '../machines/kit';
import { G, mesh } from '../machines/helpers';
import { TEX, cloneTex } from '../core/textures';
import { useBuilt } from '../core/useBuilt';

const PI = Math.PI;

/** Outside ground, concrete apron and the epoxy hall floor. */
export function Ground() {
  const dark = useViewStore((s) => s.dark);
  const groundMat = useMemo(() => std(SCENE_COLORS.light.ground, 0, 0.95), []);

  const obj = useBuilt(() => {
    const g = G(null);
    mesh(new THREE.PlaneGeometry(500, 500), groundMat, 0, -0.02, 0, g).rotation.x = -PI / 2;
    mesh(new THREE.PlaneGeometry(82, 66), std(0xb5aea4, 0, 0.9), 8, -0.01, 4, g).rotation.x = -PI / 2;
    const floorMat = std(0xa9a196, 0, 0.38, { map: cloneTex(TEX.epoxy(), 6, 5), clearcoat: 0.35, clearcoatRoughness: 0.3 }, true);
    const floor = mesh(new THREE.PlaneGeometry(60, 48), floorMat, 0, 0, 2, g);
    floor.rotation.x = -PI / 2;
    floor.castShadow = false;
    return g;
  });

  useEffect(() => {
    groundMat.color.setHex(dark ? SCENE_COLORS.dark.ground : SCENE_COLORS.light.ground);
  }, [dark, groundMat]);

  return <primitive object={obj} />;
}
