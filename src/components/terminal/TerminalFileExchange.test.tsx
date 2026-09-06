import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PtySession } from '../../types';
import TerminalFileExchange from './TerminalFileExchange';

const session: PtySession = {
  id: 'pty-1',
  name: 'demo',
  project_path: '/apps/demo',
  last_cwd: '/apps/demo/current',
  created_at: '2026-09-07T00:00:00Z',
  clients: 1,
  alive: true,
  type: 'bash',
  locked: false,
};

describe('terminal file exchange', () => {
  it('exposes the same attachment entrypoint wherever TerminalView is rendered', () => {
    const markup = renderToStaticMarkup(
      <TerminalFileExchange session={session} agentId="relay~daemon" registerPathOpener={() => {}} />,
    );

    expect(markup).toContain('aria-label="Attach files to this terminal"');
    expect(markup).toContain('multiple=""');
    expect(markup).toContain('accept="image/*"');
  });
});
