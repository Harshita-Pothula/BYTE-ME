import * as THREE from 'three';
import type { MachineBuilder } from './types';
import { B, C, G, RB, S, T, cabinet, cylBetween, legs, mesh, pallet, rack } from '../helpers';

const PI = Math.PI;

/* Phase 7: tempering, moulding, cooling, packaging, finished goods. */

export const tempering: MachineBuilder = (g, k, a) => {
  const tz = -2.0;
  legs(g, k, [[-0.7, tz - 0.7], [0.7, tz - 0.7], [-0.7, tz + 0.7], [0.7, tz + 0.7]], 0.7);
  C(g, 1.05, 0.4, 0.5, k.steel, 0, 0.6, tz, 40);
  C(g, 1.05, 1.05, 2.6, k.cream, 0, 2.15, tz, 48);
  for (const y of [1.1, 3.2]) T(g, 1.07, 0.05, k.brushed, 0, y, tz).rotation.x = PI / 2;
  for (let i = 0; i < 6; i++) T(g, 1.12, 0.045, k.copper, 0, 1.4 + i * 0.3, tz).rotation.x = PI / 2;
  mesh(new THREE.SphereGeometry(1.05, 40, 16, 0, PI * 2, 0, PI / 2), k.steel, 0, 3.45, tz, g);
  C(g, 0.3, 0.3, 0.5, k.teal, 0, 4.6, tz, 24);
  const fan = G(g, 0, 4.88, tz);
  B(fan, 0.9, 0.03, 0.14, k.frame, 0, 0, 0);
  B(fan, 0.14, 0.03, 0.9, k.frame, 0, 0, 0);
  a.push({ obj: fan, type: 'rotY', speed: 7 });
  // Pump with spinning rotor.
  C(g, 0.28, 0.28, 0.6, k.teal, 1.55, 0.45, -1.0, 24).rotation.z = PI / 2;
  const pr = G(g, 1.9, 0.45, -1.0);
  C(pr, 0.3, 0.3, 0.07, k.brushed, 0, 0, 0, 24).rotation.z = PI / 2;
  B(pr, 0.08, 0.5, 0.07, k.frame, 0, 0, 0);
  a.push({ obj: pr, type: 'rotX', speed: 7 });
  C(g, 0.09, 0.09, 1.1, k.steel, 0, 1.45, -0.55, 14).rotation.x = PI / 2;
  C(g, 0.09, 0.06, 0.25, k.steel, 0, 1.3, 0, 14);
  cylBetween(g, [0.9, 3.0, tz + 0.5], [1.55, 3.0, -1.0], 0.06, k.copper);
  cylBetween(g, [1.55, 3.0, -1.0], [1.55, 0.75, -1.0], 0.06, k.copper);
  cabinet(g, k, -1.95, -1.7, 1.0, 1.9, 0.55, 0);
};

