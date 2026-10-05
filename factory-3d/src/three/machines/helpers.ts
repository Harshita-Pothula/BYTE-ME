import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Kit, SHARED, type StdMat } from './kit';

/*
 * Shape helpers. All take the parent first and return the created object.
 * Identical geometries are shared through a cache (Phase 13 performance).
 */

type Mat = THREE.Material;
export type V3 = [number, number, number];
const PI = Math.PI;
const UP = new THREE.Vector3(0, 1, 0);

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key) as T | undefined;
  if (!g) geoCache.set(key, (g = make()));
  return g;
}
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function mesh(g: THREE.BufferGeometry, m: Mat, x: number, y: number, z: number, parent: THREE.Object3D, noShadow = false) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  if (!noShadow) {
    o.castShadow = true;
    o.receiveShadow = true;
  }
  parent.add(o);
  return o;
}

export const boxGeo = (w: number, h: number, d: number) =>
  geo(`b${r4(w)},${r4(h)},${r4(d)}`, () => new THREE.BoxGeometry(w, h, d));

export const roundedBoxGeo = (w: number, h: number, d: number, r: number, seg = 3) => {
  const rr = Math.max(0.001, Math.min(r, w / 2 - 0.005, h / 2 - 0.005, d / 2 - 0.005));
  return geo(`rb${r4(w)},${r4(h)},${r4(d)},${r4(rr)},${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, rr));
};

export const cylGeo = (rt: number, rb: number, h: number, seg = 32, open = false) =>
  geo(`c${r4(rt)},${r4(rb)},${r4(h)},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));

export const B = (p: THREE.Object3D, w: number, h: number, d: number, m: Mat, x: number, y: number, z: number) =>
  mesh(boxGeo(w, h, d), m, x, y, z, p);

export const RB = (p: THREE.Object3D, w: number, h: number, d: number, r: number, m: Mat, x: number, y: number, z: number) =>
  mesh(roundedBoxGeo(w, h, d, r), m, x, y, z, p);

export const C = (p: THREE.Object3D, rt: number, rb: number, h: number, m: Mat, x: number, y: number, z: number, seg = 32, open = false) =>
  mesh(cylGeo(rt, rb, h, seg, open), m, x, y, z, p);

export const T = (p: THREE.Object3D, R: number, r: number, m: Mat, x: number, y: number, z: number) =>
  mesh(geo(`t${r4(R)},${r4(r)}`, () => new THREE.TorusGeometry(R, r, 10, 48)), m, x, y, z, p);

export const S = (p: THREE.Object3D, r: number, m: Mat, x: number, y: number, z: number) =>
  mesh(geo(`s${r4(r)}`, () => new THREE.SphereGeometry(r, 20, 14)), m, x, y, z, p);

export function G(p: THREE.Object3D | null, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  p?.add(g);
  return g;
}

export function cylBetween(p: THREE.Object3D, a: V3, b: V3, r: number, m: Mat, seg = 10) {
  const A = new THREE.Vector3(...a),
    Bv = new THREE.Vector3(...b);
  const c = C(p, r, r, A.distanceTo(Bv), m, (A.x + Bv.x) / 2, (A.y + Bv.y) / 2, (A.z + Bv.z) / 2, seg);
  c.quaternion.setFromUnitVectors(UP, Bv.clone().sub(A).normalize());
  return c;
}

/** Flat plane lying on the floor (receives shadow, does not cast). */
export function flat(p: THREE.Object3D, w: number, d: number, m: Mat, x: number, z: number, y = 0.02, rz = 0) {
  const o = mesh(geo(`p${r4(w)},${r4(d)}`, () => new THREE.PlaneGeometry(w, d)), m, x, y, z, p, true);
  o.rotation.x = -PI / 2;
  if (rz) o.rotation.z = rz;
  o.receiveShadow = true;
  return o;
}

export function plane(p: THREE.Object3D, w: number, h: number, m: Mat, x: number, y: number, z: number) {
  return mesh(geo(`p${r4(w)},${r4(h)}`, () => new THREE.PlaneGeometry(w, h)), m, x, y, z, p, true);
}

export function screen(p: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, ry = 0) {
  const s = plane(p, w, h, SHARED.screen, x, y, z);
  s.rotation.y = ry;
  return s;
}

/* ---------------- composite helpers ---------------- */

export function legs(p: THREE.Object3D, k: Kit, pts: [number, number][], h: number) {
  for (const [x, z] of pts) {
    C(p, 0.07, 0.07, h, k.steel, x, h / 2, z, 12);
    C(p, 0.15, 0.15, 0.05, k.steel, x, 0.025, z, 16);
  }
}

