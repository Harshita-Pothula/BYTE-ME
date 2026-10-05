import type { MachineBuilder } from './types';
import { SHARED } from '../kit';
import { B, C, G, RB, T, cabinet, cylBetween, flange, legs, pallet, rack, railing, sack, screen, stairs } from '../helpers';

const PI = Math.PI;

/* Phase 6: raw storage, roaster, grinder, mixer, refiner, conche. */

export const rawMaterialStorage: MachineBuilder = (g, k, a) => {
  rack(g, k, 7, -3.35, -2.05, k.rackBeam);
  for (const y of [0, 1.66, 3.26])
    for (const x of [-2.33, 0, 2.33]) {
      pallet(g, k, x, y, -2.7);
      for (const dx of [-0.6, 0, 0.6]) sack(g, k, x + dx, y + 0.17, -2.7);
      if (y === 0) for (const dx of [-0.3, 0.3]) sack(g, k, x + dx, y + 0.51, -2.7);
    }
  // Tipping station over the belt.
  legs(g, k, [[-2.75, -0.75], [-1.25, -0.75], [-2.75, 0.75], [-1.25, 0.75]], 1.65);
  const hop = C(g, 1.05, 0.32, 1.1, k.steel, -2, 2.2, 0, 4);
  hop.rotation.y = PI / 4;
  a.push({ obj: hop, type: 'vib' });
  B(g, 1.5, 0.05, 1.5, k.grate, -2, 2.77, 0).rotation.y = PI / 4;
  const screw = G(g, -2, 1.5, 0);
  C(screw, 0.14, 0.14, 1.2, k.brushed, 0, 0, 0, 12).rotation.z = PI / 2;
  a.push({ obj: screw, type: 'rotX', speed: 5 });
  RB(g, 1.6, 0.9, 1.0, 0.05, k.steel, -2, 0.45, 1.45);
  pallet(g, k, 1.4, 0, 1.6);
  for (const dx of [-0.55, 0.55]) for (const dz of [-0.25, 0.25]) sack(g, k, 1.4 + dx, 0.17, 1.6 + dz * 0.1);
  cabinet(g, k, -3.4, 1.2, 0.8, 1.5, 0.4, 0);
};

export const roaster: MachineBuilder = (g, k, a) => {
  for (const x of [-1.85, 1.85]) {
    for (const z of [-0.98, 0.98]) RB(g, 0.5, 1.5, 0.64, 0.08, k.brown, x, 0.75, z);
    RB(g, 0.5, 1.5, 2.6, 0.12, k.brown, x, 2.25, 0);
    C(g, 0.42, 0.42, 0.54, k.brass, x, 2.25, 0, 32).rotation.z = PI / 2;
  }
  const drum = G(g, 0, 2.25, 0);
  C(drum, 1.02, 1.02, 3.2, k.brushed, 0, 0, 0, 40).rotation.z = PI / 2;
  for (const x of [-1.2, -0.4, 0.4, 1.2]) T(drum, 1.04, 0.05, k.brass, x, 0, 0).rotation.y = PI / 2;
  a.push({ obj: drum, type: 'rotX', speed: 1.4 });
  RB(g, 3.9, 0.14, 1.2, 0.05, k.brown, 0, 3.32, 0);
  C(g, 0.2, 0.2, 0.45, k.brass, 0, 3.6, 0);
  C(g, 0.8, 0.22, 0.9, k.steel, 0, 4.25, 0, 4).rotation.y = PI / 4;
  // Chaff cyclone + exhaust stack.
  C(g, 0.5, 0.5, 1.3, k.steel, -3.0, 3.3, -1.7, 28);
  C(g, 0.5, 0.1, 0.9, k.steel, -3.0, 2.2, -1.7, 28);
  legs(g, k, [[-3.4, -2.1], [-2.6, -2.1], [-3.4, -1.3], [-2.6, -1.3]], 2.0);
  C(g, 0.22, 0.22, 4.2, k.brushed, -3.0, 6.1, -1.7, 16);
  C(g, 0.36, 0.22, 0.3, k.frame, -3.0, 8.3, -1.7, 16);
  cylBetween(g, [-1.0, 3.2, -0.6], [-2.55, 3.6, -1.7], 0.2, k.brushed, 16);
  // Cooling tray with stirring arms.
  for (const [lx, lz] of [[0.4, 1.6], [1.8, 1.6], [0.4, 3.0], [1.8, 3.0]]) C(g, 0.06, 0.06, 0.82, k.steel, lx, 0.41, lz, 10);
  C(g, 1.12, 1.12, 0.3, k.steel, 1.1, 0.97, 2.3, 40);
  C(g, 1.05, 1.05, 0.04, k.m('bean', 0x5a3a26, 0, 0.85), 1.1, 1.1, 2.3, 40);
  T(g, 1.12, 0.04, k.brass, 1.1, 1.12, 2.3).rotation.x = PI / 2;
  const arms = G(g, 1.1, 1.18, 2.3);
  B(arms, 2.1, 0.06, 0.1, k.frame, 0, 0, 0);
  B(arms, 0.1, 0.06, 2.1, k.frame, 0, 0, 0);
  C(arms, 0.06, 0.06, 0.7, k.frame, 0, 0.35, 0, 8);
  a.push({ obj: arms, type: 'rotY', speed: 1.7 });
  cabinet(g, k, 2.95, 1.3, 1.0, 1.8, 0.5, 0);
};

