import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import {
  Plus, Edit2, Trash2, X, Server, Monitor, Globe, Database,
  RefreshCw, Play, Square, FileText, Copy, Check, AlertCircle,
  ChevronDown, ChevronUp, Cpu, Network, Settings
} from 'lucide-react';

interface KannelConfig {
  id: string;
  name: string;
  mode: 'CLIENT' | 'SERVER';
  component: 'BEARERBOX' | 'SMSBOX' | 'SMPPBOX' | 'SQLBOX';
  protocol: 'SMPP' | 'HTTP';
  host: string;
  port: number;
  username: string;
  password: string;
  systemType?: string;
  tps: number;
  status: 'ACTIVE' | 'INACTIVE';
  bindStatus: string;
  bindError?: string;
  bearerboxHost?: string;
  bearerboxPort?: number;
  sqlboxDbHost?: string;
  sqlboxDbPort?: number;
  sqlboxDbName?: string;
  sqlboxDbUser?: string;
  sqlboxDbPass?: string;
  kannelConf?: string;
}

const COMPONENT_INFO: Record<string, { color: string; icon: any; desc: string }> = {
  BEARERBOX: { color: 'text-accent-red', icon: Cpu, desc: 'Main routing engine. Routes messages between SMPPBox and SMSC suppliers.' },
  SMPPBOX:   { color: 'text-primary', icon: Server, desc: 'SMPP server. Accepts connections from external clients on port 2775.' },
  SQLBOX:    { color: 'text-accent-green', icon: Database, desc: 'Database integration. Logs all MO/MT messages to MySQL.' },
  SMSBOX:    { color: 'text-accent-yellow', icon: Globe, desc: 'Application gateway. HTTP/SMPP send interface.' },
};

const emptyForm: Partial<KannelConfig> = {
  name: '', mode: 'SERVER', component: 'SMPPBOX', protocol: 'SMPP',
  host: '0.0.0.0', port: 2775, username: '', password: '',
  systemType: 'VMA', tps: 100, status: 'ACTIVE',
  bearerboxHost: '127.0.0.1', bearerboxPort: 13001,
  sqlboxDbHost: 'localhost', sqlboxDbPort: 3306,
  sqlboxDbName: 'smpp_gateway', sqlboxDbUser: 'smpp_user', sqlboxDbPass: ''
};

