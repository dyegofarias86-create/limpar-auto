import { useEffect, useState } from 'react';
import { api } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';
import { Megaphone, TrendingUp, Wallet, Plus, X, Trash2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const BRL = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`;

export default function Marketing() {
  const { user } = useAuth();
  const [annual, setAnnual] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(0); // 0 = todos os meses
  const [selectedBudget, setSelectedBudget] = useState(null);
  const [requests, setRequests] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ description: '', amount: '', date: '' });
  // For leader: show all reps aggregate (no rep_id filter)
  // For rep: show only their own data
  const rid = user?.role === 'leader' ? '' : (user?.rep_id || '');

  async function load() {
    const repParam = rid ? `&rep_id=${rid}` : '';
    const monthParam = month > 0 ? `&month=${month}` : '';
    const [ann, bud] = await Promise.all([
      api.get(`/marketing/annual-summary?year=${year}${repParam}`),
      api.get(`/marketing?year=${year}${repParam}${monthParam}`)
    ]);
    setAnnual(ann.data);
    setBudgets(bud.data);
  }
  useEffect(() => { load(); }, [year, month]);

  async function resetBudgets() {
    if (!window.confirm('Zerar todas as Verbas Geradas e Disponíveis? Essa ação será revertida ao fazer upload da planilha.')) return;
    await api.post('/marketing/reset-budgets');
    load();
  }

  async function loadRequests(id) {
    const r = await api.get(`/marketing/${id}/requests`);
    setRequests(r.data);
    setSelectedBudget(id);
  }

  async function handleRequest() {
    await api.post(`/marketing/${selectedBudget}/request`, { ...form, amount: parseFloat(form.amount) });
    setShowModal(false);
    setForm({ description: '', amount: '', date: '' });
    load();
    loadRequests(selectedBudget);
  }

  const totalTMO = annual.reduce((a, b) => a + b.tmo, 0);
  const totalBudget = annual.reduce((a, b) => a + b.total, 0);
  const totalUsed = annual.reduce((a, b) => a + b.used, 0);
  const totalAvail = annual.reduce((a, b) => a + b.available, 0);

  const selectedEntry = budgets.find(b => b.id === selectedBudget);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Verba de Marketing</h1>
          <p className="text-gray-500 text-sm">Controle de verba MKT (R$ 0,25 por TMO)</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select className="input w-auto" value={month} onChange={e => { setMonth(+e.target.value); setSelectedBudget(null); }}>
            <option value={0}>Todos os meses</option>
            {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((m, i) => (
              <option key={i+1} value={i+1}>{m}</option>
            ))}
          </select>
          <select className="input w-auto" value={year} onChange={e => { setYear(+e.target.value); setSelectedBudget(null); }}>
            {[2024,2025,2026].map(y => <option key={y}>{y}</option>)}
          </select>
          {user?.role === 'leader' && (
            <button
              className="text-sm px-3 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-1.5 font-medium"
              onClick={resetBudgets}
              title="Zerar todas as verbas geradas e disponíveis"
            >
              <Trash2 size={14} /> Zerar Verbas
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'TMO Total Anual', value: Number(totalTMO).toLocaleString('pt-BR'), color: '#0D4F5C', icon: TrendingUp },
          { label: 'Verba Gerada', value: BRL(totalBudget), color: '#00AEEF', icon: Megaphone },
          { label: 'Verba Utilizada', value: BRL(totalUsed), color: '#ef4444', icon: Wallet },
          { label: 'Verba Disponível', value: BRL(totalAvail), color: '#10b981', icon: Wallet },
        ].map(k => (
          <div key={k.label} className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: k.color + '15' }}>
              <k.icon size={18} style={{ color: k.color }} />
            </div>
            <div>
              <div className="text-xs text-gray-500">{k.label}</div>
              <div className="text-lg font-bold text-gray-900">{k.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Annual chart */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-800 mb-4">Verba Mensal {year}</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={annual} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={v => BRL(v)} />
            <Bar dataKey="total" name="Verba Gerada" fill="#00AEEF" radius={[4,4,0,0]} />
            <Bar dataKey="used" name="Utilizada" fill="#ef444466" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly table */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Detalhe Mensal — Clique para ver solicitações</h3>
        </div>
        <div className="overflow-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="table-header">Mês</th>
                <th className="table-header text-right">TMO</th>
                <th className="table-header text-right">Verba Gerada</th>
                <th className="table-header text-right">Utilizada</th>
                <th className="table-header text-right">Disponível</th>
                <th className="table-header text-right">% Uso</th>
                <th className="table-header"></th>
              </tr>
            </thead>
            <tbody>
              {budgets.map(row => (
                <tr key={row.id}
                  className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${selectedBudget === row.id ? 'bg-primary-50' : ''}`}
                  onClick={() => loadRequests(row.id)}
                >
                  <td className="table-cell font-medium">
                    {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][row.month-1]}/{row.year}
                  </td>
                  <td className="table-cell text-right">{Number(row.tmo_qty).toLocaleString('pt-BR')}</td>
                  <td className="table-cell text-right font-semibold">{BRL(row.total_budget)}</td>
                  <td className="table-cell text-right text-red-600">{BRL(row.used_budget)}</td>
                  <td className="table-cell text-right font-bold text-green-600">{BRL(row.available_budget)}</td>
                  <td className="table-cell text-right">
                    <span className={`badge-${row.total_budget > 0 ? (row.used_budget/row.total_budget > 0.7 ? 'warning' : 'success') : 'info'}`}>
                      {row.total_budget > 0 ? `${(row.used_budget/row.total_budget*100).toFixed(0)}%` : '0%'}
                    </span>
                  </td>
                  <td className="table-cell">
                    {selectedBudget === row.id && (
                      <button onClick={e => { e.stopPropagation(); setShowModal(true); }} className="text-xs btn-primary py-1 px-2">
                        <Plus size={12} /> Solicitar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Requests list */}
      {selectedBudget && requests.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-3">Solicitações — {selectedEntry ? `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][selectedEntry.month-1]}/${selectedEntry.year}` : ''}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="table-header">Descrição</th>
                <th className="table-header">Data</th>
                <th className="table-header text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="table-cell">{r.description}</td>
                  <td className="table-cell text-gray-500">{r.date || '-'}</td>
                  <td className="table-cell text-right font-semibold text-red-600">{BRL(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg">Solicitar Verba MKT</h3>
              <button onClick={() => setShowModal(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            {selectedEntry && (
              <div className="bg-primary-50 rounded-lg p-3 mb-4 text-sm">
                Disponível: <span className="font-bold text-primary-600">{BRL(selectedEntry.available_budget)}</span>
              </div>
            )}
            <div className="space-y-3">
              <div><label className="label">Descrição</label><input className="input" value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))} /></div>
              <div><label className="label">Valor (R$)</label><input type="number" className="input" value={form.amount} onChange={e => setForm(v => ({ ...v, amount: e.target.value }))} min="0.01" step="0.01" /></div>
              <div><label className="label">Data</label><input type="date" className="input" value={form.date} onChange={e => setForm(v => ({ ...v, date: e.target.value }))} /></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button className="btn-secondary flex-1 justify-center" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-primary flex-1 justify-center" onClick={handleRequest}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
