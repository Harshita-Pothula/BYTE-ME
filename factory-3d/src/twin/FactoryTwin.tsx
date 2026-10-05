import { useEffect, useLayoutEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import type { MachineDataProvider } from '../data/types';
import { useDataSync } from '../data/useDataSync';
import { useLiveSimulation } from '../data/useLiveSimulation';
import { useViewStore } from '../state/viewStore';
import { useMachineStore } from '../state/machineStore';
import { useEnergyStore } from '../state/energyStore';
import { CAMERA, PRESETS, type PresetKey } from '../config/cameraPresets';
import { FactoryScene } from '../three/scene/FactoryScene';
import { Toolbar } from '../ui/panels/Toolbar';
import { InfoPanel } from '../ui/panels/InfoPanel';
import { EnergyPanel } from '../ui/panels/EnergyPanel';
import { Minimap } from '../ui/panels/Minimap';
import { Labels } from '../ui/panels/Labels';
import { Toast } from '../ui/panels/Toast';
import { WalkOverlay } from '../ui/panels/WalkOverlay';
import { DebugPanel } from '../ui/debug/DebugPanel';
import '../ui/styles.css';

export interface FactoryTwinProps {
  /** Where machine data comes from. Keep the instance stable (create it once). */
  provider: MachineDataProvider;
  /** Called whenever the selected machine changes (null when cleared). */
  onMachineSelect?: (id: string | null) => void;
  /** Camera preset on load. */
  initialView?: PresetKey;
  /** 'auto' follows the OS / host page; 'light' or 'dark' forces a theme. */
  theme?: 'auto' | 'light' | 'dark';
  /** Run the 15 s live simulation (demo only). Default true. */
  simulate?: boolean;
  className?: string;
}

function useDarkTheme(root: React.RefObject<HTMLElement | null>, theme: 'auto' | 'light' | 'dark') {
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const compute = () => {
      const host = document.documentElement.getAttribute('data-theme');
      const dark = theme === 'dark' || (theme === 'auto' && (host === 'dark' || (host !== 'light' && mq.matches)));
      useViewStore.getState().set({ dark });
      root.current?.setAttribute('data-theme', dark ? 'dark' : 'light');
    };
    compute();
    mq.addEventListener('change', compute);
    const mo = new MutationObserver(compute);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', compute);
      mo.disconnect();
    };
  }, [root, theme]);
}

/** The ByteMe 3D chocolate factory. Fills its parent element. */
export function FactoryTwin({ provider, onMachineSelect, initialView = 'reset', theme = 'auto', simulate = true, className }: FactoryTwinProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useDataSync(provider);
  useLiveSimulation(simulate);
  useDarkTheme(rootRef, theme);

  const ready = useViewStore((s) => s.ready);
  const hasInfo = useViewStore((s) => !!s.selectedId);

  // Selection callback for the host app.
  const cb = useRef(onMachineSelect);
  cb.current = onMachineSelect;
  useEffect(() => useViewStore.subscribe((s, prev) => s.selectedId !== prev.selectedId && cb.current?.(s.selectedId)), []);

  // Console access in dev: __byteme.machineStore.getState() etc.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__byteme = { machineStore: useMachineStore, viewStore: useViewStore, energyStore: useEnergyStore };
  }, []);

  // Keep --bar-h in sync with the toolbar's height so side panels sit below it.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const bar = root?.querySelector('.bm-bar');
    if (!root || !bar) return;
    const ro = new ResizeObserver(() => {
      const r = root.getBoundingClientRect(),
        b = bar.getBoundingClientRect();
      root.style.setProperty('--bar-h', `${Math.round(b.bottom - r.top + 10)}px`);
    });
    ro.observe(bar);
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  const lowQ = /[?&]q=low/.test(location.search);
  const start = PRESETS[initialView];

  return (
    <div ref={rootRef} className={`bm-twin${hasInfo ? ' has-info' : ''}${className ? ' ' + className : ''}`}>
      <Canvas
        className="bm-canvas"
        shadows="soft"
        dpr={lowQ ? 1 : [1, 2]}
        camera={{ fov: CAMERA.fov, near: CAMERA.near, far: CAMERA.far, position: start.pos }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.86;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.domElement.setAttribute('role', 'img');
          gl.domElement.setAttribute(
            'aria-label',
            '3D model of the ByteMe chocolate factory. Use the toolbar and the machine menu to move the camera and inspect machines.',
          );
        }}
      >
        <FactoryScene initialView={initialView} />
      </Canvas>
      <Labels />
      <Toolbar />
      <InfoPanel />
      <DebugPanel />
      <EnergyPanel />
      <Minimap />
      <WalkOverlay />
      <Toast />
      {!ready && <div className="bm-loading">Building the factory…</div>}
    </div>
  );
}
