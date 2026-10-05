import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { WALK } from '../../config/cameraPresets';
import { useViewStore } from '../../state/viewStore';
import { registry } from '../registry';
import { cameraApi, walkState } from '../cameras/cameraApi';
import { look } from '../cameras/CameraRig';

/**
 * Hover / select / double-click focus. Raycasts only against machine meshes,
 * at most once per frame. The only store writes from the scene are
 * hoveredId and selectedId.
 */
export function Picker() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const st = useMemo(
    () => ({ ray: new THREE.Raycaster(), ndc: new THREE.Vector2(), dirty: false, inside: false, down: null as null | { x: number; y: number } }),
    [],
  );

  const pick = () => {
    if (registry.tweening) return;
    const view = useViewStore.getState();
    const walk = view.mode === 'walk';
    if (walk && !view.walkFallback) st.ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    else {
      if (!st.inside) return;
      st.ray.setFromCamera(st.ndc, camera);
    }
    const meshes: THREE.Object3D[] = [];
    for (const id in registry.machines) for (const m of registry.machines[id].meshes) meshes.push(m);
    const hit = st.ray.intersectObjects(meshes, false)[0];
    let id: string | null = null;
    if (hit && hit.distance < (walk ? WALK.pickRange : 400)) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.machine_id) o = o.parent;
      id = o ? (o.userData.machine_id as string) : null;
    }
    if (id !== view.hoveredId) view.set({ hoveredId: id });
  };

  useEffect(() => {
    const canvas = gl.domElement;
    const view = () => useViewStore.getState();
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      st.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      st.dirty = true;
      st.inside = true;
      if (view().mode === 'walk' && view().walkFallback && st.down && walkState.ready) look(e.movementX, e.movementY, WALK.dragSens);
    };
    const onLeave = () => {
      st.inside = false;
      if (view().hoveredId && view().mode !== 'walk') view().set({ hoveredId: null });
    };
    const onDown = (e: PointerEvent) => {
      st.down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (!st.down) return;
      const moved = Math.hypot(e.clientX - st.down.x, e.clientY - st.down.y);
      st.down = null;
      if (moved > 5) return;
      if (view().mode === 'walk' && !view().walkFallback && !walkState.locked) {
        try {
          (canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {});
        } catch {
          /* ignore */
        }
        return;
      }
      pick();
      view().set({ selectedId: view().hoveredId });
    };
    const onDbl = () => {
      const id = view().hoveredId;
      if (id && view().mode !== 'walk') cameraApi.focusMachine(id);
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('dblclick', onDbl);
    return () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('dblclick', onDbl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, st]);

  // Pointer cursor over machines.
  useEffect(
    () =>
      useViewStore.subscribe((s) => {
        gl.domElement.style.cursor = s.hoveredId && s.mode !== 'walk' ? 'pointer' : '';
      }),
    [gl],
  );

  useFrame(() => {
    if (useViewStore.getState().mode === 'walk' || st.dirty) {
      pick();
      st.dirty = false;
    }
  });

  return null;
}