export const moulding: MachineBuilder = (g, k, a) => {
  for (const z of [-0.8, 0.8]) RB(g, 6.4, 0.9, 0.4, 0.06, k.steel, 0, 0.5, z);
  legs(g, k, [[-3, -0.8], [-1, -0.8], [1, -0.8], [3, -0.8], [-3, 0.8], [-1, 0.8], [1, 0.8], [3, 0.8]], 0.1);
  // Gantry + depositor head.
  for (const z of [-1.05, 1.05]) B(g, 0.16, 2.5, 0.16, k.frame, -0.8, 1.25, z);
  RB(g, 0.4, 0.3, 2.4, 0.05, k.frame, -0.8, 2.55, 0);
  const head = G(g, -0.8, 1.98, 0);
  RB(head, 0.95, 0.62, 1.3, 0.08, k.teal, 0, 0, 0);
  for (let i = 0; i < 5; i++) C(head, 0.045, 0.02, 0.28, k.polish, 0, -0.42, -0.5 + 0.25 * i, 10);
  a.push({ obj: head, type: 'slideX', speed: 2.4, amp: 0.55 });
  // Stack of moulds.
  RB(g, 1.1, 0.7, 0.9, 0.05, k.frame, -2.6, 0.35, 1.65);
  const mould = k.m('mould', 0x9c948c, 0.5, 0.35);
  for (let i = 0; i < 6; i++) B(g, 1.0, 0.06, 0.8, mould, -2.6, 0.74 + 0.085 * i, 1.65);
  // Glass guards.
  const gx = 1.7;
  for (const z of [-0.8, 0.8]) {
    B(g, 2.6, 0.9, 0.03, k.glass, gx, 1.6, z);
    for (const y of [1.15, 2.05]) B(g, 2.64, 0.05, 0.05, k.yellow, gx, y, z);
    for (const x of [gx - 1.3, gx + 1.3]) B(g, 0.05, 0.95, 0.05, k.yellow, x, 1.6, z);
  }
  B(g, 2.6, 0.03, 1.6, k.glass, gx, 2.06, 0);
  for (const z of [-1.1, 1.1]) {
    const vb = G(g, 1.7, 0.55, z);
    C(vb, 0.2, 0.2, 0.45, k.teal, 0, 0, 0, 18).rotation.x = PI / 2;
    a.push({ obj: vb, type: 'vib' });
  }
  cabinet(g, k, 3.6, 1.0, 0.7, 1.4, 0.4, PI / 2);
};

export const cooling: MachineBuilder = (g, k, a) => {
  legs(g, k, [[-3.5, -0.95], [-1.2, -0.95], [1.2, -0.95], [3.5, -0.95], [-3.5, 0.95], [-1.2, 0.95], [1.2, 0.95], [3.5, 0.95]], 0.85);
  RB(g, 7.6, 1.6, 2.2, 0.14, k.cream, 0, 1.75, 0);
  B(g, 7.62, 0.14, 2.22, k.teal, 0, 1.15, 0);
  for (const x of [-2.6, 0, 2.6]) B(g, 0.03, 1.5, 2.24, k.frame, x, 1.75, 0);
  const win = k.m('win', 0x9fc3cb, 0.1, 0.05, { emissive: 0x8fd8e8, emissiveIntensity: 0.25 });
  for (const z of [-1.11, 1.11])
    for (const x of [-2.5, 0, 2.5]) {
      B(g, 1.4, 0.42, 0.02, win, x, 1.9, z);
      B(g, 1.48, 0.5, 0.01, k.frame, x, 1.9, z * 0.995);
    }
  // Refrigeration units with fans.
  for (const x of [-1.9, 1.9]) {
    RB(g, 2.4, 0.85, 1.8, 0.1, k.steel, x, 2.98, 0);
    T(g, 0.58, 0.05, k.frame, x, 3.42, 0).rotation.x = PI / 2;
    const fan = G(g, x, 3.42, 0);
    for (let i = 0; i < 4; i++) {
      const pv = G(fan, 0, 0, 0);
      pv.rotation.y = (i * PI) / 2;
      B(pv, 0.5, 0.02, 0.16, k.frame, 0.25, 0, 0).rotation.x = 0.3;
    }
    a.push({ obj: fan, type: 'rotY', speed: 8 });
  }
  for (const x of [-3.86, 3.86]) B(g, 0.04, 0.9, 1.3, k.rubber, x, 1.45, 0);
  cabinet(g, k, -3.0, 1.55, 0.8, 1.5, 0.4, 0);
};

