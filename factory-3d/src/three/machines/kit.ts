import * as THREE from 'three';
import { TEX } from '../core/textures';
import { HIGHLIGHT_EMISSIVE } from '../../config/palette';

type MatExtra = THREE.MeshPhysicalMaterialParameters;
export type StdMat = THREE.MeshStandardMaterial;

/** Reflection strength rule: metals get more of the environment than paints. */
export const envIntensityFor = (m: THREE.MeshStandardMaterial) => (m.metalness > 0.5 ? 0.85 : 0.4);

/** MeshStandard (or MeshPhysical when `physical`) from an sRGB hex. */
export function std(hex: number, metal = 0, rough = 0.7, extra: MatExtra = {}, physical = false): StdMat {
  const params = { color: hex, metalness: metal, roughness: rough, ...extra };
  const m = physical ? new THREE.MeshPhysicalMaterial(params) : new THREE.MeshStandardMaterial(params);
  m.envMapIntensity = envIntensityFor(m);
  return m;
}

export function basic(hex: number, extra: THREE.MeshBasicMaterialParameters = {}) {
  return new THREE.MeshBasicMaterial({ color: hex, ...extra });
}

/** Shared non-highlighting materials: control screens, buttons, LEDs. */
export const SHARED = {
  screen: std(0x0c1f1e, 0, 0.3, { emissive: 0x34c6b6, emissiveIntensity: 0.9 }),
  btnGreen: std(0x2bae66, 0.1, 0.4, { emissive: 0x2bae66, emissiveIntensity: 0.5 }),
  btnRed: std(0xd23a2a, 0.1, 0.4),
  btnYellow: std(0xe3a72f, 0.1, 0.4),
  btnBlack: std(0x1e1b19, 0.1, 0.5),
};

/**
 * Each machine owns a Kit, so it owns its material instances and can be
 * highlighted alone. Materials are created lazily and recorded in `list`.
 */
export class Kit {
  readonly list: StdMat[] = [];
  private cache: Record<string, StdMat> = {};

  m(key: string, hex: number, metal = 0, rough = 0.7, extra: MatExtra = {}, physical = false): StdMat {
    const hit = this.cache[key];
    if (hit) return hit;
    const mat = std(hex, metal, rough, extra, physical);
    mat.emissive = new THREE.Color(HIGHLIGHT_EMISSIVE);
    mat.emissiveIntensity = 0;
    this.list.push(mat);
    return (this.cache[key] = mat);
  }

  setHighlight(level: number) {
    for (const m of this.list) m.emissiveIntensity = level;
  }

  get steel() { return this.m('steel', 0xdad8d3, 0.92, 0.26); }
  get steelDS() { return this.m('steelDS', 0xdad8d3, 0.92, 0.26, { side: THREE.DoubleSide }); }
  get polish() { return this.m('polish', 0xedebe7, 1, 0.12); }
  get brushed() { return this.m('brushed', 0xa8a5a0, 0.85, 0.4); }
  get frame() { return this.m('frame', 0x3b3734, 0.55, 0.45); }
  get grate() { return this.m('grate', 0x56514c, 0.6, 0.55); }
  get rubber() { return this.m('rubber', 0x1e1b19, 0, 0.85); }
  get cream() { return this.m('cream', 0xeae2d4, 0, 0.42, { clearcoat: 0.5, clearcoatRoughness: 0.3 }, true); }
  get teal() { return this.m('teal', 0x1e6e68, 0.1, 0.32, { clearcoat: 0.8, clearcoatRoughness: 0.2 }, true); }
  get brown() { return this.m('brown', 0x4a2f1e, 0.1, 0.32, { clearcoat: 0.8, clearcoatRoughness: 0.2 }, true); }
  get brass() { return this.m('brass', 0xc09a5b, 0.95, 0.28); }
  get copper() { return this.m('copper', 0xb8703e, 0.95, 0.3); }
  get yellow() { return this.m('yellow', 0xe3a72f, 0.1, 0.45, { clearcoat: 0.4 }, true); }
  get choc() { return this.m('choc', 0x3a2214, 0, 0.1, { clearcoat: 1, clearcoatRoughness: 0.05 }, true); }
  get roll() { return this.m('roll', 0x8d6b52, 0.95, 0.16); }
  get glass() { return this.m('glass', 0xd5e6e8, 0, 0.05, { transparent: true, opacity: 0.22, depthWrite: false }); }
  get wood() { return this.m('wood', 0xb98e5e, 0, 0.85); }
  get jute() { return this.m('jute', 0xffffff, 0, 0.95, { map: TEX.jute() }); }
  get carton() { return this.m('carton', 0xffffff, 0, 0.8, { map: TEX.carton() }); }
  get gold() { return this.m('gold', 0xe3a72f, 0.8, 0.25); }
  get rackUp() { return this.m('rackUp', 0x35506b, 0.3, 0.45, { clearcoat: 0.4 }, true); }
  get rackBeam() { return this.m('rackBeam', 0xd0602f, 0.2, 0.45, { clearcoat: 0.5 }, true); }
  get rackBeamTeal() { return this.m('rackBeamTeal', 0x1e6e68, 0.2, 0.45, { clearcoat: 0.5 }, true); }
}
