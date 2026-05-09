import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import {
  DollarSign, TrendingUp, TrendingDown, FileText, Plus, RefreshCw,
  Download, Eye, Check, X, AlertCircle, CreditCard, Calendar, Filter
} from 'lucide-react';

interface BillingSummary {
  clients: any[];
  todayRevenue: number; todayCost: number; todayProfit: number;
  monthRevenue: number; monthCost: number; monthProfit: number;
  pendingInvoicesTotal: number; pendingInvoicesCount: number;
}

interface Invoice {
  id: string; number: string; period: string; totalMessages: number;
  amount: number; tax: number; total: number; currency: string;
  status: string; dueDate: string; paidDate?: string;
  client: { name: string; email: string; company?: string };
}

interface Transaction {
  id: string; type: string; amount: number; balance: number;
  description: string; reference?: string; createdAt: string;
  client: { name: string; currency: string };
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:   'bg-yellow-500/20 text-yellow-400',
  PAID:      'bg-green-500/20 text-green-400',
  OVERDUE:   'bg-red-500/20 text-red-400',
  CANCELLED: 'bg-gray-500/20 text-gray-400',
};

const TYPE_COLORS: Record<string, string> = {
  CREDIT:     'text-green-400',
  DEBIT:      'text-red-400',
  INVOICE:    'text-blue-400',
  REFUND:     'text-yellow-400',
  ADJUSTMENT: 'text-purple-400',
};

