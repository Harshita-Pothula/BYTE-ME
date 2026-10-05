import * as THREE from 'three';
import { TEX } from '../core/textures';
import { flat } from '../machines/helpers';

let blobMat: THREE.MeshBasicMaterial | null = null;

/** Soft radial "blob" contact shadow. Grounds objects; matters a lot visually. */
export function blob(parent: THREE.Object3D, x: number, z: number, w: number, d: number) {
  if (!blobMat) {
    blobMat = new THREE.MeshBasicMaterial({
      map: TEX.blob(),
      transparent: true,
      depthWrite: false,
      color: 0x000000,
      opacity: 0.55,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    blobMat.toneMapped = false;
  }
  const o = flat(parent, w, d, blobMat, x, z, 0.021);
  o.receiveShadow = false;
  return o;
}
