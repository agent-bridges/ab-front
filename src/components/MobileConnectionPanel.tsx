import { useEffect, useState } from 'react';
import { ChevronRight, Plus, Trash2, Wifi, WifiOff, X, Save, Eye, EyeOff } from 'lucide-react';
import {
  checkPtyDaemon,
  createAgent,
  deleteAgent,
  fetchAgent,
  type AgentDetail,
  updateAgent,
} from '../api/agents';
import { useAgentStore } from '../stores/agentStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface FormState {
  name: string;
  ip: string;
  jwt_key: string;
}

const EMPTY: FormState = { name: '', ip: '', jwt_key: '' };

export default function MobileConnectionPanel({ open, onClose }: Props) {
  const { agents, loadAgents, setCurrentAgent, refreshCurrentAgentBoard } = useAgentStore();
  const [editId, setEditId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [jwtVisible, setJwtVisible] = useState(false);

  // Load agent detail when editing
  useEffect(() => {
    if (!editId || editId === 'new') {
      setForm(EMPTY);
      setError('');
      setTestResult(null);
      return;
    }
    let cancelled = false;
    fetchAgent(editId).then((detail) => {
      if (cancelled) return;
      setForm({ name: detail.name || '', ip: detail.ip || '', jwt_key: detail.jwt_key || '' });
    });
    return () => { cancelled = true; };
  }, [editId]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.ip.trim()) {
      setError('Name and address required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editId === 'new') {
        const created = await createAgent(form.name.trim(), form.ip.trim(), form.jwt_key.trim() || undefined);
        await loadAgents();
        if (created?.id) setCurrentAgent(created.id);
      } else if (editId) {
        await updateAgent(editId, { name: form.name.trim(), ip: form.ip.trim(), jwt_key: form.jwt_key.trim() || undefined });
        await loadAgents();
        refreshCurrentAgentBoard();
      }
      setEditId(null);
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const ok = await checkPtyDaemon(form.ip.trim(), form.jwt_key.trim() || undefined);
      setTestResult(ok ? 'Connected' : 'Failed');
    } catch {
      setTestResult('Failed');
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteAgent(id);
    await loadAgents();
    setEditId(null);
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-[90]" onClick={onClose} />

      {/* Main panel — slides from right */}
      <div className="fixed top-0 right-0 bottom-0 w-[280px] bg-canvas-surface border-l border-canvas-border z-[91] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-canvas-border">
          <span className="text-sm font-semibold text-canvas-text">Connections</span>
          <button onClick={onClose} className="p-1 hover:bg-canvas-border rounded">
            <X size={16} className="text-canvas-muted" />
          </button>
        </div>

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setEditId(agent.id)}
              className="w-full flex items-center gap-2 px-3 py-3 border-b border-canvas-border hover:bg-canvas-border/50 text-left"
            >
              <div className={`w-2 h-2 rounded-full ${agent.pty_info ? 'bg-green-500' : 'bg-canvas-muted'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-canvas-text truncate">{agent.name}</div>
                <div className="text-[10px] text-canvas-muted truncate">{agent.ip}</div>
              </div>
              <ChevronRight size={14} className="text-canvas-muted shrink-0" />
            </button>
          ))}
        </div>

        {/* Add button */}
        <button
          onClick={() => setEditId('new')}
          className="flex items-center gap-2 p-3 border-t border-canvas-border hover:bg-canvas-border/50"
        >
          <Plus size={16} className="text-canvas-accent" />
          <span className="text-xs text-canvas-accent font-semibold">Add connection</span>
        </button>
      </div>

      {/* Edit panel — second layer, slides from right on top */}
      {editId !== null && (
        <>
          <div className="fixed inset-0 z-[92]" onClick={() => setEditId(null)} />
          <div className="fixed top-0 right-0 bottom-0 w-[300px] bg-canvas-bg border-l border-canvas-border z-[93] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-canvas-border">
              <span className="text-sm font-semibold text-canvas-text">
                {editId === 'new' ? 'New Connection' : 'Edit Connection'}
              </span>
              <button onClick={() => setEditId(null)} className="p-1 hover:bg-canvas-border rounded">
                <X size={16} className="text-canvas-muted" />
              </button>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div>
                <label className="text-[10px] text-canvas-muted uppercase tracking-wider">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="my-server"
                  className="w-full bg-canvas-surface border border-canvas-border rounded px-2 py-1.5 text-xs text-canvas-text mt-1 outline-none focus:border-canvas-accent"
                />
              </div>
              <div>
                <label className="text-[10px] text-canvas-muted uppercase tracking-wider">Address (host:port)</label>
                <input
                  value={form.ip}
                  onChange={(e) => setForm({ ...form, ip: e.target.value })}
                  placeholder="10.0.1.5:8421"
                  className="w-full bg-canvas-surface border border-canvas-border rounded px-2 py-1.5 text-xs text-canvas-text mt-1 outline-none focus:border-canvas-accent"
                />
              </div>
              <div>
                <label className="text-[10px] text-canvas-muted uppercase tracking-wider">JWT Key (optional)</label>
                <div className="relative mt-1">
                  <input
                    type={jwtVisible ? 'text' : 'password'}
                    value={form.jwt_key}
                    onChange={(e) => setForm({ ...form, jwt_key: e.target.value })}
                    placeholder="eyJ..."
                    className="w-full bg-canvas-surface border border-canvas-border rounded px-2 py-1.5 text-xs text-canvas-text outline-none focus:border-canvas-accent pr-8"
                  />
                  <button
                    onClick={() => setJwtVisible(!jwtVisible)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5"
                  >
                    {jwtVisible ? <EyeOff size={12} className="text-canvas-muted" /> : <Eye size={12} className="text-canvas-muted" />}
                  </button>
                </div>
              </div>

              {error && <div className="text-xs text-red-400">{error}</div>}
              {testResult && (
                <div className={`text-xs ${testResult === 'Connected' ? 'text-green-400' : 'text-red-400'}`}>
                  {testResult === 'Connected' ? '✓' : '✗'} {testResult}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-3 border-t border-canvas-border space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={handleTest}
                  disabled={testing || !form.ip.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded text-xs border border-canvas-border hover:bg-canvas-border disabled:opacity-30"
                >
                  {testing ? <WifiOff size={12} className="animate-pulse" /> : <Wifi size={12} />}
                  <span className="text-canvas-text">Test</span>
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded text-xs bg-canvas-accent/20 border border-canvas-accent hover:bg-canvas-accent/30 disabled:opacity-30"
                >
                  <Save size={12} className="text-canvas-accent" />
                  <span className="text-canvas-accent font-semibold">Save</span>
                </button>
              </div>
              {editId !== 'new' && (
                <button
                  onClick={() => handleDelete(editId!)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded text-xs border border-red-500/30 hover:bg-red-500/10"
                >
                  <Trash2 size={12} className="text-red-400" />
                  <span className="text-red-400">Delete</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
