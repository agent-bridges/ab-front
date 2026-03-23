import { authFetch } from './client';
import { readJson, readJsonOrThrow, throwFromResponse } from './http';
import type { FsListResult } from '../types';

export async function listDir(agentId: string, path: string): Promise<FsListResult> {
  const res = await authFetch(`/api/agents/${agentId}/fs?path=${encodeURIComponent(path)}`);
  return readJsonOrThrow<FsListResult>(res, 'Failed to list dir');
}

export async function createFs(agentId: string, dirPath: string, action: 'mkdir' | 'touch', name: string): Promise<void> {
  const res = await authFetch(`/api/agents/${agentId}/fs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: dirPath, action, name }),
  });
  if (!res.ok) await throwFromResponse(res, 'Failed to create');
}

export async function readFile(agentId: string, path: string): Promise<string> {
  const res = await authFetch(`/api/agents/${agentId}/fs?path=${encodeURIComponent(path)}&content=true`);
  const data = await readJsonOrThrow<{ content?: string }>(res, 'Failed to read file');
  return data.content || '';
}

export async function writeFile(agentId: string, path: string, content: string): Promise<void> {
  const res = await authFetch(`/api/agents/${agentId}/fs`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) await throwFromResponse(res, 'Failed to write file');
}

export async function deleteFile(agentId: string, path: string): Promise<void> {
  const res = await authFetch(`/api/agents/${agentId}/fs?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  });
  if (!res.ok) await throwFromResponse(res, 'Failed to delete');
}

export async function downloadFile(agentId: string, path: string): Promise<void> {
  const res = await authFetch(`/api/agents/${agentId}/fs/download?path=${encodeURIComponent(path)}`);
  if (!res.ok) await throwFromResponse(res, 'Failed to download');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = path.split('/').pop() || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function uploadFile(agentId: string, destPath: string, file: File): Promise<void> {
  const form = new FormData();
  form.append('path', destPath);
  form.append('file', file);
  const res = await authFetch(`/api/agents/${agentId}/fs/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) await throwFromResponse(res, 'Failed to upload');
}
