import { useEffect } from 'react';
import type { MachineDataProvider } from './types';
import { useMachineStore } from '../state/machineStore';

/** Provider -> store. The only place machine data enters the app. */
export function useDataSync(provider: MachineDataProvider) {
  useEffect(() => {
    let alive = true;
    const { upsertMachines } = useMachineStore.getState();
    provider.getMachines().then(
      (list) => alive && upsertMachines(list),
      (err) => console.error('[FactoryTwin] could not load machines', err),
    );
    const unsub = provider.subscribe?.((list) => alive && upsertMachines(list));
    return () => {
      alive = false;
      unsub?.();
    };
  }, [provider]);
}
