import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchBoardItems, saveBoardItem } from '../api/board';
import { useWorkspaceStore } from './workspaceStore';

vi.mock('../api/board', () => ({
  fetchBoardItems: vi.fn(),
  saveBoardItem: vi.fn(),
  deleteBoardItem: vi.fn(),
}));

beforeEach(async () => {
  vi.mocked(fetchBoardItems).mockReset();
  vi.mocked(saveBoardItem).mockReset();
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

  it('keeps the active board mounted during a same-agent refresh', async () => {
    const current = { id: 'files-1', type: 'filebrowser' as const, label: 'Files', agentId: 'home~machine', currentPath: '/work' };
    useWorkspaceStore.setState({ agentId: 'home~machine', boardItems: [current], loaded: true, loadError: null });
    let resolveFetch!: (items: typeof current[]) => void;
    vi.mocked(fetchBoardItems).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));

    const refresh = useWorkspaceStore.getState().load('home~machine');
    expect(useWorkspaceStore.getState().boardItems).toEqual([current]);

    const replacement = [{ ...current, label: 'Project files' }];
    resolveFetch(replacement);
    await refresh;
    expect(useWorkspaceStore.getState().boardItems).toEqual(replacement);
  });

  it('does not persist an unchanged board item patch', () => {
    const current = { id: 'files-1', type: 'filebrowser' as const, label: 'Files', agentId: 'home~machine', currentPath: '/work' };
    useWorkspaceStore.setState({ agentId: 'home~machine', boardItems: [current], loaded: true, loadError: null });

    useWorkspaceStore.getState().updateBoardItem(current.id, { currentPath: '/work' });

    expect(saveBoardItem).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().boardItems[0]).toBe(current);
  });
});
