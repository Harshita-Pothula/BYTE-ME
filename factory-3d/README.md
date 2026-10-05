# ByteMe 3D Chocolate Factory — digital twin

An interactive 3D model of the ByteMe chocolate plant (11 machines, conveyors, product flow, energy flow, walk-through) built from `docs/ByteMe-3D-Factory-Build-Prompts.pdf`, using `docs/chocolate-factory-3d.html` as the visual reference.

**Stack:** React 19 · TypeScript · Vite · three r170 · @react-three/fiber 9 · @react-three/drei 10 · zustand 5

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production bundle in dist/
```

Dev extras: open with `?perf` for the r3f-perf overlay, `?q=low` for 1x pixel ratio and 1024 shadows. In the console, `__byteme.machineStore.getState()` shows the 11 machines.

## Mounting it in the ByteMe frontend

```tsx
import { FactoryTwin, MockMachineDataProvider } from './twin';

const provider = new MockMachineDataProvider();   // create once, keep stable

<div style={{ height: '100vh' }}>
  <FactoryTwin
    provider={provider}
    onMachineSelect={(id) => console.log(id)}
    initialView="reset"          // 'reset' | 'overview' | 'close'
    theme="auto"                 // 'auto' | 'light' | 'dark'
    simulate                     // the 15 s demo simulation; turn off with live data
  />
</div>
```

`FactoryTwin` fills its parent. Its CSS is scoped under `.bm-twin`, so it won't leak into the host page. Load the two brand fonts in the host page (see `index.html`):  Fraunces (headings) and Atkinson Hyperlegible (UI).

Going live: swap in `new ApiMachineDataProvider({ baseUrl: '/api', pollMs: 10000 })`. It reads `GET {baseUrl}/machines` (an array, or `{ machines: [...] }`) and maps it through `mapMachine()` in `src/data/providers/ApiMachineDataProvider.ts`; adjust that one function once the optimizer's JSON is final.

## Architecture

```
Provider ──> useDataSync ──> zustand stores ──> 3D scene + UI panels
                              (machine, view, energy)
```

- 3D components never fetch, never import mock data and never hard-code status; they read the stores.
- The scene writes back only `hoveredId` and `selectedId`.
- Per-frame code reads stores with `getState()` inside `useFrame`, so nothing re-renders every frame.
- `src/three/registry.ts` holds runtime scene geometry (machine boxes, speed factors, colliders, the camera) that the overlay UI (labels, minimap, debug) needs. It is not app state.

```
src/
  twin/          FactoryTwin component + public API (index.ts)
  app/           dev shell only
  config/        palette, layout (11 machines, flow path), camera presets, status styles
  data/          types, mock data + descriptions, providers, useDataSync, live simulation
  state/         machineStore, viewStore, energyStore (+ energyNow)
  three/
    core/        canvas textures, useBuilt, mergeStatic
    scene/       FactoryScene, Lighting, applyEnvIntensity
    environment/ ground, floor markings, walls + sign, indoor group, pipes, support areas, outside
    machines/    kit (materials), helpers (shapes), builders/ (11 machines), Machine wrapper
    flow/        path, Conveyors, Products (instanced, queueing)
    energy/      EnergyFlow (trays + animated dashed tubes)
    cameras/     CameraRig (presets, fly-to, focus, walk-through), cameraApi
    interactions/Picker (hover/select), LabelProjector, StatsProbe
  ui/            Toolbar, InfoPanel, EnergyPanel, Minimap, Labels, Toast, WalkOverlay, DebugPanel
```

## Deliberate differences from the PDF / demo

| What | Why |
|---|---|
| Sun 2.5π, hemisphere 0.3π (spec: 2.5 / 0.30) | The demo ran three r128 with legacy light units, which multiplied these by π in the shader. Modern three uses physical units; scaling restores the same picture. |
| `scene.environmentIntensity = 0.45` | r170's RoomEnvironment is brighter than r128's. 0.45 was measured by sampling rendered pixels against the demo at the default camera. The 0.85 / 0.40 per-material rule from Phase 3 is unchanged. |
| Static meshes are merged per material (`mergeStatic`) | Phase 13 performance: ~3,100 → ~345 draw calls with identical visuals. Moving parts, instanced meshes and toggled groups are never merged; machines stay pickable and individually highlightable. |
| Finished-goods rack has teal beams | The PDF says teal; the demo reused the orange raw-storage beams. |
| Switchgear screens face the hall | In the demo they faced into the cabinets and were invisible. |
| No `frameloop` toggling for hidden tabs | Browsers already pause `requestAnimationFrame` in hidden tabs; toggling R3F to `'never'` and back leaves its loop stopped. |
| `leva` not installed | Nothing needed it; the Debug panel covers it. `r3f-perf` is wired to `?perf`. |

## Checks done

All 11 machines are selectable and the pop-up matches the spec. Status changes update the beacon, the floor marks, the animation speed, and the maintenance cones and barrier. With packaging stopped, bars queue upstream at exactly 1.05 m spacing. Fly-to and machine focus work, including the walkway side for flipped machines. In walk-through, you can't pass through machines and Esc returns to orbit. Dark theme and phone layout (bottom sheet, no horizontal scroll) work, and the console shows no errors.
