import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCopy, ExternalLink, MoreVertical } from 'lucide-react';
import type { Agent } from '../../types';
import { buildTerminalAttachCommand, buildTerminalAttachUri } from '../../utils/terminalAttach';

export const TERMINAL_ATTACH_ACTIONS = ['open-native', 'copy-command'] as const;

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Clipboard API requires a secure context in several browsers. The
      // panel is also served over plain HTTP on trusted LANs, so use the
      // user-gesture-bound selection fallback there.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand('copy')) throw new Error('clipboard copy was rejected');
  } finally {
    textarea.remove();
  }
}

function terminalAttachTarget(agent: Agent, ptyId: string) {
  const identity = {
    relayId: agent.relay_id,
    daemonFingerprint: agent.fingerprint,
    ptyId,
  };
  try {
    return {
      uri: buildTerminalAttachUri(identity),
      command: buildTerminalAttachCommand(identity),
    };
  } catch {
    return null;
  }
}

export default function TerminalAttachMenu({ agent, ptyId }: { agent: Agent | null | undefined; ptyId: string }) {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const target = useMemo(() => agent ? terminalAttachTarget(agent, ptyId) : null, [agent, ptyId]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  if (!target) return null;

  const copyCommand = async () => {
    try {
      await copyText(target.command);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <span className="relative shrink-0" onPointerDown={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        className="rounded p-1 text-canvas-muted hover:bg-canvas-border hover:text-canvas-accent"
        onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); setCopyState('idle'); }}
        title="Terminal actions"
        aria-label="Terminal actions"
        aria-haspopup="menu"
        aria-expanded={open}
        data-pane-action="attach-menu"
      >
        <MoreVertical size={12} />
      </button>
      {open && <>
        <button type="button" className="fixed inset-0 z-[80]" onClick={(event) => { event.stopPropagation(); setOpen(false); }} aria-label="Close terminal actions" />
        <span className="absolute right-0 top-full z-[81] mt-1 w-52 rounded border border-canvas-border bg-canvas-surface p-1 text-xs shadow-xl" role="menu">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-canvas-border"
            onClick={(event) => { event.stopPropagation(); setOpen(false); window.location.assign(target.uri); }}
            role="menuitem"
            data-terminal-attach-action="open-native"
          >
            <ExternalLink size={13} />Open in terminal
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-canvas-border"
            onClick={(event) => { event.stopPropagation(); void copyCommand(); }}
            role="menuitem"
            data-terminal-attach-action="copy-command"
          >
            <ClipboardCopy size={13} />
            {copyState === 'copied' ? 'Attach command copied' : copyState === 'failed' ? 'Copy failed' : 'Copy attach command'}
          </button>
        </span>
      </>}
    </span>
  );
}