export const grinder: MachineBuilder = (g, k, a) => {
  for (const x of [-1.15, 1.15]) for (const z of [-0.98, 0.98]) RB(g, 0.3, 1.5, 0.64, 0.06, k.steel, x, 0.75, z);
  const body = G(g, 0, 0, 0);
  a.push({ obj: body, type: 'vib' });
  RB(body, 2.6, 1.2, 2.3, 0.12, k.steel, 0, 2.1, 0);
  B(body, 2.62, 0.08, 2.32, k.teal, 0, 2.72, 0);
  C(body, 1.0, 1.0, 1.0, k.teal, 0, 3.3, 0, 40);
  C(body, 1.06, 1.06, 0.1, k.brushed, 0, 2.82, 0, 40);
  C(body, 1.06, 1.06, 0.1, k.brushed, 0, 3.82, 0, 40);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * PI * 2;
    B(body, 0.08, 0.9, 0.08, k.brushed, Math.cos(ang) * 1.03, 3.3, Math.sin(ang) * 1.03);
  }
  C(body, 0.25, 0.25, 0.5, k.steel, 0, 4.1, 0, 20);
  C(body, 0.85, 0.25, 0.9, k.steel, 0, 4.75, 0, 32);
  C(g, 0.45, 0.45, 1.1, k.teal, -1.95, 2.1, -0.45, 28).rotation.z = PI / 2;
  for (let i = 0; i < 6; i++) T(g, 0.46, 0.025, k.brushed, -2.3 + i * 0.14, 2.1, -0.45).rotation.y = PI / 2;
  RB(g, 0.9, 0.3, 0.9, 0.04, k.frame, -1.95, 1.5, -0.45);
  RB(g, 0.7, 0.5, 0.6, 0.05, k.yellow, -1.3, 2.1, -0.45);
  const fw = G(g, 1.42, 2.1, 0.55);
  C(fw, 0.55, 0.55, 0.1, k.polish, 0, 0, 0, 36).rotation.z = PI / 2;
  B(fw, 0.12, 0.95, 0.12, k.frame, 0, 0, 0);
  B(fw, 0.12, 0.12, 0.95, k.frame, 0, 0, 0);
  a.push({ obj: fw, type: 'rotX', speed: 5 });
  screen(body, 0, 2.15, 1.16, 0.8, 0.45);
};

export const mixer: MachineBuilder = (g, k, a) => {
  const tz = -2.35;
  legs(g, k, [[-1, tz - 1], [1, tz - 1], [-1, tz + 1], [1, tz + 1]], 1.35);
  C(g, 1.42, 0.45, 0.6, k.steel, 0, 1.38, tz, 48);
  C(g, 1.42, 1.42, 2.1, k.steelDS, 0, 2.73, tz, 48, true);
  for (const y of [2.1, 3.0]) T(g, 1.44, 0.045, k.brushed, 0, y, tz).rotation.x = PI / 2;
  C(g, 1.38, 1.38, 0.06, k.choc, 0, 3.25, tz, 48);
  T(g, 1.43, 0.06, k.polish, 0, 3.78, tz).rotation.x = PI / 2;
  const ag = G(g, 0, 3.42, tz);
  C(ag, 0.06, 0.06, 0.9, k.polish, 0, 0.32, 0, 10);
  for (const r of [0, PI / 2]) {
    const bl = B(ag, 2.4, 0.06, 0.22, k.polish, 0, 0, 0);
    bl.rotation.y = r;
    bl.rotation.x = 0.3;
  }
  a.push({ obj: ag, type: 'rotY', speed: 1.8 });
  RB(g, 3.4, 0.22, 0.4, 0.05, k.frame, 0, 4.0, tz);
  C(g, 0.34, 0.34, 0.7, k.teal, 0, 4.45, tz, 28);
  C(g, 0.4, 0.4, 0.12, k.brushed, 0, 4.86, tz, 28);
  // Outlet pipe to the belt, flange and red valve handle.
  C(g, 0.09, 0.09, 1.6, k.steel, 0, 1.15, -0.85, 14).rotation.x = PI / 2;
  flange(g, k, 0, 1.15, -1.25, 0.09, PI / 2);
  C(g, 0.09, 0.06, 0.25, k.steel, 0, 1.25, 0, 14);
  B(g, 0.5, 0.04, 0.06, SHARED.btnRed, 0, 1.32, -1.1);
  // Access platform.
  B(g, 1.4, 0.08, 1.9, k.grate, 2.15, 2.4, tz);
  legs(g, k, [[1.55, tz - 0.85], [2.75, tz - 0.85], [1.55, tz + 0.85], [2.75, tz + 0.85]], 2.36);
  railing(g, k, 2.85, tz - 0.95, 2.85, tz + 0.95, 2.44, 1.0);
  railing(g, k, 1.45, tz - 0.95, 2.85, tz - 0.95, 2.44, 1.0);
  stairs(g, k, 2.15, tz + 1.1, 2.4, 0, 1, 0.8);
  cabinet(g, k, -2.3, -0.9, 0.8, 1.5, 0.4, 0);
};

