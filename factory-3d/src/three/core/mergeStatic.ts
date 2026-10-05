import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const KEEP = ['position', 'normal', 'uv'];

/**
 * Bakes every static mesh under `root` into one mesh per material + shadow
 * flags (Phase 13: fewer draw calls). Subtrees in `skip` (moving parts,
 * things that toggle visibility) and instanced meshes are left alone.
 * Merged meshes become direct children of `root`, so picking (walk up to
 * userData.machine_id) and per-machine highlight materials keep working.
 */
export function mergeStatic(root: THREE.Object3D, skip: Iterable<THREE.Object3D> = []) {
  const skipSet = new Set(skip);
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();

  const visit = (o: THREE.Object3D) => {
    if (skipSet.has(o) || !o.visible) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !(o as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(mesh.material)) {
      const src = mesh.geometry;
      let g = src.index ? src.toNonIndexed() : src.clone();
      for (const name of Object.keys(g.attributes)) if (!KEEP.includes(name)) g.deleteAttribute(name);
      if (!g.attributes.uv) g = withUv(g);
      g.morphAttributes = {};
      g.clearGroups();
      rel.multiplyMatrices(inv, mesh.matrixWorld);
      g.applyMatrix4(rel);
      const key = `${mesh.material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.renderOrder}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat: mesh.material, cast: mesh.castShadow, recv: mesh.receiveShadow, geos: [], meshes: [] }));
      b.geos.push(g);
      b.meshes.push(mesh);
    }
    for (const c of [...o.children]) visit(c);
  };
  for (const c of [...root.children]) visit(c);

  // Only merge buckets that actually save draw calls.
  let saved = 0;
  for (const b of buckets.values()) {
    if (b.geos.length < 2) {
      b.geos.forEach((g) => g.dispose());
      continue;
    }
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    for (const v of b.meshes) v.removeFromParent();
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.recv;
    m.userData.ownsGeometry = true;
    root.add(m);
    saved += b.meshes.length - 1;
  }
  pruneEmptyGroups(root, skipSet);
  return saved;
}

function withUv(g: THREE.BufferGeometry) {
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

function pruneEmptyGroups(o: THREE.Object3D, keep: Set<THREE.Object3D>) {
  for (const c of [...o.children]) {
    pruneEmptyGroups(c, keep);
    if (!keep.has(c) && c.type === 'Group' && c.children.length === 0) c.removeFromParent();
  }
}