export default function Billing() {
  const [tab, setTab] = useState<'overview' | 'invoices' | 'transactions'>('overview');
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenModal, setShowGenModal] = useState(false);
  const [showAddTxnModal, setShowAddTxnModal] = useState(false);
  const [error, setError] = useState('');

  const [genForm, setGenForm] = useState({
    clientId: '', startDate: '', endDate: '',
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    taxRate: 5, notes: ''
  });
  const [txnForm, setTxnForm] = useState({
    clientId: '', type: 'CREDIT', amount: '', description: '', reference: ''
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [sum, inv, txn, cls] = await Promise.all([
        api.get('/billing/summary'),
        api.get('/billing/invoices?limit=100'),
        api.get('/billing/transactions?limit=100'),
        api.get('/clients')
      ]);
      setSummary(sum);
      setInvoices(inv.invoices || []);
      setTransactions(txn.transactions || []);
      setClients(cls);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const generateInvoice = async () => {
    if (!genForm.clientId || !genForm.startDate || !genForm.endDate) {
      setError('Client, start date, end date required'); return;
    }
    try {
      await api.post('/billing/invoices/generate', genForm);
      setShowGenModal(false);
      load();
    } catch (e: any) { setError(e.message); }
  };

  const addTransaction = async () => {
    if (!txnForm.clientId || !txnForm.amount) {
      setError('Client and amount required'); return;
    }
    try {
      await api.post('/billing/transactions', { ...txnForm, amount: parseFloat(txnForm.amount) });
      setShowAddTxnModal(false);
      load();
    } catch (e: any) { setError(e.message); }
  };

  const updateInvoiceStatus = async (id: string, status: string) => {
    try {
      await api.put(`/billing/invoices/${id}/status`, { status });
      setInvoices(p => p.map(i => i.id === id ? { ...i, status } : i));
    } catch (e: any) { setError(e.message); }
  };

  const fmt = (n: number, currency = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n);

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Billing &amp; Finance</h1>
          <p className="text-text-secondary text-sm">Client balances, invoices, transactions and revenue reporting</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddTxnModal(true)}
            className="flex items-center gap-2 bg-surface border border-card-border px-3 py-2 rounded-lg text-sm text-text-primary hover:bg-surface-light transition">
            <CreditCard size={14} /> Add Transaction
          </button>
          <button onClick={() => setShowGenModal(true)}
            className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            <Plus size={14} /> Generate Invoice
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface rounded-lg p-1 w-fit">
        {['overview', 'invoices', 'transactions'].map(t => (
          <button key={t} onClick={() => setTab(t as any)}
            className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition
              ${tab === t ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ==================== OVERVIEW ==================== */}
      {tab === 'overview' && summary && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Today's Revenue", value: fmt(summary.todayRevenue), icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10' },
              { label: "Today's Cost",    value: fmt(summary.todayCost),    icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-500/10' },
              { label: "Today's Profit",  value: fmt(summary.todayProfit),  icon: DollarSign, color: 'text-primary', bg: 'bg-primary/10' },
              { label: 'Pending Invoices', value: fmt(summary.pendingInvoicesTotal), icon: FileText, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="bg-card border border-card-border rounded-xl p-4">
                <div className={`${bg} ${color} w-10 h-10 rounded-lg flex items-center justify-center mb-3`}>
                  <Icon size={20} />
                </div>
                <div className="text-2xl font-bold text-text-primary">{value}</div>
                <div className="text-xs text-text-secondary mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Month totals */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Month Revenue', value: summary.monthRevenue, color: 'text-green-400' },
              { label: 'Month Cost',    value: summary.monthCost,    color: 'text-red-400' },
              { label: 'Month Profit',  value: summary.monthProfit,  color: summary.monthProfit >= 0 ? 'text-primary' : 'text-red-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-card border border-card-border rounded-xl p-4 text-center">
                <div className={`text-xl font-bold ${color}`}>{fmt(value)}</div>
                <div className="text-xs text-text-secondary mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* Client Balances */}
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
              <h3 className="font-semibold text-text-primary text-sm">Client Balances</h3>
              <span className="text-xs text-text-muted">{summary.clients.length} clients</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-card-border bg-surface">
                    {['Client', 'Balance', 'Credit Limit', 'Currency', 'Status'].map(h => (
                      <th key={h} className="text-left px-4 py-2 text-xs text-text-secondary font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.clients.map((c: any) => (
                    <tr key={c.id} className="border-b border-card-border/50 hover:bg-surface/50">
                      <td className="px-4 py-3 font-medium text-text-primary">{c.name}</td>
                      <td className={`px-4 py-3 font-mono font-medium ${Number(c.balance) < 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {fmt(Number(c.balance), c.currency)}
                      </td>
                      <td className="px-4 py-3 font-mono text-text-secondary">{fmt(Number(c.creditLimit), c.currency)}</td>
                      <td className="px-4 py-3 text-text-muted">{c.currency}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${c.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== INVOICES ==================== */}
      {tab === 'invoices' && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border bg-surface">
                  {['Invoice #', 'Client', 'Period', 'Messages', 'Amount', 'Tax', 'Total', 'Due', 'Status', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-text-secondary font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} className="border-b border-card-border/50 hover:bg-surface/50">
                    <td className="px-4 py-3 font-mono text-primary text-xs">{inv.number}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{inv.client?.name}</div>
                      <div className="text-xs text-text-muted">{inv.client?.email}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">{inv.period}</td>
                    <td className="px-4 py-3 text-text-primary">{inv.totalMessages.toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-text-primary">{fmt(inv.amount, inv.currency)}</td>
                    <td className="px-4 py-3 font-mono text-text-secondary">{fmt(inv.tax, inv.currency)}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-text-primary">{fmt(inv.total, inv.currency)}</td>
                    <td className="px-4 py-3 text-xs text-text-muted">{fmtDate(inv.dueDate)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[inv.status] || ''}`}>{inv.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {inv.status === 'PENDING' && (
                          <button onClick={() => updateInvoiceStatus(inv.id, 'PAID')}
                            title="Mark Paid" className="p-1 hover:bg-green-500/10 rounded text-text-muted hover:text-green-400 transition">
                            <Check size={14} />
                          </button>
                        )}
                        <button title="Download PDF"
                          className="p-1 hover:bg-surface-light rounded text-text-muted hover:text-primary transition">
                          <Download size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr><td colSpan={10} className="text-center py-12 text-text-muted">No invoices yet. Generate one from the top button.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== TRANSACTIONS ==================== */}
      {tab === 'transactions' && (
        <div className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border bg-surface">
                  {['Date', 'Client', 'Type', 'Amount', 'Balance After', 'Description', 'Reference'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-text-secondary font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id} className="border-b border-card-border/50 hover:bg-surface/50">
                    <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">{fmtDate(t.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-text-primary">{t.client?.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${TYPE_COLORS[t.type] || ''}`}>{t.type}</span>
                    </td>
                    <td className={`px-4 py-3 font-mono font-medium ${['CREDIT','REFUND'].includes(t.type) ? 'text-green-400' : 'text-red-400'}`}>
                      {['CREDIT','REFUND'].includes(t.type) ? '+' : '-'}{fmt(t.amount, t.client?.currency)}
                    </td>
                    <td className="px-4 py-3 font-mono text-text-secondary">{fmt(t.balance, t.client?.currency)}</td>
                    <td className="px-4 py-3 text-text-secondary text-xs">{t.description}</td>
                    <td className="px-4 py-3 text-text-muted text-xs font-mono">{t.reference || '-'}</td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-12 text-text-muted">No transactions yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== GENERATE INVOICE MODAL ==================== */}
      {showGenModal && (
        <div className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center p-4" onClick={() => setShowGenModal(false)}>
          <div className="bg-card border border-card-border rounded-xl w-full max-w-md slide-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-card-border">
              <h3 className="font-semibold text-text-primary">Generate Invoice</h3>
              <button onClick={() => setShowGenModal(false)}><X size={18} className="text-text-muted" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Client *</label>
                <select className="input-field w-full" value={genForm.clientId}
                  onChange={e => setGenForm(p => ({ ...p, clientId: e.target.value }))}>
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Start Date *</label>
                  <input type="date" className="input-field w-full" value={genForm.startDate}
                    onChange={e => setGenForm(p => ({ ...p, startDate: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">End Date *</label>
                  <input type="date" className="input-field w-full" value={genForm.endDate}
                    onChange={e => setGenForm(p => ({ ...p, endDate: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Due Date</label>
                  <input type="date" className="input-field w-full" value={genForm.dueDate}
                    onChange={e => setGenForm(p => ({ ...p, dueDate: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Tax Rate (%)</label>
                  <input type="number" className="input-field w-full" value={genForm.taxRate}
                    onChange={e => setGenForm(p => ({ ...p, taxRate: +e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Notes</label>
                <textarea className="input-field w-full h-16 resize-none" value={genForm.notes}
                  onChange={e => setGenForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 p-4 border-t border-card-border">
              <button onClick={() => setShowGenModal(false)}
                className="flex-1 px-4 py-2 bg-surface border border-card-border rounded-lg text-sm">Cancel</button>
              <button onClick={generateInvoice}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium">Generate</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== ADD TRANSACTION MODAL ==================== */}
      {showAddTxnModal && (
        <div className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center p-4" onClick={() => setShowAddTxnModal(false)}>
          <div className="bg-card border border-card-border rounded-xl w-full max-w-md slide-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-card-border">
              <h3 className="font-semibold text-text-primary">Add Transaction</h3>
              <button onClick={() => setShowAddTxnModal(false)}><X size={18} className="text-text-muted" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Client *</label>
                <select className="input-field w-full" value={txnForm.clientId}
                  onChange={e => setTxnForm(p => ({ ...p, clientId: e.target.value }))}>
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Type</label>
                  <select className="input-field w-full" value={txnForm.type}
                    onChange={e => setTxnForm(p => ({ ...p, type: e.target.value }))}>
                    {['CREDIT','DEBIT','REFUND','ADJUSTMENT'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Amount *</label>
                  <input type="number" step="0.01" className="input-field w-full" placeholder="0.00"
                    value={txnForm.amount} onChange={e => setTxnForm(p => ({ ...p, amount: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Description *</label>
                <input className="input-field w-full" placeholder="e.g. Top-up, Manual credit"
                  value={txnForm.description} onChange={e => setTxnForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Reference</label>
                <input className="input-field w-full" placeholder="e.g. bank transfer ref"
                  value={txnForm.reference} onChange={e => setTxnForm(p => ({ ...p, reference: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 p-4 border-t border-card-border">
              <button onClick={() => setShowAddTxnModal(false)}
                className="flex-1 px-4 py-2 bg-surface border border-card-border rounded-lg text-sm">Cancel</button>
              <button onClick={addTransaction}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium">Add Transaction</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