export const refiner: MachineBuilder = (g, k, a) => {
  const rz = -1.7;
  RB(g, 3.9, 0.6, 2.3, 0.06, k.frame, 0, 0.3, rz);
  for (const x of [-1.75, 1.75]) {
    RB(g, 0.45, 3.3, 2.0, 0.16, k.cream, x, 2.25, rz);
    B(g, 0.47, 0.1, 2.02, k.teal, x, 1.2, rz);
  }
  for (let i = 0; i < 5; i++) {
    const rg = G(g, 0, 1.25 + 0.5 * i, rz + 0.55 - 0.3 * i);
    C(rg, 0.25, 0.25, 3.0, k.roll, 0, 0, 0, 28).rotation.z = PI / 2;
    a.push({ obj: rg, type: 'rotX', speed: i % 2 ? -2.6 : 2.6 });
  }
  RB(g, 3.0, 0.6, 0.9, 0.05, k.steel, 0, 3.95, rz - 0.75);
  B(g, 2.6, 0.05, 0.6, k.steel, 0, 1.3, -0.82);
  B(g, 3.0, 1.9, 0.03, k.glass, 0, 2.55, rz + 1.0);
  for (const y of [1.6, 3.5]) B(g, 3.04, 0.06, 0.06, k.yellow, 0, y, rz + 1.0);
  RB(g, 1.1, 1.3, 1.1, 0.1, k.teal, 2.55, 0.65, rz);
  C(g, 0.36, 0.36, 0.85, k.teal, 2.55, 1.6, rz, 24).rotation.z = PI / 2;
  cabinet(g, k, 2.6, -0.2, 0.8, 1.5, 0.4, 0);
};

export const conche: MachineBuilder = (g, k, a) => {
  const cz = -2.2;
  legs(g, k, [[-2.5, cz - 1.1], [0, cz - 1.1], [2.5, cz - 1.1], [-2.5, cz + 1.1], [0, cz + 1.1], [2.5, cz + 1.1]], 1.0);
  RB(g, 5.4, 1.35, 2.5, 0.3, k.teal, 0, 1.62, cz);
  C(g, 1.2, 1.2, 5.3, k.teal, 0, 1.35, cz - 0.6, 32).rotation.z = PI / 2;
  C(g, 1.2, 1.2, 5.3, k.teal, 0, 1.35, cz + 0.6, 32).rotation.z = PI / 2;
  B(g, 5.0, 0.05, 2.2, k.choc, 0, 2.32, cz);
  for (const dz of [-1.27, 1.27]) B(g, 5.5, 0.1, 0.1, k.steel, 0, 2.38, cz + dz);
  for (const dx of [-2.72, 2.72]) B(g, 0.1, 0.1, 2.64, k.steel, dx, 2.38, cz);
  for (const [dz, dir] of [[-0.55, 1], [0.55, -1]]) {
    const sh = G(g, 0, 2.45, cz + dz);
    C(sh, 0.07, 0.07, 5.1, k.polish, 0, 0, 0, 12).rotation.z = PI / 2;
    for (let j = 0; j < 6; j++) RB(sh, 0.16, 0.64, 0.1, 0.03, k.polish, -2.0 + 0.8 * j, 0, 0).rotation.x = j % 2 ? 0.8 : -0.8;
    a.push({ obj: sh, type: 'rotX', speed: 1.2 * dir });
  }
  // Hinged glass lid over the back half.
  for (const x of [-2.4, 2.4]) cylBetween(g, [x, 2.38, cz - 1.25], [x, 3.25, cz - 0.7], 0.03, k.steel);
  B(g, 4.8, 0.03, 0.9, k.glass, 0, 3.25, cz - 0.9);
  RB(g, 1.1, 1.6, 1.4, 0.1, k.cream, 3.35, 0.8, cz);
  C(g, 0.45, 0.45, 1.0, k.teal, 3.35, 2.05, cz, 28).rotation.z = PI / 2;
  C(g, 0.09, 0.09, 1.0, k.steel, -2.2, 1.5, -0.55, 14).rotation.x = PI / 2;
  C(g, 0.09, 0.06, 0.25, k.steel, -2.2, 1.33, 0, 14);
  B(g, 4.6, 0.08, 0.9, k.grate, 0, 0.9, cz - 1.95);
  railing(g, k, -2.3, cz - 2.4, 2.3, cz - 2.4, 0.94, 0.95);
  cabinet(g, k, -3.4, cz, 0.5, 1.6, 1.0, -PI / 2);
};

