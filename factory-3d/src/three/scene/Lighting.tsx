import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useViewStore } from '../../state/viewStore';
import { SCENE_COLORS } from '../../config/palette';
import { skyTexture } from '../core/textures';

/*
 * The demo ran three r128 with legacy light units, where directional and
 * hemisphere irradiance was multiplied by PI in the shader. Modern three
 * uses physical units, so the spec's intensities (sun 2.5, hemi 0.30) are
 * scaled by PI here to give the same picture.
 */
const LEGACY = Math.PI;
const SUN_INTENSITY = 2.5 * LEGACY;
const HEMI_INTENSITY = { light: 0.3 * LEGACY, dark: 0.2 * LEGACY };
/*
 * RoomEnvironment also got brighter in r155+. 0.45 was measured by sampling
 * rendered pixels against the r128 demo at the default camera; it brings
 * floor, walkway and wall colours back to within a few RGB steps.
 */
const ENV_INTENSITY = 0.45;

const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const lowQuality = typeof location !== 'undefined' && /[?&]q=low/.test(location.search);
export const SHADOW_MAP_SIZE = lowQuality ? 1024 : isTouch ? 2048 : 4096;

/** Environment reflections, sun + sky lights, gradient background and fog. */
export function Lighting() {
  const { gl, scene } = useThree();
  const dark = useViewStore((s) => s.dark);

  // PMREM from RoomEnvironment: reflections only, never the background.
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = ENV_INTENSITY;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  const skies = useMemo(
    () => ({
      light: skyTexture(SCENE_COLORS.light.skyTop, SCENE_COLORS.light.skyMid, SCENE_COLORS.light.skyBottom),
      dark: skyTexture(SCENE_COLORS.dark.skyTop, SCENE_COLORS.dark.skyMid, SCENE_COLORS.dark.skyBottom),
    }),
    [],
  );

  useEffect(() => {
    const c = dark ? SCENE_COLORS.dark : SCENE_COLORS.light;
    scene.background = dark ? skies.dark : skies.light;
    scene.fog = new THREE.Fog(c.fog, 120, 330);
  }, [dark, scene, skies]);

  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight(0xffebd2, SUN_INTENSITY);
    l.position.set(46, 58, 40);
    l.target.position.set(8, 0, 2);
    l.castShadow = true;
    l.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    Object.assign(l.shadow.camera, { left: -56, right: 56, top: 44, bottom: -44, near: 20, far: 180 });
    l.shadow.bias = -0.0004;
    l.shadow.radius = 3;
    return l;
  }, []);

  return (
    <>
      <hemisphereLight args={[0xe4ecef, 0x6b5a4a, dark ? HEMI_INTENSITY.dark : HEMI_INTENSITY.light]} />
      <primitive object={sun} />
      <primitive object={sun.target} />
    </>
  );
}
