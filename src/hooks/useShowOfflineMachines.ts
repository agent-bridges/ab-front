import { useEffect, useState } from 'react';

export const SHOW_OFFLINE_MACHINES_KEY = 'ab:workspace:show-offline-machines';

export function readShowOfflineMachines(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(SHOW_OFFLINE_MACHINES_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function filterOfflineMachines<T extends { online: boolean }>(machines: T[], showOffline: boolean): T[] {
  return showOffline ? machines : machines.filter((machine) => machine.online);
}

export function useShowOfflineMachines(): [boolean, (show: boolean) => void] {
  const [showOffline, setShowOffline] = useState(readShowOfflineMachines);

  useEffect(() => {
    try {
      localStorage.setItem(SHOW_OFFLINE_MACHINES_KEY, String(showOffline));
    } catch {
      // The preference remains usable for this page when storage is unavailable.
    }
  }, [showOffline]);

  return [showOffline, setShowOffline];
}
