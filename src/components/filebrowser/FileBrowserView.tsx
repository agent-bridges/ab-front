import { useState, useEffect, useCallback } from 'react';
import {
  Folder, File, ArrowLeft, RefreshCw, Home, HardDrive,
  FolderPlus, FilePlus, Trash2, Upload, Download, Terminal,
} from 'lucide-react';
import { useAgentStore } from '../../stores/agentStore';
import { useCanvasStore } from '../../stores/canvasStore';
import { saveItemLayout } from '../../api/canvas';
import { listDir, createFs, deleteFile, downloadFile, uploadFile } from '../../api/fs';
import { createPty } from '../../api/pty';
import type { CanvasItem, FsEntry } from '../../types';

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' K';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' M';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' G';
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function FileBrowserView({ item }: { item: CanvasItem }) {
  const agentId = useAgentStore((s) => s.currentAgentId);
  const updateItem = useCanvasStore((s) => s.updateItem);

  const [files, setFiles] = useState<FsEntry[]>([]);
  const [currentPath, setCurrentPath] = useState(item.currentPath || '~');
  const [parentPath, setParentPath] = useState('/');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<FsEntry | null>(null);
  const [showHidden, setShowHidden] = useState(true);
  const [prompt, setPrompt] = useState<{ type: 'mkdir' | 'touch'; value: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const loadPath = useCallback(async (path: string) => {
    if (!agentId) return;
    setLoading(true);
    setError('');
    setSelected(null);
    try {
      const data = await listDir(agentId, path);
      setCurrentPath(data.path);
      setParentPath(data.parent);
      updateItem(item.id, { currentPath: data.path });
      setFiles(data.files);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    }
    setLoading(false);
  }, [agentId, item.id, updateItem]);

  useEffect(() => {
    loadPath(currentPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = (file: FsEntry) => {
    if (file.is_dir) {
      loadPath(file.path);
    }
  };

  const handleSelect = (file: FsEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected((prev) => prev?.path === file.path ? null : file);
  };

  const goUp = () => {
    if (parentPath && parentPath !== currentPath) loadPath(parentPath);
  };

  const goRoot = () => loadPath('/');
  const goHome = () => loadPath('~');
  const refresh = () => loadPath(currentPath);

  const doCreate = async () => {
    if (!prompt || !prompt.value.trim() || !agentId) return;
    try {
      await createFs(agentId, currentPath, prompt.type, prompt.value.trim());
      setPrompt(null);
      refresh();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const doDelete = async () => {
    if (!selected || !agentId) return;
    try {
      await deleteFile(agentId, selected.path);
      setSelected(null);
      setShowDeleteConfirm(false);
      refresh();
    } catch (e: any) {
      setError(e.message);
      setShowDeleteConfirm(false);
    }
  };

  const doDownload = async () => {
    if (!selected || selected.is_dir || !agentId) return;
    try {
      await downloadFile(agentId, selected.path);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const doUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files || !agentId) return;
      for (const file of Array.from(input.files)) {
        try {
          await uploadFile(agentId, currentPath, file);
        } catch (e: any) {
          setError(e.message);
          return;
        }
      }
      refresh();
    };
    input.click();
  };

  const openTerminalHere = async () => {
    if (!agentId) return;

    const projectPath = selected?.is_dir ? selected.path : currentPath;

    try {
      const result = await createPty({
        agentId,
        projectPath,
        shellOnly: true,
      });

      if (!result.ok || !result.session_id) {
        setError(result.error || 'Failed to create terminal');
        return;
      }

      saveItemLayout(`pty-${result.session_id}`, item.x + 48, item.y + 48, undefined, agentId);
    } catch (e: any) {
      setError(e.message || 'Failed to create terminal');
    }
  };

  return (
    <div className="h-full flex flex-col bg-canvas-bg text-canvas-text">
      {/* Navigation toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-canvas-border bg-canvas-surface">
        <button onClick={goRoot} className="p-1 hover:bg-canvas-border rounded" title="Root">
          <HardDrive size={13} className="text-canvas-muted" />
        </button>
        <button onClick={goUp} className="p-1 hover:bg-canvas-border rounded" title="Up"
          disabled={parentPath === currentPath}>
          <ArrowLeft size={13} className="text-canvas-muted" />
        </button>
        <button onClick={goHome} className="p-1 hover:bg-canvas-border rounded" title="Home">
          <Home size={13} className="text-canvas-muted" />
        </button>
        <button onClick={refresh} className="p-1 hover:bg-canvas-border rounded" title="Refresh">
          <RefreshCw size={13} className="text-canvas-muted" />
        </button>
        <span className="flex-1 text-[11px] text-canvas-muted truncate font-mono px-1">{currentPath}</span>
        <label className="flex items-center gap-1 text-[10px] text-canvas-muted cursor-pointer">
          <input type="checkbox" checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
            className="w-3 h-3" />
          .*
        </label>
      </div>

      {/* Action toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-canvas-border bg-canvas-surface">
        <button onClick={() => setPrompt({ type: 'mkdir', value: '' })} className="p-1 hover:bg-canvas-border rounded" title="New folder">
          <FolderPlus size={13} className="text-canvas-muted" />
        </button>
        <button onClick={() => setPrompt({ type: 'touch', value: '' })} className="p-1 hover:bg-canvas-border rounded" title="New file">
          <FilePlus size={13} className="text-canvas-muted" />
        </button>
        <button onClick={doUpload} className="p-1 hover:bg-canvas-border rounded" title="Upload file">
          <Upload size={13} className="text-canvas-muted" />
        </button>
        <button
          onClick={openTerminalHere}
          className="p-1 hover:bg-canvas-border rounded"
          title={selected?.is_dir ? `Create terminal in ${selected.name}` : 'Create terminal in current folder'}
        >
          <Terminal size={13} className="text-canvas-muted" />
        </button>
        <button onClick={doDownload} disabled={!selected || selected.is_dir} className="p-1 hover:bg-canvas-border rounded disabled:opacity-30" title="Download file">
          <Download size={13} className="text-canvas-muted" />
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          disabled={!selected}
          className="p-1 hover:bg-canvas-border rounded disabled:opacity-30"
          title="Delete"
        >
          <Trash2 size={13} className="text-canvas-muted" />
        </button>
      </div>

      {/* Inline prompt for create */}
      {prompt && (
        <div className="flex items-center gap-1 px-2 py-1 border-b border-canvas-border bg-canvas-bg">
          <span className="text-[11px] text-canvas-muted">{prompt.type === 'mkdir' ? 'Folder:' : 'File:'}</span>
          <input
            autoFocus
            className="flex-1 bg-canvas-surface border border-canvas-border rounded px-1.5 py-0.5 text-xs text-canvas-text outline-none focus:border-canvas-accent"
            value={prompt.value}
            onChange={(e) => setPrompt({ ...prompt, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') doCreate();
              if (e.key === 'Escape') setPrompt(null);
            }}
          />
          <button onClick={doCreate} className="text-[11px] text-canvas-accent hover:underline">OK</button>
          <button onClick={() => setPrompt(null)} className="text-[11px] text-canvas-muted hover:underline">Cancel</button>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto" onClick={() => setSelected(null)}>
        {loading && <div className="p-4 text-sm text-canvas-muted text-center">Loading...</div>}
        {error && <div className="p-4 text-sm text-red-400 text-center">{error}</div>}
        {!loading && !error && files.length === 0 && (
          <div className="p-4 text-sm text-canvas-muted text-center">Empty directory</div>
        )}
        {!loading && (showHidden ? files : files.filter((f) => !f.name.startsWith('.'))).map((file) => (
          <button
            key={file.path}
            className={`w-full flex items-center gap-2 px-3 py-1 text-left hover:bg-canvas-surface transition-colors ${
              selected?.path === file.path ? 'bg-canvas-accent/10 outline outline-1 outline-canvas-accent' : ''
            }`}
            onClick={(e) => handleSelect(file, e)}
            onDoubleClick={() => handleClick(file)}
          >
            {file.is_dir ? (
              <Folder size={14} className="text-canvas-accent shrink-0" />
            ) : (
              <File size={14} className="text-canvas-muted shrink-0" />
            )}
            <span className="flex-1 text-xs truncate">{file.name}</span>
            {!file.is_dir && (
              <span className="text-[10px] text-canvas-muted font-mono shrink-0">{formatSize(file.size)}</span>
            )}
            <span className="text-[10px] text-canvas-muted/60 shrink-0 hidden sm:block">{formatDate(file.mod_time)}</span>
          </button>
        ))}
      </div>

      {showDeleteConfirm && selected && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-xl border border-canvas-border bg-canvas-surface p-4 shadow-2xl">
            <h3 className="text-base font-semibold text-canvas-text">Delete</h3>
            <p className="mt-2 text-sm text-canvas-muted">
              {selected.is_dir
                ? `Delete folder "${selected.name}" and all its contents?`
                : `Delete file "${selected.name}"?`}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border border-canvas-border px-3 py-1.5 text-sm text-canvas-muted hover:bg-canvas-bg"
              >
                Cancel
              </button>
              <button
                onClick={doDelete}
                className="rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-1.5 text-sm font-medium text-red-300 hover:bg-red-500/20"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
