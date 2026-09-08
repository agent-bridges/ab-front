import { useEffect, useRef, useState } from 'react';
import { Eye, Mic, MicOff, Minus, Pencil, RotateCw, Trash2, X } from 'lucide-react';
import FileBrowserView from '../components/filebrowser/FileBrowserView';
import NotesEditor from '../components/notes/NotesEditor';
import DialogShell from '../components/dialogs/DialogShell';
import { forceRefresh as forceTerminalRefresh } from '../components/terminal/TerminalCache';
import TerminalView from '../components/terminal/TerminalView';
import TunnelsView from '../components/tunnels/TunnelsView';
import { useNoteViewMode } from '../hooks/useNoteViewMode';
import { sendPtyText } from '../api/pty';
import type { BoardItem, PtySession } from '../types';
import { getTerminalStatusMeta, PROCESS_STATUS_THEME } from '../components/ProcessIndicator';
import ClaudeIcon from '../components/icons/ClaudeIcon';
import CodexIcon from '../components/icons/CodexIcon';
import { Cable, FolderOpen, StickyNote, Terminal as TerminalIcon } from 'lucide-react';
import { sessionDisplayName } from '../stores/clientAliasStore';

export type WorkspaceEntry =
  | { key: string; kind: 'session'; agentId: string; session: PtySession }
  | { key: string; kind: 'board'; agentId: string; item: BoardItem };

export const workspaceEntryTitle = (entry: WorkspaceEntry) => entry.kind === 'session' ? entry.session.name : entry.item.label;

export const workspaceEntryDisplayTitle = (entry: WorkspaceEntry) =>
  entry.kind === 'session' ? sessionDisplayName(entry.session) : entry.item.label;

export function WorkspaceEntryIcon({ entry, size = 13 }: { entry: WorkspaceEntry; size?: number }) {
  if (entry.kind === 'board') {
    const Icon = entry.item.type === 'notes' ? StickyNote : entry.item.type === 'filebrowser' ? FolderOpen : Cable;
    return <Icon size={size} className="shrink-0 text-canvas-accent" />;
  }
  const meta = getTerminalStatusMeta(entry.session.alive, entry.session.processes, entry.session.ai_status);
  return (
    <span className="relative shrink-0">
      {meta.aiAgent === 'claude'
        ? <ClaudeIcon size={size + 1} />
        : meta.aiAgent === 'codex'
          ? <CodexIcon size={size + 1} />
          : <TerminalIcon size={size} className="text-canvas-accent" />}
      <span className={`absolute -bottom-0.5 -right-1 h-1.5 w-1.5 rounded-full ${PROCESS_STATUS_THEME[meta.status].dotClass}`} />
    </span>
  );
}