export default function Kannel() {
  const [configs, setConfigs] = useState<KannelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<KannelConfig | null>(null);
  const [form, setForm] = useState<Partial<KannelConfig>>(emptyForm);
  const [activeTab, setActiveTab] = useState<'configs' | 'fullconf' | 'services' | 'architecture'>('configs');
  const [fullConf, setFullConf] = useState('');
  const [loadingConf, setLoadingConf] = useState(false);
  const [copied, setCopied] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<Record<string, string>>({});
  const [expandedConf, setExpandedConf] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get('/kannel');
      setConfigs(data);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const loadServices = useCallback(async () => {
    try {
      const data = await api.get('/kannel/status/services');
      setServiceStatus(data);
    } catch {}
  }, []);

  useEffect(() => { load(); loadServices(); }, [load, loadServices]);

  const openNew = () => {
    setEditing(null); setForm({ ...emptyForm }); setShowModal(true);
  };
  const openEdit = (c: KannelConfig) => {
    setEditing(c); setForm({ ...c }); setShowModal(true);
  };

  const save = async () => {
    if (!form.name || !form.host) {
      setError('Name and host are required'); return;
    }
    try {
      setSaving(true);
      if (editing) {
        const updated = await api.put(`/kannel/${editing.id}`, form);
        setConfigs(p => p.map(c => c.id === editing.id ? updated : c));
      } else {
        const created = await api.post('/kannel', form);
        setConfigs(p => [...p, created]);
      }
      setShowModal(false); setError('');
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const deleteConfig = async (id: string) => {
    if (!confirm('Delete this config?')) return;
    try {
      await api.delete(`/kannel/${id}`);
      setConfigs(p => p.filter(c => c.id !== id));
    } catch (e: any) { setError(e.message); }
  };

  const generateFullConf = async () => {
    try {
      setLoadingConf(true);
      const data = await api.get('/kannel/generate/full');
      setFullConf(data.conf);
    } catch (e: any) { setError(e.message); }
    finally { setLoadingConf(false); }
  };

  const applyConf = async () => {
    try {
      const result = await api.post('/kannel/apply', { conf: fullConf, filename: 'kannel.conf' });
      alert(`Config applied to: ${result.path}`);
    } catch (e: any) { setError(e.message); }
  };

  const restartService = async (service: string) => {
    try {
      await api.post('/kannel/restart', { service });
      setTimeout(loadServices, 2000);
    } catch (e: any) { setError(e.message); }
  };

  const copyConf = () => {
    navigator.clipboard.writeText(fullConf);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const viewConf = async (id: string) => {
    if (expandedConf === id) { setExpandedConf(null); return; }
    setExpandedConf(id);
  };

  const by = (component: string) => configs.filter(c => c.component === component);

  const statusColor = (s: string) => {
    if (s === 'active' || s === 'ACTIVE') return 'text-green-400';
    if (s === 'inactive' || s === 'INACTIVE') return 'text-gray-400';
    return 'text-red-400';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Kannel Integration</h1>
          <p className="text-text-secondary text-sm">Configure BearerBox, SMPPBox, SQLBox, SMSBox — client &amp; server modes</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition">
          <Plus size={16} /> Add Config
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface rounded-lg p-1 w-fit">
        {[
          { id: 'configs', label: 'Configs', icon: Settings },
          { id: 'architecture', label: 'Architecture', icon: Network },
          { id: 'fullconf', label: 'Generate Config', icon: FileText },
          { id: 'services', label: 'Services', icon: Cpu },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition
              ${activeTab === id ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ==================== ARCHITECTURE TAB ==================== */}
      {activeTab === 'architecture' && (
        <div className="bg-card border border-card-border rounded-xl p-6 space-y-6">
          <h3 className="text-base font-semibold text-text-primary">SMPP Flow Architecture</h3>

          {/* Flow Diagram */}
          <div className="overflow-x-auto">
            <div className="min-w-[700px] flex items-start gap-2 justify-center py-4">
              {[
                { label: 'External Client', sub: 'IP: *.*.*.* Port: 2775', color: 'border-blue-500 bg-blue-500/10', text: 'text-blue-400', icon: Monitor },
                null,
                { label: 'SMPPBox', sub: 'Port 2775 (Server Mode)', color: 'border-primary bg-primary/10', text: 'text-primary', icon: Server },
                null,
                { label: 'BearerBox', sub: 'Routing Engine', color: 'border-red-400 bg-red-400/10', text: 'text-red-400', icon: Cpu },
                null,
                { label: 'SQLBox', sub: 'MySQL Logging', color: 'border-green-400 bg-green-400/10', text: 'text-green-400', icon: Database },
                null,
                { label: 'External Operator', sub: 'IP: *.*.*.* Port: 2775', color: 'border-yellow-400 bg-yellow-400/10', text: 'text-yellow-400', icon: Globe },
              ].map((node, i) => {
                if (!node) return (
                  <div key={i} className="flex flex-col items-center justify-center gap-1 mt-6">
                    <div className="w-12 h-0.5 bg-text-muted"></div>
                    <span className="text-[10px] text-text-muted">{i === 1 ? 'Step 1' : i === 3 ? 'Step 2' : i === 5 ? 'Step 3' : 'Step 4'}</span>
                  </div>
                );
                const Icon = node.icon;
                return (
                  <div key={i} className={`border-2 ${node.color} rounded-xl p-4 text-center min-w-[120px]`}>
                    <Icon size={24} className={`${node.text} mx-auto mb-2`} />
                    <div className={`text-xs font-semibold ${node.text}`}>{node.label}</div>
                    <div className="text-[10px] text-text-muted mt-1">{node.sub}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Component descriptions */}
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(COMPONENT_INFO).map(([name, info]) => {
              const Icon = info.icon;
              return (
                <div key={name} className="bg-surface rounded-lg p-4 flex gap-3">
                  <Icon size={20} className={info.color} />
                  <div>
                    <div className={`text-sm font-semibold ${info.color}`}>{name}</div>
                    <div className="text-xs text-text-secondary mt-0.5">{info.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Port reference */}
          <div className="bg-surface rounded-lg p-4">
            <div className="text-sm font-semibold text-text-primary mb-3">Port Reference</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { port: '2775', svc: 'SMPPBox (external client connections)', dir: 'inbound' },
                { port: '13000', svc: 'BearerBox Admin API', dir: 'internal' },
                { port: '13001', svc: 'BearerBox ↔ boxes (smsbox/smppbox/sqlbox)', dir: 'internal' },
                { port: '13013', svc: 'SMSBox HTTP send interface', dir: 'internal' },
                { port: '3001',  svc: 'SMPP Gateway Manager API', dir: 'inbound' },
                { port: '80',    svc: 'Nginx Web Panel (proxies to 3001)', dir: 'inbound' },
              ].map(({ port, svc, dir }) => (
                <div key={port} className="flex items-center gap-2">
                  <code className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{port}</code>
                  <span className="text-text-secondary flex-1">{svc}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${dir === 'inbound' ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'}`}>{dir}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== CONFIGS TAB ==================== */}
      {activeTab === 'configs' && (
        <div className="space-y-6">
          {loading ? (
            <div className="text-center py-12 text-text-muted">Loading...</div>
          ) : (
            Object.entries(COMPONENT_INFO).map(([component, info]) => {
              const clist = by(component);
              const Icon = info.icon;
              return (
                <div key={component}>
                  <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${info.color}`}>
                    <Icon size={16} /> {component} ({clist.length})
                  </h3>
                  {clist.length === 0 ? (
                    <div className="bg-card border border-dashed border-card-border rounded-xl p-6 text-center text-text-muted text-sm">
                      No {component} configs. <button onClick={openNew} className="text-primary hover:underline">Add one</button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {clist.map(c => (
                        <div key={c.id} className="bg-card border border-card-border rounded-xl p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-text-primary">{c.name}</h4>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-medium 
                                ${c.protocol === 'SMPP' ? 'bg-primary/20 text-primary' : 'bg-green-500/20 text-green-400'}`}>
                                {c.protocol}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-medium 
                                ${c.mode === 'SERVER' ? 'bg-blue-500/20 text-blue-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                {c.mode}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => viewConf(c.id)}
                                className="p-1 hover:bg-surface-light rounded text-text-muted hover:text-primary">
                                <FileText size={14} />
                              </button>
                              <button onClick={() => openEdit(c)}
                                className="p-1 hover:bg-surface-light rounded text-text-muted hover:text-primary">
                                <Edit2 size={14} />
                              </button>
                              <button onClick={() => deleteConfig(c.id)}
                                className="p-1 hover:bg-surface-light rounded text-text-muted hover:text-red-400">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <div className="space-y-1 text-xs text-text-secondary">
                            <div>Host: <code className="font-mono text-text-muted">{c.host}:{c.port}</code></div>
                            <div>User: <code className="font-mono text-text-muted">{c.username}</code></div>
                            <div>TPS: {c.tps}</div>
                            {c.bearerboxHost && <div>BearerBox: <code className="font-mono text-text-muted">{c.bearerboxHost}:{c.bearerboxPort}</code></div>}
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <span className={`text-xs flex items-center gap-1 ${c.bindStatus === 'BOUND' ? 'text-green-400' : c.bindStatus === 'ERROR' ? 'text-red-400' : 'text-gray-400'}`}>
                              <span className={`w-2 h-2 rounded-full ${c.bindStatus === 'BOUND' ? 'bg-green-400' : c.bindStatus === 'ERROR' ? 'bg-red-400' : 'bg-gray-400'}`}></span>
                              {c.bindStatus}
                            </span>
                            <span className={`text-xs ${c.status === 'ACTIVE' ? 'text-green-400' : 'text-gray-400'}`}>{c.status}</span>
                          </div>
                          {c.bindError && (
                            <div className="mt-1 text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1">{c.bindError}</div>
                          )}
                          {/* Expanded config */}
                          {expandedConf === c.id && c.kannelConf && (
                            <div className="mt-3 border-t border-card-border pt-3">
                              <pre className="text-[10px] text-text-muted bg-surface rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap">{c.kannelConf}</pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ==================== FULL CONFIG TAB ==================== */}
      {activeTab === 'fullconf' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={generateFullConf} disabled={loadingConf}
              className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50">
              {loadingConf ? <RefreshCw size={14} className="animate-spin" /> : <FileText size={14} />}
              Generate Full kannel.conf
            </button>
            {fullConf && (
              <>
                <button onClick={copyConf}
                  className="flex items-center gap-2 bg-surface hover:bg-surface-light border border-card-border px-4 py-2 rounded-lg text-sm text-text-primary transition">
                  {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button onClick={applyConf}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                  <Play size={14} /> Apply to /etc/kannel/
                </button>
              </>
            )}
          </div>

          {fullConf && (
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-card-border bg-surface">
                <span className="text-xs font-mono text-text-secondary">/etc/kannel/kannel.conf</span>
                <span className="text-xs text-text-muted">{fullConf.split('\n').length} lines</span>
              </div>
              <pre className="text-xs text-green-400 font-mono p-4 overflow-auto max-h-[60vh] bg-gray-950 whitespace-pre">{fullConf}</pre>
            </div>
          )}

          {!fullConf && (
            <div className="bg-card border border-dashed border-card-border rounded-xl p-12 text-center">
              <FileText size={32} className="text-text-muted mx-auto mb-3" />
              <p className="text-text-muted text-sm">Click "Generate Full kannel.conf" to create a complete Kannel configuration from all active configs, clients, and suppliers.</p>
            </div>
          )}
        </div>
      )}

      {/* ==================== SERVICES TAB ==================== */}
      {activeTab === 'services' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-text-secondary text-sm">Manage Kannel system services</p>
            <div className="flex gap-2">
              <button onClick={loadServices}
                className="flex items-center gap-2 bg-surface border border-card-border px-3 py-1.5 rounded-lg text-sm text-text-primary hover:bg-surface-light transition">
                <RefreshCw size={14} /> Refresh
              </button>
              <button onClick={() => restartService('all')}
                className="flex items-center gap-2 bg-red-500/20 border border-red-500/30 px-3 py-1.5 rounded-lg text-sm text-red-400 hover:bg-red-500/30 transition">
                <RefreshCw size={14} /> Restart All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {['bearerbox', 'smsbox', 'smppbox', 'sqlbox'].map(svc => {
              const status = serviceStatus[svc] || 'unknown';
              const isRunning = status === 'active';
              const info = { bearerbox: COMPONENT_INFO.BEARERBOX, smsbox: COMPONENT_INFO.SMSBOX, smppbox: COMPONENT_INFO.SMPPBOX, sqlbox: COMPONENT_INFO.SQLBOX }[svc];
              const Icon = info?.icon || Server;
              return (
                <div key={svc} className="bg-card border border-card-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isRunning ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                        <Icon size={18} className={isRunning ? 'text-green-400' : 'text-red-400'} />
                      </div>
                      <div>
                        <div className="font-medium text-text-primary capitalize">{svc}</div>
                        <div className={`text-xs ${statusColor(status)}`}>{status}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => restartService(svc)}
                        className="flex items-center gap-1 px-2 py-1 bg-surface border border-card-border rounded text-xs text-text-secondary hover:text-primary transition">
                        <RefreshCw size={12} /> Restart
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-text-muted">{info?.desc}</p>
                  <div className="mt-2 text-xs text-text-muted font-mono">
                    systemctl status {svc}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick commands */}
          <div className="bg-card border border-card-border rounded-xl p-4">
            <div className="text-sm font-semibold text-text-primary mb-3">Quick Commands</div>
            <div className="space-y-2">
              {[
                { cmd: 'systemctl status bearerbox smppbox sqlbox smsbox', desc: 'Check all kannel services' },
                { cmd: 'journalctl -fu bearerbox', desc: 'Live bearerbox logs' },
                { cmd: 'journalctl -fu smppbox', desc: 'Live smppbox logs' },
                { cmd: 'curl http://localhost:13000/status.html', desc: 'BearerBox admin status' },
                { cmd: `tail -f /var/log/kannel/bearerbox.log`, desc: 'BearerBox log' },
                { cmd: `tail -f /var/log/kannel/smppbox.log`, desc: 'SMPPBox log' },
              ].map(({ cmd, desc }) => (
                <div key={cmd} className="flex items-center gap-3">
                  <code className="text-xs font-mono text-green-400 bg-gray-950 px-2 py-1 rounded flex-1">{cmd}</code>
                  <span className="text-xs text-text-muted w-48 shrink-0">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL ==================== */}
      {showModal && (
        <div className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-card border border-card-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto slide-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-card-border sticky top-0 bg-card">
              <h3 className="font-semibold text-text-primary">{editing ? 'Edit' : 'Add'} Kannel Config</h3>
              <button onClick={() => setShowModal(false)} className="text-text-muted hover:text-text-primary"><X size={18} /></button>
            </div>

            <div className="p-4 space-y-4">
              {/* Name */}
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Config Name *</label>
                <input className="input-field w-full" placeholder="e.g. Main SMPPBox, Supplier A BearerBox"
                  value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>

              {/* Component + Mode */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Component</label>
                  <select className="input-field w-full" value={form.component}
                    onChange={e => setForm(p => ({ ...p, component: e.target.value as any }))}>
                    <option value="SMPPBOX">SMPPBox (SMPP Server)</option>
                    <option value="BEARERBOX">BearerBox (Router)</option>
                    <option value="SQLBOX">SQLBox (DB Logger)</option>
                    <option value="SMSBOX">SMSBox (App GW)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Mode</label>
                  <select className="input-field w-full" value={form.mode}
                    onChange={e => setForm(p => ({ ...p, mode: e.target.value as any }))}>
                    <option value="SERVER">Server (Accept connections)</option>
                    <option value="CLIENT">Client (Connect to external)</option>
                  </select>
                </div>
              </div>

              {/* Protocol + Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Protocol</label>
                  <select className="input-field w-full" value={form.protocol}
                    onChange={e => setForm(p => ({ ...p, protocol: e.target.value as any }))}>
                    <option value="SMPP">SMPP</option>
                    <option value="HTTP">HTTP</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Status</label>
                  <select className="input-field w-full" value={form.status}
                    onChange={e => setForm(p => ({ ...p, status: e.target.value as any }))}>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Host + Port */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-text-secondary mb-1 block">Host / Bind Address *</label>
                  <input className="input-field w-full" placeholder="0.0.0.0 or supplier.ip.address"
                    value={form.host || ''} onChange={e => setForm(p => ({ ...p, host: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Port</label>
                  <input type="number" className="input-field w-full"
                    value={form.port || ''} onChange={e => setForm(p => ({ ...p, port: +e.target.value }))} />
                </div>
              </div>

              {/* Credentials */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="text-xs text-text-secondary mb-1 block">Username</label>
                  <input className="input-field w-full" value={form.username || ''}
                    onChange={e => setForm(p => ({ ...p, username: e.target.value }))} />
                </div>
                <div className="col-span-1">
                  <label className="text-xs text-text-secondary mb-1 block">Password</label>
                  <input className="input-field w-full" value={form.password || ''}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">TPS</label>
                  <input type="number" className="input-field w-full"
                    value={form.tps || ''} onChange={e => setForm(p => ({ ...p, tps: +e.target.value }))} />
                </div>
              </div>

              {/* BearerBox connection (for non-bearerbox components) */}
              {form.component !== 'BEARERBOX' && (
                <div className="border border-card-border rounded-lg p-3 space-y-3">
                  <div className="text-xs font-semibold text-text-secondary">BearerBox Connection</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs text-text-secondary mb-1 block">BearerBox Host</label>
                      <input className="input-field w-full" placeholder="127.0.0.1"
                        value={form.bearerboxHost || '127.0.0.1'} onChange={e => setForm(p => ({ ...p, bearerboxHost: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary mb-1 block">Port</label>
                      <input type="number" className="input-field w-full"
                        value={form.bearerboxPort || 13001} onChange={e => setForm(p => ({ ...p, bearerboxPort: +e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}

              {/* SQLBox specific */}
              {form.component === 'SQLBOX' && (
                <div className="border border-card-border rounded-lg p-3 space-y-3">
                  <div className="text-xs font-semibold text-text-secondary">Database (MySQL/MariaDB)</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs text-text-secondary mb-1 block">DB Host</label>
                      <input className="input-field w-full" placeholder="localhost"
                        value={form.sqlboxDbHost || ''} onChange={e => setForm(p => ({ ...p, sqlboxDbHost: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary mb-1 block">DB Port</label>
                      <input type="number" className="input-field w-full"
                        value={form.sqlboxDbPort || 3306} onChange={e => setForm(p => ({ ...p, sqlboxDbPort: +e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-text-secondary mb-1 block">Database</label>
                      <input className="input-field w-full"
                        value={form.sqlboxDbName || ''} onChange={e => setForm(p => ({ ...p, sqlboxDbName: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary mb-1 block">DB User</label>
                      <input className="input-field w-full"
                        value={form.sqlboxDbUser || ''} onChange={e => setForm(p => ({ ...p, sqlboxDbUser: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary mb-1 block">DB Password</label>
                      <input type="password" className="input-field w-full"
                        value={form.sqlboxDbPass || ''} onChange={e => setForm(p => ({ ...p, sqlboxDbPass: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}

              {/* System Type (SMPP) */}
              {form.protocol === 'SMPP' && (
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">System Type (SMPP)</label>
                  <input className="input-field w-full" placeholder="VMA"
                    value={form.systemType || ''} onChange={e => setForm(p => ({ ...p, systemType: e.target.value }))} />
                </div>
              )}
            </div>

            {error && (
              <div className="mx-4 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-red-400 text-xs">{error}</div>
            )}

            <div className="flex gap-3 p-4 border-t border-card-border">
              <button onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 bg-surface border border-card-border rounded-lg text-sm text-text-primary hover:bg-surface-light transition">
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                className="flex-1 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-medium transition disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Config'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
