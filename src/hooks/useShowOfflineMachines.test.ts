import { describe, expect, it } from 'vitest';
import {
  filterOfflineMachines,
  readShowOfflineMachines,
  SHOW_OFFLINE_MACHINES_KEY,
} from './useShowOfflineMachines';

describe('offline machine visibility', () => {
  it('shows offline machines by default', () => {
    expect(readShowOfflineMachines({ getItem: () => null })).toBe(true);
  });

  it('restores the hidden state from storage', () => {
    expect(readShowOfflineMachines({
      getItem: (key) => key === SHOW_OFFLINE_MACHINES_KEY ? 'false' : null,
    })).toBe(false);
  });

  it('filters only offline machines when disabled', () => {
    const machines = [{ id: 'online', online: true }, { id: 'offline', online: false }];
    expect(filterOfflineMachines(machines, true)).toEqual(machines);
    expect(filterOfflineMachines(machines, false)).toEqual([{ id: 'online', online: true }]);
  });
});
