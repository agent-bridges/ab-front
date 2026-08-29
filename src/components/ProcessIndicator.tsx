import type { ProcessInfo } from '../types';

const AI_COMMANDS = new Set(['claude', 'codex', 'aider', 'cursor']);

export type AiAgent = 'claude' | 'codex' | 'aider' | 'cursor' | null;

export function getRunningAiAgent(processes?: ProcessInfo[]): AiAgent {
  if (!processes) return null;
  const ai = processes.find((p) => AI_COMMANDS.has(p.cmd));
  return ai ? (ai.cmd as AiAgent) : null;
}

export type ProcessStatus = 'ai-busy' | 'ai-idle' | 'busy' | 'idle' | 'dead' | 'unknown';

export const PROCESS_STATUS_THEME: Record<
  ProcessStatus,
  {
    dotClass: string;
    borderClass: string;
  }
> = {
  'ai-busy': {
    dotClass: 'bg-orange-400 animate-pulse',
    borderClass: 'border-orange-400/60',
  },
  'ai-idle': {
    dotClass: 'bg-green-400',
    borderClass: 'border-green-400/60',
  },
  'busy': {
    dotClass: 'bg-blue-400 animate-pulse',
    borderClass: 'border-blue-400/60',
  },
  'idle': {
    dotClass: 'bg-green-400',
    borderClass: 'border-canvas-border hover:border-canvas-accent',
  },
  'dead': {
    dotClass: 'bg-neutral-500',
    borderClass: 'border-canvas-border',
  },
  'unknown': {
    dotClass: 'bg-neutral-500',
    borderClass: 'border-canvas-border',
  },
};

/** Determine status only from authoritative liveness, process, and hook state. */
export function getProcessStatus(alive?: boolean, processes?: ProcessInfo[], aiStatus?: string): ProcessStatus {
  if (alive === false) return 'dead';
  if (alive !== true || processes === undefined) return 'unknown';

  const ai = processes?.find((p) => AI_COMMANDS.has(p.cmd));

  // If we have hook-based AI status, use it
  if (ai && aiStatus) {
    if (aiStatus === 'idle') return 'ai-idle';
    return 'ai-busy'; // "working", "tool:Bash", etc.
  }

  if (ai) return 'unknown';
  if (processes.length > 0) return 'busy';
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
