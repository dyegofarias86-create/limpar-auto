import { useEffect, useState } from 'react';
import { api } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2, X, Filter } from 'lucide-react';
import MultiSelect from '../components/MultiSelect';

const BRL = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Categorias exatas da planilha (GASTOS REP + GASTOS VEND + REEMBOLSO)
const CATEGORIES_REP = [
  'Refeição (viagem)',
  'Hotel',
  'Combustível',
  'Aluguel Veículo',
  'Balsa',
  'Pedágio',
  'Outros',
];

const CATEGORIES_SELLER = [
  'Aluguel Veículo',
  'Refeição (base)',
  'Refeição (viagem)',
  'Combustível',
  'Hotel',
  'Balsa',
  'Outros',
];

const CATEGORIES_REIMBURSEMENT = [
  'Aluguel Carro',
  'Combustível',
  'Pedágio',
  'Passagem Aérea/Terrestre/Aquática',
  'Uber/Táxi',
  'Alimentação',
  'Hospedagem',
  'Comercial',
  'Bonificação',
  'Implantações',
  'Insumos',
  'Equipamentos',
  'Manutenção Máquinas',
  'Gráfica',
  'Outros',
];

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function getCategoriesForType(type) {
  if (type === 'representative') return CATEGORIES_REP;
  if (type === 'seller')         return CATEGORIES_SELLER;
  if (type === 'reimbursement')  return CATEGORIES_REIMBURSEMENT;
  return CATEGORIES_REP;
}

