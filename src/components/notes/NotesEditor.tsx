import { useState, useCallback, useEffect } from 'react';
import { useCanvasStore } from '../../stores/canvasStore';
import type { CanvasItem } from '../../types';
import type { NoteViewMode } from '../../hooks/useNoteViewMode';
import MarkdownPreview from './MarkdownPreview';

export default function NotesEditor({
  item,
  mode = 'edit',
}: {
  item: CanvasItem;
  mode?: NoteViewMode;
}) {
  const updateItem = useCanvasStore((s) => s.updateItem);
  const [content, setContent] = useState(item.noteContent || '');

  // Sync from store on item change
  useEffect(() => {
    setContent(item.noteContent || '');
  }, [item.id, item.noteContent]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    updateItem(item.id, { noteContent: val });
  }, [item.id, updateItem]);

  return (
    <div className="h-full flex flex-col bg-canvas-bg p-4">
      {mode === 'preview' ? (
        <MarkdownPreview content={content} />
      ) : (
        <textarea
          value={content}
          onChange={handleChange}
          placeholder="Type your notes here..."
          autoFocus
          className="flex-1 w-full bg-canvas-surface border border-canvas-border rounded-lg p-3 text-sm text-canvas-text placeholder-canvas-muted resize-none focus:outline-none focus:border-canvas-accent font-mono"
        />
      )}
    </div>
  );
}
