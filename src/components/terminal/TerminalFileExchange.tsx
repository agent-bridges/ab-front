import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, File as FileIcon, Image, Paperclip, Send, Share2, Trash2, Upload } from 'lucide-react';
import { createFs, downloadFile, fetchFileBlob, listDir, uploadFile } from '../../api/fs';
import { sendPtyText } from '../../api/pty';
import type { FsEntry, PtySession } from '../../types';
import DialogShell from '../dialogs/DialogShell';
import {
  attachmentPrompt,
  childPath,
  isPreviewableImage,
  resolveTerminalFilePath,
  safeUploadName,
} from './terminalFiles';

const MAX_ATTACHMENTS = 10;
const MAX_PREVIEW_BYTES = 32 * 1024 * 1024;

interface LocalAttachment {
  id: number;
  file: File;
  previewUrl?: string;
}

interface RemoteFileState {
  path: string;
  entry?: FsEntry;
  previewUrl?: string;
  loading: boolean;
  busy: boolean;
  previewTooLarge: boolean;
  error?: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createAttachment(file: File, id: number): LocalAttachment {
  return {
    id,
    file,
    previewUrl: file.type.startsWith('image/') || isPreviewableImage(file.name)
      ? URL.createObjectURL(file)
      : undefined,
  };
}

export default function TerminalFileExchange({
  session,
  agentId,
  registerPathOpener,
}: {
  session: PtySession;
  agentId: string;
  registerPathOpener: (opener: (path: string) => void) => void;
}) {
  const cwd = session.last_cwd || session.project_path;
  const filesInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const nextAttachmentId = useRef(1);
  const remoteRequestId = useRef(0);
  const remotePreviewUrl = useRef<string | undefined>(undefined);
  const attachmentsRef = useRef<LocalAttachment[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [remote, setRemote] = useState<RemoteFileState | null>(null);

  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);
  useEffect(() => () => {
    attachmentsRef.current.forEach((attachment) => attachment.previewUrl && URL.revokeObjectURL(attachment.previewUrl));
    if (remotePreviewUrl.current) URL.revokeObjectURL(remotePreviewUrl.current);
  }, []);

  const closeRemote = useCallback(() => {
    remoteRequestId.current += 1;
    if (remotePreviewUrl.current) URL.revokeObjectURL(remotePreviewUrl.current);
    remotePreviewUrl.current = undefined;
    setRemote(null);
  }, []);

  const openRemote = useCallback(async (rawPath: string) => {
    const path = resolveTerminalFilePath(rawPath, cwd);
    const requestId = ++remoteRequestId.current;
    if (remotePreviewUrl.current) URL.revokeObjectURL(remotePreviewUrl.current);
    remotePreviewUrl.current = undefined;
    setRemote({ path, loading: true, busy: false, previewTooLarge: false });
    try {
      const result = await listDir(agentId, path);
      const entry = result.files.find((item) => !item.is_dir && (item.path === result.path || item.path === path));
      if (!entry) throw new Error('The selected path is not a file');
      const previewable = isPreviewableImage(entry.name);
      const previewTooLarge = previewable && entry.size > MAX_PREVIEW_BYTES;
      setRemote({ path: entry.path, entry, loading: previewable && !previewTooLarge, busy: false, previewTooLarge });
      if (previewable && !previewTooLarge) {
        const blob = await fetchFileBlob(agentId, entry.path);
        if (requestId !== remoteRequestId.current) return;
        const previewUrl = URL.createObjectURL(blob);
        remotePreviewUrl.current = previewUrl;
        setRemote({ path: entry.path, entry, previewUrl, loading: false, busy: false, previewTooLarge: false });
      }
    } catch (error) {
      if (requestId === remoteRequestId.current) {
        setRemote((current) => current ? { ...current, loading: false, error: errorMessage(error) } : current);
      }
    }
  }, [agentId, cwd]);

  useEffect(() => registerPathOpener(openRemote), [openRemote, registerPathOpener]);

  const addFiles = (selected: FileList | null) => {
    if (!selected || sending) return;
    setAttachments((current) => {
      const available = Math.max(0, MAX_ATTACHMENTS - current.length);
      return [
        ...current,
        ...Array.from(selected).slice(0, available).map((file) => createAttachment(file, nextAttachmentId.current++)),
      ];
    });
    setSendError('');
  };

  const removeAttachment = (id: number) => {
    if (sending) return;
    setAttachments((current) => current.filter((attachment) => {
      if (attachment.id !== id) return true;
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      return false;
    }));
  };

  const ensureUploadDirectory = async () => {
    if (!cwd.trim()) throw new Error('The terminal working directory is unknown');
    const directory = childPath(cwd, '.ab-uploads');
    try {
      await listDir(agentId, directory);
    } catch {
      try {
        await createFs(agentId, cwd, 'mkdir', '.ab-uploads');
      } catch {
        await listDir(agentId, directory);
      }
    }
    return directory;
  };

  const sendAttachments = async () => {
    if (!attachments.length || sending) return;
    setSending(true);
    setSendError('');
    try {
      const directory = await ensureUploadDirectory();
      const stamp = Date.now();
      const uploaded: string[] = [];
      for (const [index, attachment] of attachments.entries()) {
        const remoteName = `${stamp}-${index + 1}-${safeUploadName(attachment.file.name)}`.slice(0, 180);
        const upload = new File([attachment.file], remoteName, {
          type: attachment.file.type,
          lastModified: attachment.file.lastModified,
        });
        await uploadFile(agentId, directory, upload);
        uploaded.push(childPath(directory, remoteName));
      }
      await sendPtyText(agentId, session.id, attachmentPrompt(prompt, uploaded), true);
      attachments.forEach((attachment) => attachment.previewUrl && URL.revokeObjectURL(attachment.previewUrl));
      setAttachments([]);
      setPrompt('');
      setComposerOpen(false);
    } catch (error) {
      setSendError(errorMessage(error));
    } finally {
      setSending(false);
    }
  };

  const shareRemote = async () => {
    if (!remote?.entry || remote.busy) return;
    setRemote((current) => current ? { ...current, busy: true, error: undefined } : current);
    try {
      const blob = await fetchFileBlob(agentId, remote.entry.path);
      const file = new File([blob], remote.entry.name, { type: blob.type || 'application/octet-stream' });
      if (!navigator.share || (navigator.canShare && !navigator.canShare({ files: [file] }))) {
        throw new Error('File sharing is not supported by this browser; use Save instead');
      }
      await navigator.share({ files: [file], title: remote.entry.name });
      setRemote((current) => current ? { ...current, busy: false } : current);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setRemote((current) => current ? { ...current, busy: false } : current);
      } else {
        setRemote((current) => current ? { ...current, busy: false, error: errorMessage(error) } : current);
      }
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setComposerOpen(true); setSendError(''); }}
        className="absolute bottom-3 right-3 z-20 flex h-9 w-9 items-center justify-center rounded-xl border border-canvas-border bg-canvas-surface/90 text-canvas-accent shadow-lg backdrop-blur hover:bg-canvas-border"
        title="Attach files to this terminal"
        aria-label="Attach files to this terminal"
      >
        <Paperclip size={16} />
        {attachments.length > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-canvas-accent px-1 text-center text-[9px] font-bold text-canvas-bg">{attachments.length}</span>}
      </button>

      <input ref={filesInputRef} type="file" multiple className="hidden" onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
      <input ref={photosInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />

      <DialogShell
        open={composerOpen}
        onClose={() => { if (!sending) setComposerOpen(false); }}
        title="Attach to terminal"
        description={`Files are uploaded to ${cwd || 'the PTY working directory'}/.ab-uploads`}
        widthClassName="max-w-xl"
        footer={<>
          <button disabled={sending} onClick={() => setComposerOpen(false)} className="rounded-lg border border-canvas-border px-3 py-2 text-xs text-canvas-muted disabled:opacity-40">Cancel</button>
          <button disabled={sending || attachments.length === 0} onClick={() => void sendAttachments()} className="flex items-center gap-2 rounded-lg border border-canvas-accent bg-canvas-accent/20 px-3 py-2 text-xs font-semibold text-canvas-accent disabled:opacity-40"><Send size={14} />{sending ? 'Uploading…' : 'Upload and send'}</button>
        </>}
      >
        <div className="flex flex-wrap gap-2">
          <button disabled={sending || attachments.length >= MAX_ATTACHMENTS} onClick={() => photosInputRef.current?.click()} className="flex items-center gap-2 rounded-lg border border-canvas-border px-3 py-2 text-xs hover:bg-canvas-border disabled:opacity-40"><Image size={15} />Photos</button>
          <button disabled={sending || attachments.length >= MAX_ATTACHMENTS} onClick={() => filesInputRef.current?.click()} className="flex items-center gap-2 rounded-lg border border-canvas-border px-3 py-2 text-xs hover:bg-canvas-border disabled:opacity-40"><Upload size={15} />Files</button>
          <span className="self-center text-[10px] text-canvas-muted">up to {MAX_ATTACHMENTS}</span>
        </div>
        {attachments.length > 0 && <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {attachments.map((attachment) => <div key={attachment.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-canvas-border bg-canvas-bg p-2">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-canvas-surface">
              {attachment.previewUrl ? <img src={attachment.previewUrl} alt="" className="h-full w-full object-cover" /> : <FileIcon size={19} className="text-canvas-accent" />}
            </div>
            <div className="min-w-0 flex-1"><div className="truncate text-xs" title={attachment.file.name}>{attachment.file.name}</div><div className="text-[10px] text-canvas-muted">{formatSize(attachment.file.size)}</div></div>
            <button disabled={sending} onClick={() => removeAttachment(attachment.id)} className="rounded p-1 text-canvas-muted hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40" title="Remove"><Trash2 size={13} /></button>
          </div>)}
        </div>}
        <label className="mt-4 block text-xs text-canvas-muted">Message (optional)</label>
        <textarea value={prompt} disabled={sending} onChange={(event) => setPrompt(event.target.value)} rows={4} placeholder="Tell the agent what to do with the attached files" className="mt-1 w-full resize-y rounded-lg border border-canvas-border bg-canvas-bg px-3 py-2 text-sm text-canvas-text outline-none focus:border-canvas-accent disabled:opacity-50" />
        {sendError && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{sendError}</div>}
      </DialogShell>

      <DialogShell
        open={remote !== null}
        onClose={closeRemote}
        title={remote?.entry?.name || remote?.path.split('/').pop() || 'File'}
        description={remote?.entry ? formatSize(remote.entry.size) : undefined}
        widthClassName="max-w-2xl"
        footer={remote?.entry ? <>
          <button disabled={remote.busy} onClick={() => void downloadFile(agentId, remote.entry!.path).catch((error) => setRemote((current) => current ? { ...current, error: errorMessage(error) } : current))} className="flex items-center gap-2 rounded-lg border border-canvas-border px-3 py-2 text-xs hover:bg-canvas-border disabled:opacity-40"><Download size={14} />Save</button>
          <button disabled={remote.busy} onClick={() => void shareRemote()} className="flex items-center gap-2 rounded-lg border border-canvas-border px-3 py-2 text-xs hover:bg-canvas-border disabled:opacity-40"><Share2 size={14} />Share</button>
          {remote.previewUrl && <a href={remote.previewUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-canvas-accent px-3 py-2 text-xs text-canvas-accent"><ExternalLink size={14} />Open full size</a>}
        </> : undefined}
      >
        <div className="break-all font-mono text-xs text-canvas-muted">{remote?.path}</div>
        {(remote?.loading || remote?.busy) && <div className="mt-4 flex items-center gap-2 text-xs text-canvas-muted"><span className="h-3 w-3 animate-spin rounded-full border-2 border-canvas-border border-t-canvas-accent" />{remote.loading ? 'Loading preview…' : 'Preparing file…'}</div>}
        {remote?.previewTooLarge && <div className="mt-4 text-xs text-canvas-muted">Preview is limited to {formatSize(MAX_PREVIEW_BYTES)}. You can still save or share the file.</div>}
        {remote?.previewUrl && <img src={remote.previewUrl} alt={remote.entry?.name || ''} className="mt-4 max-h-[65vh] w-full rounded-xl border border-canvas-border bg-black object-contain" />}
        {remote?.entry && !remote.previewUrl && !remote.loading && !remote.previewTooLarge && <div className="mt-6 flex flex-col items-center gap-2 py-8 text-canvas-muted"><FileIcon size={42} /><span className="text-xs">Preview is not available for this file type</span></div>}
        {remote?.error && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{remote.error}</div>}
      </DialogShell>
    </>
  );
}