export default function Expenses() {
  const { user } = useAuth();
  const [data, setData]        = useState([]);
  const [summary, setSummary]  = useState([]);
  const [reps, setReps]        = useState([]);
  const [period, setPeriod]    = useState({ month: 6, year: 2026 });
  const [filterRep, setFilterRep] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    type: 'representative', category: 'Refeição (viagem)', description: '',
    amount: '', week: '', destination: '', representative_id: '',
  });

  const rid = filterRep || (user?.role === 'representative' ? user.rep_id : '');

  async function load() {
    const qs = new URLSearchParams({
      month: period.month, year: period.year,
      ...(rid        ? { rep_id: rid }             : {}),
      ...(filterType ? { type: filterType }        : {}),
    }).toString();
    const [exp, sum] = await Promise.all([
      api.get(`/expenses?${qs}`),
      api.get(`/expenses/summary?month=${period.month}&year=${period.year}${rid ? `&rep_id=${rid}` : ''}`),
    ]);
    setData(exp.data);
    setSummary(sum.data);
  }
  useEffect(() => { load(); }, [period, filterRep, filterType]);

  useEffect(() => {
    if (user?.role === 'leader') {
      api.get('/representatives').then(r => setReps(r.data)).catch(() => {});
    }
  }, []);

  const categories = getCategoriesForType(form.type);

  async function handleAdd() {
    const repId = form.representative_id || user?.rep_id || reps[0]?.id || 1;
    await api.post('/expenses', {
      ...form,
      amount: parseFloat(form.amount),
      month:  period.month,
      year:   period.year,
      representative_id: repId,
      seller_id: form.type === 'seller' ? (user.seller_id || null) : null,
    });
    setShowModal(false);
    setForm({ type: 'representative', category: 'Refeição (viagem)', description: '', amount: '', week: '', destination: '', representative_id: '' });
    load();
  }

  async function handleDelete(id) {
    if (!confirm('Remover este gasto?')) return;
    await api.delete(`/expenses/${id}`);
    load();
  }

  const TYPE_LABELS = { representative: 'Representante', seller: 'Vendedor', reimbursement: 'Reembolso' };
  const repTotal    = data.filter(e => e.type === 'representative').reduce((a, b) => a + b.amount, 0);
  const sellerTotal = data.filter(e => e.type === 'seller').reduce((a, b) => a + b.amount, 0);
  const reimburTotal = data.filter(e => e.type === 'reimbursement').reduce((a, b) => a + b.amount, 0);
  const total       = repTotal + sellerTotal + reimburTotal;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gastos</h1>
          <p className="text-gray-500 text-sm">Previsão de gastos de representantes, vendedores e reembolsos</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {user?.role === 'leader' && (
            <MultiSelect
              options={reps.map(r => ({ value: String(r.id), label: r.name }))}
              selected={filterRep ? [filterRep] : []}
              onChange={v => setFilterRep(v.length === 1 ? v[0] : '')}
              placeholder="Todos os representantes"
              allLabel="Todos"
              className="w-48"
            />
          )}
          <select className="input w-36 text-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">Todos os tipos</option>
            <option value="representative">Representante</option>
            <option value="seller">Vendedor</option>
            <option value="reimbursement">Reembolso</option>
          </select>
          <select className="input w-auto" value={period.month} onChange={e => setPeriod(v => ({ ...v, month: +e.target.value }))}>
            {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select className="input w-auto" value={period.year} onChange={e => setPeriod(v => ({ ...v, year: +e.target.value }))}>
            {[2024,2025,2026].map(y => <option key={y}>{y}</option>)}
          </select>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Novo Gasto
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Representante', value: BRL(repTotal), color: '#0D4F5C' },
          { label: 'Vendedor', value: BRL(sellerTotal), color: '#00AEEF' },
          { label: 'Reembolso', value: BRL(reimburTotal), color: '#8b5cf6' },
          { label: 'Total', value: BRL(total), color: '#374151' },
        ].map(k => (
          <div key={k.label} className="card p-4 border-l-4" style={{ borderColor: k.color }}>
            <div className="text-xs text-gray-500">{k.label}</div>
            <div className="text-xl font-bold mt-0.5" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Resumo por categoria */}
      {summary.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-3 text-sm">Resumo por Categoria</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {summary.map(s => (
              <div key={`${s.category}-${s.type}`} className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 truncate">{s.category}</div>
                <div className="text-sm font-bold text-gray-800 mt-0.5">{BRL(s.total)}</div>
                <span className={s.type === 'representative' ? 'badge-teal text-xs' : s.type === 'seller' ? 'badge-info text-xs' : 'badge-warning text-xs'}>
                  {TYPE_LABELS[s.type] || s.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Lançamentos</h3>
          <span className="text-sm text-gray-500">{data.length} registros</span>
        </div>
        <div className="overflow-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="table-header">Tipo</th>
                <th className="table-header">Categoria</th>
                <th className="table-header">Descrição</th>
                <th className="table-header">Semana</th>
                <th className="table-header">Destino</th>
                {user?.role === 'leader' && <th className="table-header">Representante</th>}
                <th className="table-header text-right">Valor</th>
                <th className="table-header"></th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr><td colSpan={8} className="table-cell text-center text-gray-400 py-8">Nenhum gasto registrado</td></tr>
              ) : data.map(row => (
                <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="table-cell">
                    <span className={row.type === 'representative' ? 'badge-teal' : row.type === 'seller' ? 'badge-info' : 'badge-warning'}>
                      {TYPE_LABELS[row.type]}
                    </span>
                  </td>
                  <td className="table-cell font-medium">{row.category}</td>
                  <td className="table-cell text-gray-500">{row.description || '—'}</td>
                  <td className="table-cell text-gray-500">{row.week ? `Sem. ${row.week}` : '—'}</td>
                  <td className="table-cell text-gray-500">{row.destination || '—'}</td>
                  {user?.role === 'leader' && <td className="table-cell text-gray-500 text-xs">{row.rep_name}</td>}
                  <td className="table-cell text-right font-bold text-gray-800">{BRL(row.amount)}</td>
                  <td className="table-cell">
                    <button onClick={() => handleDelete(row.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg text-gray-900">Novo Gasto</h3>
              <button onClick={() => setShowModal(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              {user?.role === 'leader' && (
                <div>
                  <label className="label">Representante</label>
                  <select className="input" value={form.representative_id} onChange={e => setForm(v => ({ ...v, representative_id: e.target.value }))}>
                    <option value="">Selecionar...</option>
                    {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="label">Tipo</label>
                <select className="input" value={form.type}
                  onChange={e => setForm(v => ({ ...v, type: e.target.value, category: getCategoriesForType(e.target.value)[0] }))}>
                  <option value="representative">Representante</option>
                  <option value="seller">Vendedor</option>
                  <option value="reimbursement">Reembolso</option>
                </select>
              </div>
              <div>
                <label className="label">Categoria</label>
                <select className="input" value={form.category} onChange={e => setForm(v => ({ ...v, category: e.target.value }))}>
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Descrição</label>
                <input className="input" value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))} placeholder="Detalhe opcional" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Valor (R$)</label>
                  <input type="number" className="input" value={form.amount} onChange={e => setForm(v => ({ ...v, amount: e.target.value }))} placeholder="0,00" min="0" step="0.01" />
                </div>
                <div>
                  <label className="label">Semana</label>
                  <select className="input" value={form.week} onChange={e => setForm(v => ({ ...v, week: e.target.value }))}>
                    <option value="">—</option>
                    {[1,2,3,4,5].map(w => <option key={w}>{w}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Destino</label>
                <input className="input" value={form.destination} onChange={e => setForm(v => ({ ...v, destination: e.target.value }))} placeholder="Cidade / local" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button className="btn-secondary flex-1 justify-center" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-primary flex-1 justify-center" onClick={handleAdd}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
