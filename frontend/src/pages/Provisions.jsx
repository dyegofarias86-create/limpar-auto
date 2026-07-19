import { useEffect, useState, useCallback } from 'react';
import { api } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';
import { DollarSign, TrendingDown, ArrowDownCircle, X, RotateCcw, Lock, Users, ChevronDown } from 'lucide-react';
import MultiSelect from '../components/MultiSelect';

const BRL = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

/* ─── Modal de retirada ─── */
function WithdrawModal({ provision, onConfirm, onClose }) {
  const [form, setForm] = useState({ amount: '', description: '', date: '' });
  const [err, setErr] = useState('');

  function handleSubmit() {
    setErr('');
    if (!form.amount || parseFloat(form.amount) <= 0) return setErr('Informe um valor válido.');
    if (parseFloat(form.amount) > provision.current_balance) return setErr('Valor maior que o saldo disponível.');
    if (!form.date) return setErr('Informe a data.');
    onConfirm({ ...form, amount: parseFloat(form.amount) });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-lg">Solicitar Retirada</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
          <div className="font-medium text-gray-800">{provision.store_name}</div>
          <div className="text-gray-500 mt-0.5">Saldo disponível: <span className="font-bold text-green-600">{BRL(provision.current_balance)}</span></div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">Valor (R$)</label>
            <input type="number" className="input" value={form.amount} onChange={e => setForm(v => ({ ...v, amount: e.target.value }))} max={provision.current_balance} min="0.01" step="0.01" />
          </div>
          <div>
            <label className="label">Descrição</label>
            <input type="text" className="input" value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))} placeholder="Motivo da retirada" />
          </div>
          <div>
            <label className="label">Data</label>
            <input type="date" className="input" value={form.date} onChange={e => setForm(v => ({ ...v, date: e.target.value }))} />
          </div>
        </div>
        {err && <p className="text-red-500 text-xs mt-2">{err}</p>}
        <div className="flex gap-3 mt-5">
          <button className="btn-secondary flex-1 justify-center" onClick={onClose}>Cancelar</button>
          <button className="btn-primary flex-1 justify-center" onClick={handleSubmit}>Confirmar Retirada</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Modal de reversão (senha de líder) ─── */
function ReverseModal({ withdrawal, onConfirm, onClose }) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setErr('');
    if (!password) return setErr('Informe a senha de líder.');
    setLoading(true);
    try {
      await onConfirm(password);
    } catch (e) {
      setErr(e.message || 'Erro ao reverter');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Lock size={18} className="text-amber-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Reversão de Retirada</h3>
            <p className="text-xs text-gray-500">Autorização de líder obrigatória</p>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
          Reverter <strong>{BRL(withdrawal.amount)}</strong> de {withdrawal.store_name || withdrawal.client_id}
        </div>
        <div>
          <label className="label flex items-center gap-1"><Lock size={12} /> Senha do Líder</label>
          <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && handleSubmit()} autoFocus />
        </div>
        {err && <p className="text-red-500 text-xs mt-2">{err}</p>}
        <div className="flex gap-3 mt-5">
          <button className="btn-secondary flex-1 justify-center" onClick={onClose}>Cancelar</button>
          <button className="btn-primary flex-1 justify-center" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Verificando...' : 'Confirmar Reversão'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Página Principal ─── */
