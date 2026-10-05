import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { std } from '../machines/kit';
import { B, C, G, RB, T, cylBetween, legs, mesh, pallet, plane, screen } from '../machines/helpers';
import { TEX, cloneTex } from '../core/textures';
import { useBuilt } from '../core/useBuilt';
import { mergeStatic } from '../core/mergeStatic';
import { envMats } from './materials';
import { blob } from './contactShadow';
import { registry, speedOf } from '../registry';

const PI = Math.PI;

/** HVAC, maintenance bay, energy center and dock pallet (z 18..23). Each area is a walk-through collider. */
export function SupportAreas() {
  const built = useBuilt(() => {
    const root = G(null);
    const { steel, kit } = envMats();
    const boxes: THREE.Box3[] = [];
    const fans: THREE.Object3D[] = [];
    const area = (build: (g: THREE.Group) => void) => {
      const g = G(root);
      build(g);
      g.updateMatrixWorld(true);
      boxes.push(new THREE.Box3().setFromObject(g));
    };

    // HVAC and refrigeration.
    area((g) => {
      for (const x of [-24.5, -19.5]) {
        RB(g, 3.4, 2.2, 2.6, 0.12, kit.cream, x, 1.1, 20.5);
        B(g, 3.42, 0.1, 2.62, kit.teal, x, 2.1, 20.5);
        for (let i = 0; i < 7; i++) B(g, 2.7, 0.05, 0.04, kit.frame, x, 0.45 + 0.2 * i, 21.81);
        T(g, 0.78, 0.07, kit.frame, x, 2.26, 20.5).rotation.x = PI / 2;
        const fan = G(g, x, 2.28, 20.5);
        for (let i = 0; i < 5; i++) {
          const pv = G(fan);
          pv.rotation.y = (i * PI * 2) / 5;
          B(pv, 0.62, 0.02, 0.22, kit.frame, 0.32, 0, 0).rotation.x = 0.35;
        }
        fans.push(fan);
      }
      C(g, 0.55, 0.55, 6.0, kit.steel, -22, 5.2, 19.5, 28);
    });
    blob(root, -22, 20.5, 10, 4.5);

    // Maintenance: workbench, tool cabinets, forklift.
    area((g) => {
      RB(g, 3.2, 0.1, 1.2, 0.03, kit.wood, -2, 0.9, 21.6);
      legs(g, kit, [[-3.4, 21.1], [-0.6, 21.1], [-3.4, 22.1], [-0.6, 22.1]], 0.86);
      RB(g, 0.5, 0.3, 0.4, 0.04, kit.rackBeam, -3, 1.1, 21.6);
      RB(g, 0.8, 0.2, 0.5, 0.03, kit.frame, -1.4, 1.05, 21.6);
      for (const x of [1.4, 2.8]) {
        RB(g, 1.25, 1.9, 0.6, 0.05, kit.rackBeam, x, 0.95, 22.5);
        for (let i = 0; i < 4; i++) B(g, 1.1, 0.02, 0.02, kit.frame, x, 0.5 + i * 0.38, 22.81);
      }
    });
    area((g) => {
      const fk = G(g, 5.2, 0, 19.2);
      RB(fk, 1.3, 0.8, 2.0, 0.15, kit.yellow, 0, 0.7, 0);
      RB(fk, 1.3, 0.7, 0.5, 0.1, kit.frame, 0, 0.85, 1.05);
      for (const dx of [-0.55, 0.55]) for (const dz of [-0.85, 0.65]) cylBetween(fk, [dx, 1.1, dz], [dx, 2.2, dz], 0.04, kit.frame);
      B(fk, 1.3, 0.05, 1.6, kit.frame, 0, 2.22, -0.1);
      RB(fk, 0.5, 0.5, 0.1, 0.03, kit.frame, 0, 1.4, 0.1);
      for (const dx of [-0.4, 0.4]) {
        B(fk, 0.1, 2.4, 0.1, kit.frame, dx, 1.2, -1.15);
        B(fk, 0.14, 0.05, 1.1, kit.brushed, dx, 0.15, -1.75);
      }
      for (const dx of [-0.62, 0.62]) for (const dz of [-0.65, 0.7]) C(fk, 0.3, 0.3, 0.22, kit.rubber, dx, 0.3, dz, 18).rotation.z = PI / 2;
    });
    blob(root, 1.5, 21.5, 9, 3.5);

    // Energy center: transformer, switchgear, batteries.
    const ledG = std(0x112211, 0, 0.4, { emissive: 0x3fd18a, emissiveIntensity: 2 });
    const ledA = std(0x221100, 0, 0.4, { emissive: 0xe3a72f, emissiveIntensity: 2 });
    area((g) => {
      RB(g, 2.4, 2.2, 1.9, 0.1, kit.m('tx', 0x7e8c78, 0.3, 0.5, { clearcoat: 0.4 }, true), 17.6, 1.1, 20.6);
      for (let i = 0; i < 8; i++) B(g, 0.04, 1.6, 0.5, kit.frame, 16.6 + i * 0.28, 1.1, 21.8);
      for (let i = 0; i < 3; i++) C(g, 0.08, 0.12, 0.5, kit.m('ins', 0x8c5a3a, 0, 0.4), 17 + i * 0.6, 2.45, 20.6, 12);
      for (let i = 0; i < 4; i++) {
        RB(g, 0.95, 2.3, 0.75, 0.04, kit.cream, 20.4 + i * 1.0, 1.15, 21.8);
        mesh(new THREE.SphereGeometry(0.05, 8, 6), i === 2 ? ledA : ledG, 20.4 + i * 1.0, 1.98, 21.41, g, true);
        screen(g, 20.4 + i * 1.0, 1.55, 21.425, 0.5, 0.32, PI);
      }
      for (const x of [25.6, 27.2]) {
        RB(g, 1.3, 2.0, 0.9, 0.06, kit.frame, x, 1.0, 21.0);
        for (let i = 0; i < 5; i++) B(g, 1.1, 0.03, 0.02, kit.teal, x, 0.4 + 0.35 * i, 21.46);
      }
    });
    // Mesh fence along z 18.4.
    const fenceMat = new THREE.MeshBasicMaterial({ map: cloneTex(TEX.fence(), 30, 5), transparent: true, side: THREE.DoubleSide, depthWrite: false });
    {
      const x = 21.5,
        z = 18.4,
        w = 12.6;
      plane(root, w, 2.2, fenceMat, x, 1.1, z);
      for (let i = 0; i <= 6; i++) C(root, 0.04, 0.04, 2.3, steel, x - w / 2 + (i * w) / 6, 1.15, z, 8);
      B(root, w, 0.05, 0.05, steel, x, 2.25, z);
    }
    blob(root, 21.5, 21, 13, 4);

    // Dock pallet.
    area((g) => {
      pallet(g, kit, 24.5, 0, 10, 1.9, 1.2);
      for (let i = 0; i < 2; i++) for (const dx of [-0.45, 0.45]) B(g, 0.85, 0.45, 1.0, kit.carton, 24.5 + dx, 0.4 + i * 0.46, 10);
    });
    mergeStatic(root, fans);
    return { root, boxes, fans };
  }, []);

  useEffect(() => {
    built.boxes.forEach((b) => registry.colliders.add(b));
    return () => built.boxes.forEach((b) => registry.colliders.delete(b));
  }, [built]);

  // HVAC fans follow the cooling tunnel's load.
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const cf = speedOf('cooling') * 0.8 + 0.3;
    for (const f of built.fans) f.rotation.y += 9 * cf * dt;
  });

  return <primitive object={built.root} />;
}