export function railing(p: THREE.Object3D, k: Kit, x0: number, z0: number, x1: number, z1: number, y: number, h: number) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.1));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n,
      z = z0 + ((z1 - z0) * i) / n;
    cylBetween(p, [x, y, z], [x, y + h, z], 0.03, k.yellow);
  }
  cylBetween(p, [x0, y + h, z0], [x1, y + h, z1], 0.035, k.yellow);
  cylBetween(p, [x0, y + h * 0.5, z0], [x1, y + h * 0.5, z1], 0.025, k.yellow);
}

export function stairs(p: THREE.Object3D, k: Kit, x: number, z: number, h: number, dx: number, dz: number, w = 0.8) {
  const n = Math.max(3, Math.round(h / 0.22));
  const ox = dz ? w / 2 : 0,
    oz = dx ? w / 2 : 0;
  for (let i = 0; i < n; i++)
    B(p, dx ? 0.28 : w, 0.05, dz ? 0.28 : w, k.grate, x + dx * i * 0.26, h - (i + 1) * (h / n) + 0.02, z + dz * i * 0.26);
  for (const sgn of [-1, 1]) {
    const a: V3 = [x + sgn * ox, h + 0.9, z + sgn * oz];
    const b: V3 = [x + dx * n * 0.26 + sgn * ox, 0.9, z + dz * n * 0.26 + sgn * oz];
    cylBetween(p, a, b, 0.03, k.yellow);
    cylBetween(p, [a[0], h, a[2]], [b[0], 0, b[2]], 0.04, k.frame);
  }
}

export function cabinet(p: THREE.Object3D, k: Kit, x: number, z: number, w: number, h: number, d: number, ry = 0) {
  const g = G(p, x, 0, z);
  g.rotation.y = ry;
  RB(g, w, h, d, 0.05, k.cream, 0, h / 2, 0);
  B(g, w + 0.04, 0.06, d + 0.04, k.teal, 0, h - 0.03, 0);
  screen(g, 0, h * 0.7, d / 2 + 0.006, w * 0.62, h * 0.2);
  const btns: [StdMat, number][] = [
    [SHARED.btnGreen, -0.18],
    [SHARED.btnYellow, 0],
    [SHARED.btnBlack, 0.18],
  ];
  for (const [m, dx] of btns) C(g, 0.045, 0.045, 0.04, m, dx * w, h * 0.45, d / 2 + 0.02, 14).rotation.x = PI / 2;
  C(g, 0.07, 0.07, 0.06, SHARED.btnRed, 0, h * 0.32, d / 2 + 0.03, 16).rotation.x = PI / 2;
  return g;
}

export function flange(p: THREE.Object3D, k: Kit, x: number, y: number, z: number, r: number, rx = 0, rz = 0) {
  const f = C(p, r * 1.6, r * 1.6, 0.06, k.brushed, x, y, z, 18);
  f.rotation.x = rx;
  f.rotation.z = rz;
  return f;
}

export function pallet(p: THREE.Object3D, k: Kit, x: number, y: number, z: number, w = 1.9, d = 1.1) {
  B(p, w, 0.05, d, k.wood, x, y + 0.12, z);
  for (const dz of [-d / 2 + 0.08, 0, d / 2 - 0.08]) B(p, w, 0.1, 0.12, k.wood, x, y + 0.05, z + dz);
}

export function rack(p: THREE.Object3D, k: Kit, len: number, z0: number, z1: number, beamMat: Mat) {
  const xs = [-len / 2, -len / 6, len / 6, len / 2];
  for (const x of xs) for (const z of [z0, z1]) B(p, 0.09, 4.4, 0.09, k.rackUp, x, 2.2, z);
  for (const x of [xs[0], xs[3]]) for (let y = 0.4; y < 4; y += 0.9) cylBetween(p, [x, y, z0], [x, y + 0.7, z1], 0.02, k.rackUp);
  for (const y of [1.6, 3.2]) for (const z of [z0, z1]) B(p, len, 0.13, 0.07, beamMat, 0, y, z);
}

export function sack(p: THREE.Object3D, k: Kit, x: number, y: number, z: number) {
  RB(p, 0.56, 0.34, 0.84, 0.14, k.jute, x, y + 0.17, z);
}

/** Free GPU resources of a subtree. Cached geometries/textures re-upload on next use. */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o.userData.ownsGeometry) (o as THREE.Mesh).geometry.dispose();
    const m = (o as THREE.Mesh).material;
    if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
  });
}
