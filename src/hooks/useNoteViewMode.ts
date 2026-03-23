import { useEffect, useState } from 'react';

export type NoteViewMode = 'edit' | 'preview';

function getStorageKey(itemId: string) {
  return `ab2:note-view-mode:${itemId}`;
}

export function useNoteViewMode(itemId: string) {
  const [mode, setMode] = useState<NoteViewMode>(() => {
    if (typeof window === 'undefined') return 'edit';
    const saved = window.localStorage.getItem(getStorageKey(itemId));
    return saved === 'preview' ? 'preview' : 'edit';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(getStorageKey(itemId));
    setMode(saved === 'preview' ? 'preview' : 'edit');
  }, [itemId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(getStorageKey(itemId), mode);
  }, [itemId, mode]);

  return { mode, setMode };
}
