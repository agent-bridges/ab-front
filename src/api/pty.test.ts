import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendPtyText } from './pty';

afterEach(() => vi.unstubAllGlobals());

describe('terminal text submission', () => {
  it('uses the daemon bracketed-paste endpoint and a separate Enter', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true, bytes: 8, bracketed_paste: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await sendPtyText('relay~daemon', 'pty/1', 'line one\nline two', true);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/agents/relay~daemon/pty/pty%2F1/stdin',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    );
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(options.body))).toEqual({ text: 'line one\nline two', enter: true });
  });
});