export const packaging: MachineBuilder = (g, k, a) => {
  RB(g, 4.4, 1.5, 1.2, 0.1, k.steel, 0, 0.75, -1.4);
  B(g, 4.42, 0.1, 1.22, k.teal, 0, 1.52, -1.4);
  for (const x of [-1.7, 0.5]) for (const z of [-0.8, 0.8]) B(g, 0.12, 1.5, 0.12, k.frame, x, 0.75, z);
  // Infeed hood bridging the belt.
  RB(g, 2.4, 0.55, 1.75, 0.08, k.teal, -0.6, 1.78, 0);
  for (const z of [-0.86, 0.86]) {
    B(g, 2.2, 0.7, 0.02, k.glass, -0.6, 1.15, z);
    B(g, 2.24, 0.04, 0.04, k.yellow, -0.6, 0.8, z);
  }
  // Gold film reel.
  const roll = G(g, 1.2, 2.3, -1.4);
  C(roll, 0.45, 0.45, 0.9, k.gold, 0, 0, 0, 32).rotation.x = PI / 2;
  C(roll, 0.12, 0.12, 1.0, k.frame, 0, 0, 0, 12).rotation.x = PI / 2;
  a.push({ obj: roll, type: 'rotZ', speed: 2.5 });
  for (const z of [-1.95, -0.85]) B(g, 0.1, 1.0, 0.1, k.frame, 1.2, 1.85, z);
  // Industrial robot arm.
  C(g, 0.5, 0.6, 0.5, k.frame, 2.4, 0.25, 2.1, 28);
  const tur = G(g, 2.4, 0.5, 2.1);
  C(tur, 0.38, 0.38, 0.4, k.yellow, 0, 0.2, 0, 28);
  const sh = G(tur, 0, 0.45, 0);
  sh.rotation.z = -0.5;
  RB(sh, 0.3, 1.8, 0.3, 0.1, k.yellow, 0, 0.9, 0);
  S(sh, 0.22, k.frame, 0, 0, 0);
  const fo = G(sh, 0, 1.8, 0);
  fo.rotation.z = 1.7;
  S(fo, 0.19, k.frame, 0, 0, 0);
  RB(fo, 0.24, 1.35, 0.24, 0.08, k.yellow, 0, 0.68, 0);
  RB(fo, 0.5, 0.12, 0.45, 0.03, k.frame, 0, 1.38, 0);
  a.push({ obj: tur, type: 'swing', speed: 1.6, amp: 1.0 });
  pallet(g, k, 3.4, 0, -0.1, 1.2, 1.0);
  for (let i = 0; i < 3; i++) B(g, 1.0, 0.25, 0.8, k.carton, 3.4, 0.3 + i * 0.26, -0.1);
  cabinet(g, k, -1.7, 1.45, 0.8, 1.5, 0.4, 0);
};

export const finishedGoodsStorage: MachineBuilder = (g, k) => {
  rack(g, k, 7, -3.35, -2.05, k.rackBeamTeal);
  for (const y of [0, 1.66, 3.26])
    for (const x of [-2.33, 0, 2.33]) {
      pallet(g, k, x, y, -2.7);
      for (let i = 0; i < (y ? 2 : 3); i++) for (const dx of [-0.42, 0.42]) B(g, 0.8, 0.42, 0.9, k.carton, x + dx, y + 0.38 + i * 0.43, -2.7);
    }
  // Stretch-wrapped pallets.
  const film = k.m('film', 0xffffff, 0, 0.15, { transparent: true, opacity: 0.22, depthWrite: false });
  for (const x of [-1.2, 1.2]) {
    pallet(g, k, x, 0, 1.9);
    for (let i = 0; i < 3; i++) for (const dx of [-0.42, 0.42]) B(g, 0.8, 0.42, 0.9, k.carton, x + dx, 0.38 + i * 0.43, 1.9);
    B(g, 1.76, 1.32, 0.98, film, x, 0.82, 1.9);
  }
  // Pallet jack.
  const pj = G(g, 3.3, 0, 1.5);
  B(pj, 0.16, 0.06, 1.2, k.yellow, -0.2, 0.1, 0);
  B(pj, 0.16, 0.06, 1.2, k.yellow, 0.2, 0.1, 0);
  RB(pj, 0.6, 0.35, 0.3, 0.05, k.yellow, 0, 0.25, 0.65);
  cylBetween(pj, [0, 0.4, 0.7], [0, 1.2, 1.0], 0.03, k.frame);
};
