import { describe, expect, it } from 'vitest';
import type { BoardItem, PtySession } from '../types';
import { claimInitialPaneForAgent, DESKTOP_TREE_DEPTH_CLASSES, workspaceEntriesForAgent } from './Workspace';

const session = (id: string, name = id): PtySession => ({
  id,
  name,
  project_path: '/',
  created_at: '2026-08-29T00:00:00Z',
  clients: 0,
  alive: true,
  type: 'bash',
  locked: false,
});

describe('Workspace agent transitions', () => {
  it('uses explicit Relay -> daemon -> child depth guides', () => {
    expect(DESKTOP_TREE_DEPTH_CLASSES.relayRow).toBe('px-2');
    expect(DESKTOP_TREE_DEPTH_CLASSES.daemonBranch).toContain('ml-4');
    expect(DESKTOP_TREE_DEPTH_CLASSES.childrenBranch).toContain('ml-4');
    expect(DESKTOP_TREE_DEPTH_CLASSES.daemonBranch).toContain('border-l');
    expect(DESKTOP_TREE_DEPTH_CLASSES.childrenBranch).toContain('border-l');
  });

  it('does not reopen an explicitly hidden final tab after A -> B -> A', () => {
    const visited = new Set<string>();
    expect(claimInitialPaneForAgent(visited, 'A', false, true)).toBe(true);
    // The user hides A's last pane; its visited marker deliberately remains.
    expect(claimInitialPaneForAgent(visited, 'B', false, true)).toBe(true);
    expect(claimInitialPaneForAgent(visited, 'A', false, true)).toBe(false);
    expect([...visited]).toEqual(['A', 'B']);
  });

  it('never derives panes from a previous agent while stores are switching ownership', () => {
    const staleBoard: BoardItem[] = [{ id: 'note-a', type: 'notes', label: 'A note', agentId: 'A' }];
    expect(workspaceEntriesForAgent({
      currentAgentId: 'B',
      ptyAgentId: 'A',
      sessionsById: { 'pty-a': session('pty-a') },
      workspaceAgentId: 'A',
      boardItems: staleBoard,
    })).toEqual([]);

    const partiallyLoaded = workspaceEntriesForAgent({
      currentAgentId: 'B',
      ptyAgentId: 'B',
      sessionsById: { 'pty-b': session('pty-b') },
      workspaceAgentId: 'A',
      boardItems: staleBoard,
    });
    expect(partiallyLoaded.map((entry) => entry.key)).toEqual(['session:pty-b']);
  });
});
