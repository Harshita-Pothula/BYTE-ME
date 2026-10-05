import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useViewStore } from '../../state/viewStore';
import { registry } from '../registry';

/**
 * Positions the HTML label pills (rendered by ui/panels/Labels) every frame,
 * writing transforms directly so nothing re-renders.
 */
export function LabelProjector() {
  const size = useThree((s) => s.size);
  const v = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }) => {
    const { mode, showLabels, hoveredId, selectedId } = useViewStore.getState();
    const walk = mode === 'walk';
    const limit = walk ? 30 : 120;
    for (const L of registry.labels.values()) {
      if (L.machineId) {
        const rt = registry.machines[L.machineId];
        if (!rt) continue;
        L.pos.copy(rt.anchor);
      }
      v.copy(L.pos).project(camera);
      const dist = camera.position.distanceTo(L.pos);
      const special = !!L.machineId && (L.machineId === hoveredId || L.machineId === selectedId);
      const onScreen = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      const show = onScreen && (special || (showLabels && dist < limit && (!!L.machineId || !walk || dist < 18)));
      if (!show) {
        if (L.visible) {
          L.el.style.display = 'none';
          L.visible = false;
        }
        continue;
      }
      if (!L.visible) {
        L.el.style.display = 'flex';
        L.visible = true;
      }
      const x = (v.x * 0.5 + 0.5) * size.width,
        y = (-v.y * 0.5 + 0.5) * size.height;
      L.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
    }
  });
  return null;
}