export const DESKTOP_TERMINAL_PANE_ACTIONS = ['voice', 'refresh', 'hide', 'delete'] as const;

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string };
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorLike {
  error: string;
  message?: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

function speechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | null {
  const browserWindow = window as typeof window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition || null;
}

function appendTranscript(current: string, addition: string): string {
  const text = addition.trim();
  if (!text) return current;
  if (!current || /\s$/.test(current)) return `${current}${text}`;
  return `${current} ${text}`;
}

function speechErrorMessage(error: string, detail?: string): string {
  if (error === 'not-allowed' || error === 'service-not-allowed') return 'Microphone access was denied. Allow it for this site in Chrome settings and try again.';
  if (error === 'audio-capture') return 'Chrome cannot access a microphone. Check the selected input device.';
  if (error === 'network') return 'Chrome speech recognition could not reach its speech service.';
  if (error === 'no-speech') return 'No speech was detected. You can start listening again.';
  return detail || `Speech recognition failed: ${error}`;
}

function DesktopVoiceInput({ agentId, session }: { agentId: string; session: PtySession }) {
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const stop = (abort = false) => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) abort ? recognition.abort() : recognition.stop();
    setListening(false);
  };

  const start = () => {
    if (recognitionRef.current) return;
    const Recognition = speechRecognitionConstructor();
    if (!Recognition) {
      setError('Voice input is not supported by this browser. Open the installed app in desktop Chrome.');
      return;
    }

    if (interim) {
      setDraft((current) => appendTranscript(current, interim));
      setInterim('');
    }
    setError('');
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = navigator.language || 'en-US';
    recognition.onstart = () => setListening(true);
    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript || '';
        if (result.isFinal) finalText = appendTranscript(finalText, text);
        else interimText = appendTranscript(interimText, text);
      }
      if (finalText) setDraft((current) => appendTranscript(current, finalText));
      setInterim(interimText);
    };
    recognition.onerror = (event) => {
      setError(speechErrorMessage(event.error, event.message));
      setListening(false);
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (reason) {
      recognitionRef.current = null;
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const openAndStart = () => {
    setOpen(true);
    setDraft('');
    setInterim('');
    setError('');
    start();
  };

  const close = () => {
    stop(true);
    setOpen(false);
  };

  const insert = async () => {
    const text = appendTranscript(draft, interim).trim();
    if (!text) return;
    stop();
    setBusy(true);
    setError('');
    try {
      await sendPtyText(agentId, session.id, text, false);
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => () => recognitionRef.current?.abort(), []);

  return <>
    <button
      className={`rounded p-1 hover:bg-canvas-border ${listening ? 'text-red-400' : 'text-canvas-muted hover:text-canvas-accent'}`}
      onClick={(event) => { event.stopPropagation(); openAndStart(); }}
      onPointerDown={(event) => event.stopPropagation()}
      title="Voice input"
      aria-label={`Voice input for ${session.name}`}
      aria-pressed={listening}
      data-pane-action="voice"
    >
      <Mic size={11} />
    </button>
    <DialogShell
      open={open}
      onClose={close}
      title="Voice input"
      description="Chrome converts speech to editable text. Insert does not press Enter."
      widthClassName="max-w-xl"
      footer={<>
        <button className="rounded border border-canvas-border px-3 py-1.5 text-xs hover:bg-canvas-border" onClick={close}>Cancel</button>
        <button disabled={busy || !appendTranscript(draft, interim).trim()} className="rounded bg-canvas-accent px-3 py-1.5 text-xs font-semibold text-canvas-bg disabled:opacity-40" onClick={() => void insert()}>{busy ? 'Inserting…' : 'Insert into terminal'}</button>
      </>}
    >
      <div className="space-y-3">
        <textarea
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Recognised speech will appear here…"
          className="h-36 w-full resize-y rounded-lg border border-canvas-border bg-canvas-bg p-3 text-sm text-canvas-text outline-none focus:border-canvas-accent"
        />
        {interim && <div className="rounded border border-canvas-border/70 bg-canvas-bg/60 px-3 py-2 text-xs text-canvas-muted">{interim}</div>}
        {error && <div className="text-xs text-red-400">{error}</div>}
        <button
          className={`inline-flex items-center gap-2 rounded border px-3 py-2 text-xs ${listening ? 'border-red-400/60 text-red-400' : 'border-canvas-border text-canvas-text hover:bg-canvas-border'}`}
          onClick={() => listening ? stop() : start()}
        >
          {listening ? <MicOff size={14} /> : <Mic size={14} />}
          {listening ? 'Stop listening' : 'Start listening'}
        </button>
      </div>
    </DialogShell>
  </>;
}

export default function DesktopEntryPane({
  entry,
  active = false,
  onActivate,
  onHide,
  onDelete,
}: {
  entry: WorkspaceEntry;
  active?: boolean;
  onActivate?: () => void;
  onHide: () => void;
  onDelete: () => void;
}) {
  const title = workspaceEntryDisplayTitle(entry);
  // Board preferences historically used the raw canvas/board item id. Keep
  // that key stable instead of changing it to the Workspace `board:` key.
  const preferenceId = entry.kind === 'board' ? entry.item.id : entry.key;
  const { mode: noteMode, setMode: setNoteMode } = useNoteViewMode(preferenceId);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-canvas-bg" data-desktop-entry-pane={entry.key} onPointerDown={onActivate}>
      <div className={`flex h-7 shrink-0 items-center gap-1 border-b px-2 ${active ? 'border-canvas-accent/40 bg-canvas-accent/15' : 'border-canvas-border bg-canvas-surface'}`}>
        <WorkspaceEntryIcon entry={entry} />
        <span className={`min-w-0 flex-1 truncate text-[10px] ${active ? 'font-medium text-canvas-accent' : 'text-canvas-muted'}`} title={title}>
          {title}
        </span>
        {entry.kind === 'session' && (
          <>
            <DesktopVoiceInput agentId={entry.agentId} session={entry.session} />
            <button
              className="rounded p-1 text-canvas-muted hover:bg-canvas-border hover:text-canvas-accent"
              onClick={(event) => { event.stopPropagation(); forceTerminalRefresh(entry.session.id); }}
              onPointerDown={(event) => event.stopPropagation()}
              title="Force redraw"
              aria-label={`Refresh terminal ${entry.session.name}`}
              data-pane-action="refresh"
            >
              <RotateCw size={11} />
            </button>
          </>
        )}
        {entry.kind === 'board' && entry.item.type === 'tunnels' && (
          <button
            className="rounded p-1 text-canvas-muted hover:bg-canvas-border hover:text-canvas-accent"
            onClick={(event) => { event.stopPropagation(); window.dispatchEvent(new CustomEvent('ab-tunnels-refresh', { detail: { itemId: entry.item.id } })); }}
            onPointerDown={(event) => event.stopPropagation()}
            title="Refresh tunnels"
            aria-label={`Refresh tunnels ${entry.item.label}`}
            data-pane-action="refresh-tunnels"
          >
            <RotateCw size={11} />
          </button>
        )}
        {entry.kind === 'board' && entry.item.type === 'notes' && (
          <button
            className="rounded p-1 text-canvas-muted hover:bg-canvas-border hover:text-canvas-text"
            onClick={(event) => { event.stopPropagation(); setNoteMode(noteMode === 'edit' ? 'preview' : 'edit'); }}
            onPointerDown={(event) => event.stopPropagation()}
            title={noteMode === 'edit' ? 'Preview markdown' : 'Edit note'}
            data-pane-action="note-mode"
          >
            {noteMode === 'edit' ? <Eye size={11} /> : <Pencil size={11} />}
          </button>
        )}
        <button
          className="rounded p-1 text-canvas-muted hover:bg-canvas-border hover:text-canvas-text"
          onClick={(event) => { event.stopPropagation(); onHide(); }}
          onPointerDown={(event) => event.stopPropagation()}
          title="Hide window (keeps the session alive)"
          aria-label={`Hide ${title}`}
          data-pane-action="hide"
        >
          <Minus size={11} />
        </button>
        <button
          className="rounded p-1 text-canvas-muted hover:bg-red-500/20 hover:text-red-400"
          onClick={(event) => { event.stopPropagation(); onDelete(); }}
          onPointerDown={(event) => event.stopPropagation()}
          title={entry.kind === 'session' ? 'Kill instance' : 'Delete resource'}
          aria-label={`${entry.kind === 'session' ? 'Kill' : 'Delete'} ${title}`}
          data-pane-action="delete"
        >
          {entry.kind === 'session' ? <X size={11} /> : <Trash2 size={11} />}
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {entry.kind === 'session' && <TerminalView session={entry.session} agentId={entry.agentId} />}
        {entry.kind === 'board' && entry.item.type === 'filebrowser' && <FileBrowserView item={entry.item} />}
        {entry.kind === 'board' && entry.item.type === 'notes' && <NotesEditor item={entry.item} mode={noteMode} />}
        {entry.kind === 'board' && entry.item.type === 'tunnels' && <TunnelsView item={entry.item} />}
      </div>
    </div>
  );
}
