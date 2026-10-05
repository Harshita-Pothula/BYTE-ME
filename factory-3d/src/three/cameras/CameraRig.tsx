import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { FOCUS, PRESETS, WALK, type PresetKey, type Vec3 } from '../../config/cameraPresets';
import { useViewStore } from '../../state/viewStore';
import { registry } from '../registry';
import { cameraApi, walkState } from './cameraApi';

interface Tween {
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  t0: THREE.Vector3;
  t1: THREE.Vector3;
  t: number;
  dur: number;
  done?: () => void;
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function blocked(x: number, z: number) {
  for (const b of registry.colliders) if (x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z) return true;
  return false;
}

/** Preset views, smooth fly-to, machine focus and first-person walking. */
export function CameraRig({ initialView = 'reset' }: { initialView?: PresetKey }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  const tween = useRef<Tween | null>(null);

  const controls = () => get().controls as unknown as OrbitControlsImpl | null;

  useEffect(() => {
    registry.camera = camera;
    camera.rotation.order = 'YXZ';
    const canvas = gl.domElement;
    const view = () => useViewStore.getState();

    const flyTo = (pos: Vec3, target: Vec3, dur = 1.2, done?: () => void) => {
      const c = controls();
      tween.current = {
        p0: camera.position.clone(),
        p1: new THREE.Vector3(...pos),
        t0: c ? c.target.clone() : new THREE.Vector3(),
        t1: new THREE.Vector3(...target),
        t: 0,
        dur: reduceMotion() ? 0.01 : dur,
        done,
      };
      registry.tweening = true;
      if (c) c.enabled = false;
    };

    const exitWalk = (silent = false) => {
      if (view().mode !== 'walk') return;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      walkState.ready = false;
      walkState.keys = {};
      const c = controls();
      if (c) {
        const fwd = new THREE.Vector3(-Math.sin(walkState.yaw), 0, -Math.cos(walkState.yaw));
        c.target.copy(camera.position).addScaledVector(fwd, 8).setY(1.5);
        c.enabled = !tween.current;
        c.update();
      }
      view().set({ mode: 'orbit', hoveredId: null, ...(silent ? {} : { activeView: null }) });
    };

    const enterWalk = () => {
      if (view().mode === 'walk') return;
      let fallback = !canvas.requestPointerLock;
      if (!fallback) {
        try {
          const r = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
          r?.catch?.(() => view().set({ walkFallback: true }));
        } catch {
          fallback = true;
        }
      }
      walkState.ready = false;
      view().set({ mode: 'walk', activeView: 'walk', walkFallback: fallback, hoveredId: null });
      const c = controls();
      if (c) c.enabled = false;
      flyTo(WALK.start.pos, WALK.start.target, WALK.start.duration, () => {
        walkState.yaw = 0;
        walkState.pitch = 0;
        walkState.ready = true;
      });
    };

    const goPreset = (key: PresetKey) => {
      exitWalk(true);
      const p = PRESETS[key];
      flyTo(p.pos, p.target, 1.3);
      view().set({ activeView: key === 'reset' ? null : key });
    };

    const focusMachine = (id: string) => {
      const m = registry.machines[id];
      if (!m) return;
      exitWalk(true);
      const c = m.center;
      const dz = m.flip ? -FOCUS.dz : FOCUS.dz;
      flyTo([c.x + FOCUS.dx, FOCUS.y, c.z + dz], [c.x, FOCUS.targetY, c.z], FOCUS.duration);
      view().set({ activeView: null });
    };

    Object.assign(cameraApi, { goPreset, focusMachine, enterWalk, exitWalk: () => exitWalk() });

    // Initial view.
    const p = PRESETS[initialView];
    camera.position.set(...p.pos);
    const c = controls();
    if (c) {
      c.target.set(...p.target);
      c.update();
    } else camera.lookAt(...p.target);

    // Pointer lock and mouse look.
    const onLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      if (walkState.locked && !locked && view().mode === 'walk') exitWalk();
      walkState.locked = locked;
    };
    const onLockError = () => view().set({ walkFallback: true });
    const onMouseMove = (e: MouseEvent) => {
      if (view().mode === 'walk' && walkState.locked && walkState.ready) look(e.movementX, e.movementY, WALK.mouseSens);
    };

    // Keyboard.
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (view().mode === 'walk') {
        walkState.keys[e.code] = true;
        if (/^Arrow/.test(e.code) || e.code === 'Space') e.preventDefault();
        if (e.code === 'Escape') exitWalk();
        return;
      }
      if (e.code === 'Escape' && view().selectedId) view().set({ selectedId: null });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      walkState.keys[e.code] = false;
    };
    const onBlur = () => {
      walkState.keys = {};
    };

    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('pointerlockerror', onLockError);
    document.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('pointerlockerror', onLockError);
      document.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl]);

  // Any manual orbit drag clears the pressed view button.
  const ctl = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  useEffect(() => {
    if (!ctl) return;
    const onStart = () => {
      if (!tween.current) useViewStore.getState().set({ activeView: null });
    };
    ctl.addEventListener('start', onStart);
    return () => ctl.removeEventListener('start', onStart);
  }, [ctl]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const tw = tween.current;
    const c = controls();
    if (tw) {
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const e = easeInOutCubic(tw.t);
      camera.position.lerpVectors(tw.p0, tw.p1, e);
      const target = c ? c.target : new THREE.Vector3();
      target.lerpVectors(tw.t0, tw.t1, e);
      camera.lookAt(target);
      if (tw.t >= 1) {
        tween.current = null;
        registry.tweening = false;
        if (c && useViewStore.getState().mode !== 'walk') {
          c.enabled = true;
          c.update();
        }
        tw.done?.();
      }
      return;
    }
    if (useViewStore.getState().mode === 'walk') stepWalk(dt);
  });

  function stepWalk(dt: number) {
    if (!walkState.ready) return;
    const k = walkState.keys;
    const sp = (k.ShiftLeft || k.ShiftRight ? WALK.runSpeed : WALK.speed) * dt;
    let mx = 0,
      mz = 0;
    if (k.KeyW || k.ArrowUp) mz -= 1;
    if (k.KeyS || k.ArrowDown) mz += 1;
    if (k.KeyA || k.ArrowLeft) mx -= 1;
    if (k.KeyD || k.ArrowRight) mx += 1;
    if (mx || mz) {
      const l = Math.hypot(mx, mz);
      mx /= l;
      mz /= l;
      const sy = Math.sin(walkState.yaw),
        cy = Math.cos(walkState.yaw);
      const dx = (mx * cy + mz * sy) * sp,
        dz = (-mx * sy + mz * cy) * sp;
      const p = camera.position;
      const { x0, x1, z0, z1 } = WALK.bounds;
      const nx = Math.max(x0, Math.min(x1, p.x + dx)),
        nz = Math.max(z0, Math.min(z1, p.z + dz));
      // Slide along obstacles: try both axes, then X only, then Z only.
      if (!blocked(nx, nz)) {
        p.x = nx;
        p.z = nz;
      } else if (!blocked(nx, p.z)) p.x = nx;
      else if (!blocked(p.x, nz)) p.z = nz;
    }
    camera.position.y = WALK.eye;
    camera.rotation.set(walkState.pitch, walkState.yaw, 0, 'YXZ');
  }

  return null;
}

export function look(dx: number, dy: number, sens: number) {
  walkState.yaw -= dx * sens;
  walkState.pitch = Math.max(-WALK.pitchLimit, Math.min(WALK.pitchLimit, walkState.pitch - dy * sens));
}
