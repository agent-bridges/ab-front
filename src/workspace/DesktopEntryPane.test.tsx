import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DesktopEntryPane, { DESKTOP_TERMINAL_PANE_ACTIONS, type WorkspaceEntry } from './DesktopEntryPane';
import { useWorkspaceStore } from '../stores/workspaceStore';

const terminalEntry: WorkspaceEntry = {
  key: 'session:pty-1',
  kind: 'session',
  agentId: 'agent-1',
  session: {
    id: 'pty-1',
    name: 'api-refactor',
    project_path: '/apps/api-refactor',
    created_at: '2026-08-29T00:00:00Z',
    clients: 1,
    alive: true,
    type: 'bash',
    locked: false,
    processes: [],
  },
};

describe('desktop entry pane toolbar', () => {
  it('renders the historical terminal refresh, hide and delete controls', () => {
    const markup = renderToStaticMarkup(
      <DesktopEntryPane entry={terminalEntry} active onHide={() => {}} onDelete={() => {}} />,
    );

    expect(DESKTOP_TERMINAL_PANE_ACTIONS).toEqual(['refresh', 'hide', 'delete']);
    for (const action of DESKTOP_TERMINAL_PANE_ACTIONS) {
      expect(markup).toContain(`data-pane-action="${action}"`);
    }
    expect(markup).toContain('data-desktop-entry-pane="session:pty-1"');
    expect(markup).toContain('Refresh terminal api-refactor');
    expect(markup).toContain('Hide api-refactor');
    expect(markup).toContain('Kill api-refactor');
  });

  it('uses the client icon and status dot without duplicating textual activity', () => {
    const markup = renderToStaticMarkup(
      <DesktopEntryPane
        entry={{ ...terminalEntry, session: { ...terminalEntry.session, processes: [{ pid: 1, cmd: 'codex', args: '' }], ai_status: 'working' } }}
        onHide={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(markup).toContain('bg-orange-400 animate-pulse');
    expect(markup).not.toContain('Codex · working');
  });

  it('hides a grouped pane by removing only its group membership', () => {
    const original = useWorkspaceStore.getState();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    });
    useWorkspaceStore.setState({
      agentId: 'agent-1',
      groups: [{ id: 'group:1', name: 'Pair', members: ['session:pty-1', 'session:pty-2'], layout: 'v2', sizes: { outer: [0.5, 0.5] } }],
    });

    useWorkspaceStore.getState().removeGroupMember('group:1', 'session:pty-1');
    expect(useWorkspaceStore.getState().groups[0].members).toEqual(['session:pty-2']);

    useWorkspaceStore.setState(original, true);
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });
});
