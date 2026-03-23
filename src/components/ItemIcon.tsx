import { Terminal, FolderOpen, StickyNote, MapPin } from 'lucide-react';
import { getTerminalStatusMeta, PROCESS_STATUS_THEME, type ProcessStatus, type AiAgent } from './ProcessIndicator';
import ClaudeIcon from './icons/ClaudeIcon';
import CodexIcon from './icons/CodexIcon';
import type { CanvasItem } from '../types';

const ICONS = {
  terminal: Terminal,
  filebrowser: FolderOpen,
  notes: StickyNote,
  anchor: MapPin,
};

function AiIcon({ agent, status, size }: { agent: AiAgent; status: ProcessStatus; size: number }) {
  const cls = status === 'ai-busy' ? 'text-orange-400 animate-pulse' : 'text-green-400';
  if (agent === 'claude') return <ClaudeIcon size={size} className={cls} />;
  if (agent === 'codex') return <CodexIcon size={size} className={cls} />;
  return null;
}

export default function ItemIcon({ item, size = 24 }: { item: CanvasItem; size?: number }) {
  const Icon = ICONS[item.type];
  const terminalMeta = item.type === 'terminal'
    ? getTerminalStatusMeta(item.ptyAlive, item.ptyProcesses, item.aiStatus)
    : null;

  const boxPx = size * 2;

  return (
    <div className={`rounded-lg bg-canvas-surface border flex items-center justify-center transition-colors relative ${
      terminalMeta ? PROCESS_STATUS_THEME[terminalMeta.status].borderClass : 'border-canvas-border hover:border-canvas-accent'
    }`} style={{ width: boxPx, height: boxPx }}>
      {terminalMeta?.aiAgent ? (
        <AiIcon agent={terminalMeta.aiAgent} status={terminalMeta.status} size={size} />
      ) : (
        <Icon size={size} className="text-canvas-accent" />
      )}
      {item.type === 'terminal' && item.ptyId && terminalMeta && (
        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-canvas-bg ${PROCESS_STATUS_THEME[terminalMeta.status].dotClass}`} />
      )}
    </div>
  );
}
