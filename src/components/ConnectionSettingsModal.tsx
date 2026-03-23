import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Plus, RefreshCw, Save, Trash2, Wifi } from 'lucide-react';
import {
  checkPtyDaemon,
  createAgent,
  deleteAgent,
  fetchAgent,
  type AgentDetail,
  updateAgent,
} from '../api/agents';
import { useAgentStore } from '../stores/agentStore';
import ConfirmDialog from './dialogs/ConfirmDialog';
import DialogShell from './dialogs/DialogShell';

interface ConnectionSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

interface ConnectionFormState {
  name: string;
  ip: string;
  jwt_key: string;
}

const EMPTY_FORM: ConnectionFormState = {
  name: '',
  ip: '',
  jwt_key: '',
};

function normalizeForm(detail: AgentDetail): ConnectionFormState {
  return {
    name: detail.name || '',
    ip: detail.ip || '',
    jwt_key: detail.jwt_key || '',
  };
}

export default function ConnectionSettingsModal({ open, onClose }: ConnectionSettingsModalProps) {
  const { agents, currentAgentId, setCurrentAgent, refreshCurrentAgentBoard, loadAgents } = useAgentStore();
  const [selectedId, setSelectedId] = useState<string | 'new'>('new');
  const [selectedAgent, setSelectedAgent] = useState<AgentDetail | null>(null);
  const [form, setForm] = useState<ConnectionFormState>(EMPTY_FORM);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [jwtVisible, setJwtVisible] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const selectedSummary = useMemo(
    () => agents.find((agent) => agent.id === selectedId) || null,
    [agents, selectedId],
  );

  useEffect(() => {
    if (!open) return;
    const initialId = currentAgentId && agents.some((agent) => agent.id === currentAgentId)
      ? currentAgentId
      : (agents[0]?.id || 'new');
    setSelectedId((previous) => {
      if (previous !== 'new' && agents.some((agent) => agent.id === previous)) {
        return previous;
      }
      return initialId;
    });
  }, [open, currentAgentId, agents]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setStatus('');
    setJwtVisible(false);
    setDeleteConfirmOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (selectedId === 'new') {
      setSelectedAgent(null);
      setForm(EMPTY_FORM);
      setLoadingDetail(false);
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);
    setError('');
    setStatus('');

    void fetchAgent(selectedId)
      .then((detail) => {
        if (cancelled) return;
        setSelectedAgent(detail);
        setForm(normalizeForm(detail));
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load connection');
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, selectedId]);

  if (!open) return null;

  const isEditing = selectedId !== 'new';
  const canDelete = Boolean(isEditing && selectedAgent && !selectedAgent.is_local);

  const handleNew = () => {
    setSelectedId('new');
    setSelectedAgent(null);
    setForm(EMPTY_FORM);
    setError('');
    setStatus('');
  };

  const handleSave = async () => {
    const payload = {
      name: form.name.trim(),
      ip: form.ip.trim(),
      jwt_key: form.jwt_key.trim(),
    };

    if (!payload.name || !payload.ip || !payload.jwt_key) {
      setError('Name, daemon address, and JWT key are required.');
      return;
    }

    setSaving(true);
    setError('');
    setStatus('');
    try {
      if (selectedId === 'new') {
        const created = await createAgent(payload);
        await loadAgents();
        setCurrentAgent(created.id);
        setSelectedId(created.id);
        setStatus(`Connection "${created.name}" created.`);
      } else {
        await updateAgent(selectedId, payload);
        await loadAgents();
        setSelectedId(selectedId);
        if (currentAgentId === selectedId) {
          refreshCurrentAgentBoard();
        }
        setStatus(`Connection "${payload.name}" updated.`);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save connection');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!canDelete || selectedId === 'new') return;

    setDeleting(true);
    setError('');
    setStatus('');
    try {
      const label = selectedAgent?.name || selectedSummary?.name || 'this connection';
      await deleteAgent(selectedId);
      await loadAgents();
      const nextId = useAgentStore.getState().agents.find((agent) => agent.id !== selectedId)?.id || 'new';
      setSelectedId(nextId);
      if (nextId === 'new') {
        setSelectedAgent(null);
        setForm(EMPTY_FORM);
      }
      setStatus(`Connection "${label}" deleted.`);
      setDeleteConfirmOpen(false);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete connection');
    } finally {
      setDeleting(false);
    }
  };

  const handleTest = async () => {
    const address = form.ip.trim();
    const jwtKey = form.jwt_key.trim();
    if (!address || !jwtKey) {
      setError('Daemon address and JWT key are required to test a connection.');
      return;
    }

    setTesting(true);
    setError('');
    setStatus('');
    try {
      const result = await checkPtyDaemon(address, jwtKey);
      setStatus(result.message);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Failed to test connection');
    } finally {
      setTesting(false);
    }
  };

  const deleteTargetLabel = selectedAgent?.name || selectedSummary?.name || 'this connection';

  return (
    <>
      <DialogShell
        open={open}
        onClose={onClose}
        title="PTY daemon connections"
        description="Add, edit, and remove daemon endpoints."
        widthClassName="max-w-5xl"
        bodyClassName="p-0"
      >
        <div className="flex h-[min(80vh,680px)] w-full flex-col md:flex-row">
          <div className="flex w-full shrink-0 flex-col border-b border-canvas-border md:w-72 md:border-b-0 md:border-r">
            <div className="flex items-center justify-between gap-2 border-b border-canvas-border px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-canvas-text">PTY daemon connections</div>
                <div className="text-xs text-canvas-muted">Add, edit, and remove daemon endpoints.</div>
              </div>
              <button
                className="inline-flex items-center gap-1 rounded-md border border-canvas-border px-2 py-1 text-xs text-canvas-text hover:bg-canvas-border"
                onClick={handleNew}
                title="Add connection"
              >
                <Plus size={12} />
                New
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-canvas-bg/30">
              {agents.length === 0 ? (
                <div className="px-4 py-6 text-xs text-canvas-muted">No PTY daemon connections yet.</div>
              ) : (
                agents.map((agent) => {
                  const active = selectedId === agent.id;
                  return (
                    <button
                      key={agent.id}
                      className={`flex w-full flex-col gap-1 border-b border-canvas-border px-4 py-3 text-left transition-colors ${
                        active ? 'bg-canvas-border/70' : 'hover:bg-canvas-border/40'
                      }`}
                      onClick={() => setSelectedId(agent.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm text-canvas-text">{agent.name}</span>
                        {currentAgentId === agent.id && (
                          <span className="rounded border border-canvas-accent/30 bg-canvas-accent/10 px-1.5 py-0.5 text-[10px] text-canvas-accent">
                            current
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[11px] text-canvas-muted">{agent.ip}</div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-canvas-border px-5 py-4">
              <div>
                <div className="text-base font-semibold text-canvas-text">
                  {selectedId === 'new' ? 'New PTY daemon connection' : 'Edit PTY daemon connection'}
                </div>
                <div className="text-xs text-canvas-muted">
                  Use host or host:port for the daemon address. Default port is 8421.
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
              {loadingDetail ? (
                <div className="text-sm text-canvas-muted">Loading connection details...</div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-xs text-canvas-muted">Name</label>
                    <input
                      value={form.name}
                      onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="demo-agent-1"
                      className="w-full rounded-md border border-canvas-border bg-canvas-bg px-3 py-2 text-sm text-canvas-text outline-none focus:border-canvas-accent"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs text-canvas-muted">Daemon address</label>
                    <input
                      value={form.ip}
                      onChange={(event) => setForm((prev) => ({ ...prev, ip: event.target.value }))}
                      placeholder="10.0.0.12:8421"
                      className="w-full rounded-md border border-canvas-border bg-canvas-bg px-3 py-2 text-sm text-canvas-text outline-none focus:border-canvas-accent"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label className="block text-xs text-canvas-muted">JWT key</label>
                      <button
                        className="inline-flex items-center gap-1 rounded-md border border-canvas-border px-2 py-1 text-[11px] text-canvas-text hover:bg-canvas-border"
                        onClick={() => setJwtVisible((current) => !current)}
                        type="button"
                      >
                        {jwtVisible ? <EyeOff size={12} /> : <Eye size={12} />}
                        {jwtVisible ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {jwtVisible ? (
                      <textarea
                        value={form.jwt_key}
                        onChange={(event) => setForm((prev) => ({ ...prev, jwt_key: event.target.value }))}
                        placeholder="Paste onboarding JWT"
                        rows={7}
                        className="w-full rounded-md border border-canvas-border bg-canvas-bg px-3 py-2 text-sm text-canvas-text outline-none focus:border-canvas-accent"
                      />
                    ) : (
                      <div className="rounded-md border border-canvas-border bg-canvas-bg px-3 py-2 text-sm text-canvas-muted">
                        {form.jwt_key ? '••••••••••••••••••••••••••••••••' : 'No JWT key set'}
                      </div>
                    )}
                  </div>

                  {(error || status) && (
                    <div
                      className={`rounded-md px-3 py-2 text-xs ${
                        error
                          ? 'border border-red-500/30 bg-red-500/10 text-red-200'
                          : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                      }`}
                    >
                      {error || status}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-canvas-border px-5 py-4">
              <div className="text-[11px] text-canvas-muted">
                {selectedSummary?.pty_info ? 'Daemon info is available for this connection.' : 'No live daemon info loaded for this connection.'}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="inline-flex items-center gap-2 rounded-md border border-canvas-border px-3 py-2 text-xs text-canvas-text hover:bg-canvas-border disabled:opacity-50"
                  onClick={() => void handleTest()}
                  disabled={testing || saving || deleting || loadingDetail}
                >
                  {testing ? <RefreshCw size={14} className="animate-spin" /> : <Wifi size={14} />}
                  Test
                </button>
                {canDelete && (
                  <button
                    className="inline-flex items-center gap-2 rounded-md border border-red-500/30 px-3 py-2 text-xs text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                    onClick={() => setDeleteConfirmOpen(true)}
                    disabled={deleting || saving || testing || loadingDetail}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                )}
                <button
                  className="inline-flex items-center gap-2 rounded-md border border-canvas-border px-3 py-2 text-xs text-canvas-text hover:bg-canvas-border disabled:opacity-50"
                  onClick={() => void handleSave()}
                  disabled={saving || deleting || testing || loadingDetail}
                >
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                  {selectedId === 'new' ? 'Create' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </DialogShell>
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete connection"
        message={`Delete "${deleteTargetLabel}"?`}
        confirmLabel="Delete"
        confirmTone="danger"
        busy={deleting}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}