export default function Provisions() {
  const { user } = useAuth();
  const isLeader = user?.role === 'leader';

  const [data, setSummaryData]   = useState([]);
  const [byRep, setByRep]        = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [reps, setReps]          = useState([]);
  const [clients, setClients]    = useState([]);
  const [groups, setGroups]      = useState([]);

  const [period, setPeriod]      = useState({ month: 6, year: 2026 });
  const [filters, setFilters]    = useState({ rep_id: '', client_id: '', group_name: '' });

  const [withdrawModal, setWithdrawModal] = useState(null);
  const [reverseModal, setReverseModal]   = useState(null);
  const [activeTab, setActiveTab]         = useState('lojas'); // 'lojas' | 'grupos' | 'representantes' | 'historico'

  const rid = filters.rep_id || (user?.role === 'representative' ? user.rep_id : null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({
      month: period.month, year: period.year,
      ...(rid         ? { rep_id:     rid }              : {}),
      ...(filters.client_id   ? { client_id: filters.client_id }   : {}),
      ...(filters.group_name  ? { group_name: filters.group_name }  : {}),
    }).toString();

    const [prov, sum, rep, wds] = await Promise.all([
      api.get(`/provisions?${qs}`),
      api.get(`/provisions/summary?month=${period.month}&year=${period.year}${rid ? `&rep_id=${rid}` : ''}`),
      api.get(`/provisions/by-rep?month=${period.month}&year=${period.year}`),
      api.get(`/provisions/withdrawals?month=${period.month}&year=${period.year}${rid ? `&rep_id=${rid}` : ''}`),
    ]);
    setSummaryData(prov.data);
    setByRep(rep.data);
    setWithdrawals(wds.data);

    // Distinct groups from loaded data
    const gs = [...new Set(prov.data.map(r => r.group_name))].sort();
    setGroups(gs);
  }, [period, filters, rid]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/representatives').then(r => setReps(r.data)).catch(() => {});
    api.get('/clients').then(r => setClients(r.data)).catch(() => {});
  }, []);

  async function handleWithdraw(form) {
    await api.post('/provisions/withdraw', {
      provision_id:      withdrawModal.id,
      representative_id: withdrawModal.representative_id,
      client_id:         withdrawModal.client_id,
      description:       form.description,
      amount:            form.amount,
      date:              form.date,
    });
    setWithdrawModal(null);
    load();
  }

  async function handleReverse(password) {
    try {
      await api.post(`/provisions/withdraw/${reverseModal.id}/reverse`, { password });
      setReverseModal(null);
      load();
    } catch (e) {
      throw new Error(e.response?.data?.error || 'Erro ao reverter');
    }
  }

  const totals = byRep.reduce((a, r) => ({
    prov_mes:  a.prov_mes  + r.prov_mes,
    prov_total: a.prov_total + r.prov_total,
    retiradas: a.retiradas  + r.retiradas,
    saldo_atual: a.saldo_atual + r.saldo_atual,
  }), { prov_mes: 0, prov_total: 0, retiradas: 0, saldo_atual: 0 });

  const summaryByGroup = Object.values(
    data.reduce((acc, row) => {
      if (!acc[row.group_name]) acc[row.group_name] = { group_name: row.group_name, prov_mes: 0, prov_total: 0, retiradas: 0, saldo_atual: 0 };
      acc[row.group_name].prov_mes   += row.monthly_provision;
      acc[row.group_name].prov_total += row.total_provision;
      acc[row.group_name].retiradas  += row.withdrawn;
      acc[row.group_name].saldo_atual += row.current_balance;
      return acc;
    }, {})
  ).sort((a, b) => b.prov_total - a.prov_total);

  const TABS = [
    { id: 'lojas', label: 'Por Loja' },
    { id: 'grupos', label: 'Por Grupo' },
    { id: 'representantes', label: 'Por Representante' },
    { id: 'historico', label: 'Histórico' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Provisões</h1>
          <p className="text-gray-500 text-sm">Provisão por cliente, grupo e representante</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select className="input w-auto" value={period.month} onChange={e => setPeriod(v => ({ ...v, month: +e.target.value }))}>
            {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select className="input w-auto" value={period.year} onChange={e => setPeriod(v => ({ ...v, year: +e.target.value }))}>
            {[2024,2025,2026].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Filtros Multi-select */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label text-xs">Representante</label>
          <MultiSelect
            options={reps.map(r => ({ value: String(r.id), label: r.name }))}
            selected={filters.rep_ids || (filters.rep_id ? [filters.rep_id] : [])}
            onChange={vals => setFilters(v => ({ ...v, rep_ids: vals, rep_id: vals.length === 1 ? vals[0] : '' }))}
            placeholder="Todos"
            allLabel="Todos"
            className="w-48"
          />
        </div>
        <div>
          <label className="label text-xs">Grupo</label>
          <MultiSelect
            options={groups}
            selected={filters.group_names || (filters.group_name ? [filters.group_name] : [])}
            onChange={vals => setFilters(v => ({ ...v, group_names: vals, group_name: vals.length === 1 ? vals[0] : '' }))}
            placeholder="Todos"
            allLabel="Todos"
            className="w-40"
          />
        </div>
        <div>
          <label className="label text-xs">Cliente</label>
          <select className="input w-52 text-sm" value={filters.client_id} onChange={e => setFilters(v => ({ ...v, client_id: e.target.value }))}>
            <option value="">Todos</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.store_name}</option>)}
          </select>
        </div>
        <button className="btn-secondary text-sm py-1.5" onClick={() => setFilters({ rep_id: '', rep_ids: [], client_id: '', group_name: '', group_names: [] })}>
          Limpar
        </button>
      </div>

      {/* KPIs Totais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Provisão do Mês', value: BRL(totals.prov_mes), color: '#00AEEF', icon: DollarSign },
          { label: 'Provisão Total', value: BRL(totals.prov_total), color: '#0D4F5C', icon: DollarSign },
          { label: 'Total Retirado', value: BRL(totals.retiradas), color: '#ef4444', icon: TrendingDown },
          { label: 'Saldo Atual', value: BRL(totals.saldo_atual), color: '#10b981', icon: DollarSign },
        ].map(k => (
          <div key={k.label} className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: k.color + '18' }}>
              <k.icon size={18} style={{ color: k.color }} />
            </div>
            <div>
              <div className="text-xs text-gray-500">{k.label}</div>
              <div className="text-lg font-bold text-gray-900">{k.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="card overflow-hidden">
        <div className="flex border-b border-gray-100">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary-50 text-primary-600 border-b-2 border-primary-500'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Por Loja */}
        {activeTab === 'lojas' && (
          <div className="overflow-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="table-header">Loja</th>
                  <th className="table-header">Grupo</th>
                  <th className="table-header">Rep.</th>
                  <th className="table-header text-right">TMO</th>
                  <th className="table-header text-right">R$/TMO</th>
                  <th className="table-header text-right">Prov. Mês</th>
                  <th className="table-header text-right">Saldo Ant.</th>
                  <th className="table-header text-right">Total</th>
                  <th className="table-header text-right">Retirado</th>
                  <th className="table-header text-right">Saldo</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={11} className="table-cell text-center text-gray-400 py-8">Nenhum dado encontrado</td></tr>
                ) : data.map(row => (
                  <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="table-cell font-medium text-gray-800 max-w-[160px] truncate">{row.store_name}</td>
                    <td className="table-cell"><span className="badge-info text-xs">{row.group_name}</span></td>
                    <td className="table-cell text-xs text-gray-500">{row.rep_name}</td>
                    <td className="table-cell text-right">{Number(row.tmo_qty).toLocaleString('pt-BR')}</td>
                    <td className="table-cell text-right text-gray-500">{BRL(row.provision_per_tmo)}</td>
                    <td className="table-cell text-right">{BRL(row.monthly_provision)}</td>
                    <td className="table-cell text-right text-gray-500">{BRL(row.previous_balance)}</td>
                    <td className="table-cell text-right font-semibold">{BRL(row.total_provision)}</td>
                    <td className="table-cell text-right text-red-600">{BRL(row.withdrawn)}</td>
                    <td className="table-cell text-right font-bold text-green-600">{BRL(row.current_balance)}</td>
                    <td className="table-cell">
                      {row.current_balance > 0 && (
                        <button onClick={() => setWithdrawModal(row)} className="text-xs bg-teal-50 text-teal-700 hover:bg-teal-100 px-2 py-1 rounded-md font-medium flex items-center gap-1">
                          <ArrowDownCircle size={12} /> Retirar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Por Grupo */}
        {activeTab === 'grupos' && (
          <div className="overflow-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="table-header">Grupo</th>
                  <th className="table-header text-right">Prov. Mês</th>
                  <th className="table-header text-right">Total</th>
                  <th className="table-header text-right">Retirado</th>
                  <th className="table-header text-right">Saldo Atual</th>
                  <th className="table-header text-right">% Retirado</th>
                </tr>
              </thead>
              <tbody>
                {summaryByGroup.map(row => (
                  <tr key={row.group_name} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="table-cell font-semibold">{row.group_name}</td>
                    <td className="table-cell text-right">{BRL(row.prov_mes)}</td>
                    <td className="table-cell text-right font-semibold">{BRL(row.prov_total)}</td>
                    <td className="table-cell text-right text-red-600">{BRL(row.retiradas)}</td>
                    <td className="table-cell text-right font-bold text-green-600">{BRL(row.saldo_atual)}</td>
                    <td className="table-cell text-right">
                      <span className={`badge-${row.prov_total > 0 && row.retiradas/row.prov_total > 0.5 ? 'warning' : 'success'}`}>
                        {row.prov_total > 0 ? `${(row.retiradas/row.prov_total*100).toFixed(1)}%` : '0%'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Por Representante */}
        {activeTab === 'representantes' && (
          <div className="overflow-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="table-header flex items-center gap-1"><Users size={12}/> Representante</th>
                  <th className="table-header text-right">Prov. Mês</th>
                  <th className="table-header text-right">Total</th>
                  <th className="table-header text-right">Retirado</th>
                  <th className="table-header text-right">Saldo Atual</th>
                </tr>
              </thead>
              <tbody>
                {byRep.length === 0 ? (
                  <tr><td colSpan={5} className="table-cell text-center text-gray-400 py-8">Sem dados</td></tr>
                ) : byRep.map(row => (
                  <tr key={row.rep_name} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="table-cell font-semibold text-gray-800">{row.rep_name}</td>
                    <td className="table-cell text-right">{BRL(row.prov_mes)}</td>
                    <td className="table-cell text-right font-semibold">{BRL(row.prov_total)}</td>
                    <td className="table-cell text-right text-red-600">{BRL(row.retiradas)}</td>
                    <td className="table-cell text-right font-bold text-green-600">{BRL(row.saldo_atual)}</td>
                  </tr>
                ))}
                {byRep.length > 0 && (
                  <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                    <td className="table-cell text-gray-700">TOTAL</td>
                    <td className="table-cell text-right">{BRL(totals.prov_mes)}</td>
                    <td className="table-cell text-right">{BRL(totals.prov_total)}</td>
                    <td className="table-cell text-right text-red-600">{BRL(totals.retiradas)}</td>
                    <td className="table-cell text-right text-green-600">{BRL(totals.saldo_atual)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Histórico de retiradas */}
        {activeTab === 'historico' && (
          <div className="overflow-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="table-header">Loja/Grupo</th>
                  <th className="table-header">Descrição</th>
                  <th className="table-header">Data</th>
                  <th className="table-header text-right">Valor</th>
                  <th className="table-header text-center">Status</th>
                  {isLeader && <th className="table-header"></th>}
                </tr>
              </thead>
              <tbody>
                {withdrawals.length === 0 ? (
                  <tr><td colSpan={6} className="table-cell text-center text-gray-400 py-8">Nenhuma retirada registrada</td></tr>
                ) : withdrawals.map(wd => (
                  <tr key={wd.id} className={`border-b border-gray-50 ${wd.reversed ? 'opacity-50 bg-gray-50' : 'hover:bg-gray-50'}`}>
                    <td className="table-cell">
                      <div className="font-medium text-gray-800 text-sm">{wd.store_name || '—'}</div>
                      <div className="text-xs text-gray-400">{wd.group_name}</div>
                    </td>
                    <td className="table-cell text-gray-600 text-sm">{wd.description || '—'}</td>
                    <td className="table-cell text-gray-500 text-sm">{wd.date || '—'}</td>
                    <td className="table-cell text-right font-bold text-red-600">{BRL(wd.amount)}</td>
                    <td className="table-cell text-center">
                      {wd.reversed
                        ? <span className="badge-warning">Revertida</span>
                        : <span className="badge-success">Realizada</span>}
                    </td>
                    {isLeader && (
                      <td className="table-cell">
                        {!wd.reversed && (
                          <button
                            onClick={() => setReverseModal(wd)}
                            className="text-xs flex items-center gap-1 text-amber-600 hover:text-amber-800 hover:bg-amber-50 px-2 py-1 rounded-md font-medium"
                          >
                            <RotateCcw size={12} /> Reverter
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {withdrawModal && (
        <WithdrawModal provision={withdrawModal} onConfirm={handleWithdraw} onClose={() => setWithdrawModal(null)} />
      )}
      {reverseModal && (
        <ReverseModal withdrawal={reverseModal} onConfirm={handleReverse} onClose={() => setReverseModal(null)} />
      )}
    </div>
  );
}
