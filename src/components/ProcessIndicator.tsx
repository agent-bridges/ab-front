import type { ProcessInfo } from '../types';

const AI_COMMANDS = new Set(['claude', 'codex', 'aider', 'cursor']);

export type AiAgent = 'claude' | 'codex' | 'aider' | 'cursor' | null;

export function getRunningAiAgent(processes?: ProcessInfo[]): AiAgent {
  if (!processes) return null;
  const ai = processes.find((p) => AI_COMMANDS.has(p.cmd));
  return ai ? (ai.cmd as AiAgent) : null;
}

export type ProcessStatus = 'ai-busy' | 'ai-idle' | 'busy' | 'idle' | 'dead';

export const PROCESS_STATUS_THEME: Record<
  ProcessStatus,
  {
    dotClass: string;
    borderClass: string;
    minimapItemClass: string;
    minimapWindowClass: string;
  }
> = {
  'ai-busy': {
    dotClass: 'bg-orange-400 animate-pulse',
    borderClass: 'border-orange-400/60',
    minimapItemClass: 'border-orange-400/70 bg-orange-400/35',
    minimapWindowClass: 'border-orange-300/60 bg-orange-300/12',
  },
  'ai-idle': {
    dotClass: 'bg-green-400',
    borderClass: 'border-green-400/60',
    minimapItemClass: 'border-green-400/70 bg-green-400/35',
    minimapWindowClass: 'border-green-300/55 bg-green-300/12',
  },
  'busy': {
    dotClass: 'bg-blue-400 animate-pulse',
    borderClass: 'border-blue-400/60',
    minimapItemClass: 'border-blue-400/70 bg-blue-400/35',
    minimapWindowClass: 'border-blue-300/55 bg-blue-300/12',
  },
  'idle': {
    dotClass: 'bg-green-400',
    borderClass: 'border-canvas-border hover:border-canvas-accent',
    minimapItemClass: 'border-canvas-accent/40 bg-canvas-accent/30',
    minimapWindowClass: 'border-canvas-text/35 bg-canvas-text/10',
  },
  'dead': {
    dotClass: 'bg-neutral-500',
    borderClass: 'border-canvas-border',
    minimapItemClass: 'border-neutral-500/50 bg-neutral-500/20',
    minimapWindowClass: 'border-neutral-500/35 bg-neutral-500/8',
  },
};

/** Determine status using aiStatus from hooks (preferred) + process list fallback */
export function getProcessStatus(alive?: boolean, processes?: ProcessInfo[], aiStatus?: string): ProcessStatus {
  if (!alive) return 'dead';

  const ai = processes?.find((p) => AI_COMMANDS.has(p.cmd));

  // If we have hook-based AI status, use it
  if (ai && aiStatus) {
    if (aiStatus === 'idle') return 'ai-idle';
    return 'ai-busy'; // "working", "tool:Bash", etc.
  }

  // Fallback to process-based detection
  if (ai) return 'ai-idle'; // AI running but no hook status = assume idle
  if (processes && processes.length > 0) return 'busy';
  return 'idle';
}

export function getActiveProcessName(processes?: ProcessInfo[]): string | null {
  if (!processes || processes.length === 0) return null;
  const ai = processes.find((p) => AI_COMMANDS.has(p.cmd));
  return ai ? ai.cmd : processes[0].cmd;
}

/** Get current tool name from aiStatus (e.g. "tool:Bash" → "Bash") */
export function getCurrentTool(aiStatus?: string): string | null {
  if (!aiStatus?.startsWith('tool:')) return null;
  return aiStatus.slice(5);
}

export interface TerminalStatusMeta {
  status: ProcessStatus;
  aiAgent: AiAgent;
  activeProcessName: string | null;
  currentTool: string | null;
}

export function getTerminalStatusMeta(alive?: boolean, processes?: ProcessInfo[], aiStatus?: string): TerminalStatusMeta {
  return {
    status: getProcessStatus(alive, processes, aiStatus),
    aiAgent: getRunningAiAgent(processes),
    activeProcessName: getActiveProcessName(processes),
    currentTool: getCurrentTool(aiStatus),
  };
}

export function getTerminalStatusDetail(meta: TerminalStatusMeta): { className: string; text: string } | null {
  if (meta.status === 'ai-busy' && meta.activeProcessName) {
    return {
      className: 'text-orange-400 ml-1',
      text: `- ${meta.activeProcessName}${meta.currentTool ? ` -> ${meta.currentTool}` : ' working'}`,
    };
  }
  if (meta.status === 'ai-idle' && meta.activeProcessName) {
    return {
      className: 'text-green-400 ml-1',
      text: `- ${meta.activeProcessName} ready`,
    };
  }
  if (meta.status === 'busy' && meta.activeProcessName) {
    return {
      className: 'text-canvas-muted ml-1',
      text: `- ${meta.activeProcessName}`,
    };
  }
  return null;
}
