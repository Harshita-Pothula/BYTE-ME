import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { FLOW_PATH, HALL } from '../../config/layout';
import { STATUS } from '../../config/statusStyles';
import { hexCss } from '../../config/palette';
import { useMachineStore } from '../../state/machineStore';
import { useViewStore } from '../../state/viewStore';
import { registry } from '../../three/registry';
import { cameraApi } from '../../three/cameras/cameraApi';

/** World bounds shown on the map. */
const MB = { x0: -34, x1: 60, z0: -26, z1: 38 };
const W = 230,
  H = 156;

/** Top-down map: hall, solar area, conveyor path, machines by status, camera wedge. Hidden under 860 px. */
export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    const dir = new THREE.Vector3();
    let raf = 0,
      frame = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (frame++ % 4 || !cv.offsetParent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== W * dpr) {
        cv.width = W * dpr;
        cv.height = H * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const css = getComputedStyle(cv);
      const v = (n: string) => css.getPropertyValue(n).trim();
      const sx = W / (MB.x1 - MB.x0),
        sz = H / (MB.z1 - MB.z0);
      const X = (x: number) => (x - MB.x0) * sx,
        Z = (z: number) => (z - MB.z0) * sz;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = v('--chip');
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = v('--panel-solid');
      ctx.strokeStyle = v('--ink-2');
      ctx.lineWidth = 1;
      ctx.fillRect(X(HALL.x0), Z(HALL.z0), HALL.width * sx, HALL.depth * sz);
      ctx.strokeRect(X(HALL.x0), Z(HALL.z0), HALL.width * sx, HALL.depth * sz);
      ctx.fillStyle = 'rgba(32,48,79,0.55)';
      ctx.fillRect(X(36.5), Z(-21), 19 * sx, 21 * sz);
      ctx.strokeStyle = 'rgba(227,167,47,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      FLOW_PATH.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
      ctx.stroke();

      const { machines } = useMachineStore.getState();
      const { selectedId } = useViewStore.getState();
      for (const id in registry.machines) {
        const b = registry.machines[id].box,
          m = machines[id];
        if (!m) continue;
        ctx.fillStyle = hexCss(STATUS[m.status].hex);
        ctx.fillRect(X(b.min.x), Z(b.min.z), (b.max.x - b.min.x) * sx, (b.max.z - b.min.z) * sz);
        if (id === selectedId) {
          ctx.strokeStyle = v('--ink');
          ctx.lineWidth = 2;
          ctx.strokeRect(X(b.min.x) - 2, Z(b.min.z) - 2, (b.max.x - b.min.x) * sx + 4, (b.max.z - b.min.z) * sz + 4);
        }
      }
      const cam = registry.camera;
      if (cam) {
        cam.getWorldDirection(dir);
        const a = Math.atan2(dir.z, dir.x);
        const cx = Math.max(4, Math.min(W - 4, X(cam.position.x))),
          cz = Math.max(4, Math.min(H - 4, Z(cam.position.z)));
        ctx.fillStyle = 'rgba(138,75,34,0.28)';
        ctx.beginPath();
        ctx.moveTo(cx, cz);
        ctx.arc(cx, cz, 26, a - 0.45, a + 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = v('--accent');
        ctx.beginPath();
        ctx.arc(cx, cz, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = MB.x0 + ((e.clientX - r.left) / r.width) * (MB.x1 - MB.x0);
    const z = MB.z0 + ((e.clientY - r.top) / r.height) * (MB.z1 - MB.z0);
    for (const id in registry.machines) {
      const b = registry.machines[id].box;
      if (x > b.min.x - 1.5 && x < b.max.x + 1.5 && z > b.min.z - 1.5 && z < b.max.z + 1.5) {
        useViewStore.getState().set({ selectedId: id });
        cameraApi.focusMachine(id);
        return;
      }
    }
  };

  return (
    <section className="panel mini" aria-label="Factory map">
      <canvas ref={ref} width={W} height={H} role="img" aria-label="Top-down map of the factory. Click a machine to fly to it." onClick={onClick} />
      <p>Map: click a machine to fly to it</p>
    </section>
  );
}
