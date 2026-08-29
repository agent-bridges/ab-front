import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchBoardItems } from '../api/board';
import { useWorkspaceStore } from './workspaceStore';

vi.mock('../api/board', () => ({
  fetchBoardItems: vi.fn(),
  saveBoardItem: vi.fn(),
  deleteBoardItem: vi.fn(),
}));

beforeEach(async () => {
  vi.mocked(fetchBoardItems).mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await useWorkspaceStore.getState().load(null);
});

afterEach(() => vi.restoreAllMocks());

describe('workspace resource store', () => {
  it('exposes load failure and does not mark an empty result as loaded', async () => {
    vi.mocked(fetchBoardItems).mockRejectedValue(new Error('Canvas unavailable'));

    await useWorkspaceStore.getState().load('home~machine');

    expect(useWorkspaceStore.getState()).toMatchObject({
      agentId: 'home~machine',
      boardItems: [],
      loaded: false,
      loadError: 'Canvas unavailable',
    });
  });
});
