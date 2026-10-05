import { useMemo } from 'react';
import { FactoryTwin, MockMachineDataProvider } from '../twin';

/** Dev shell only: mounts the twin full screen. */
export function App() {
  const provider = useMemo(() => new MockMachineDataProvider(), []);
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <FactoryTwin provider={provider} initialView="reset" onMachineSelect={(id) => import.meta.env.DEV && console.debug('[FactoryTwin] selected', id)} />
    </div>
  );
}
