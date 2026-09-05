import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBoardItems } from './board';

afterEach(() => vi.unstubAllGlobals());

describe('workspace resource API', () => {
  it('does not turn a missing canvas route into an empty workspace', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(fetchBoardItems('home~machine')).rejects.toThrow('Failed to fetch workspace resources: 404');
  });

  it('rejects malformed JSON instead of returning an empty workspace', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));
    await expect(fetchBoardItems('home~machine')).rejects.toThrow('invalid JSON response');
  });

  it('rejects a malformed successful payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));
    await expect(fetchBoardItems('home~machine')).rejects.toThrow('invalid response');
  });

  it('returns an empty workspace only for an explicit successful empty list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));
    await expect(fetchBoardItems('home~machine')).resolves.toEqual([]);
  });

  it('hides legacy auto-resource prefixes from labels', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      id: 'item-1',
      type: 'filebrowser',
      label: '__auto__:filebrowser:Files',
      agentId: 'home~machine',
      currentPath: '/tmp',
    }]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));

    await expect(fetchBoardItems('home~machine')).resolves.toEqual([{
      id: 'item-1',
      type: 'filebrowser',
      label: 'Files',
      agentId: 'home~machine',
      currentPath: '/tmp',
      noteContent: undefined,
    }]);
  });
});
