import { useEffect, useState } from 'react';
import { api } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle, XCircle, TrendingUp, Search } from 'lucide-react';
import MultiSelect from '../components/MultiSelect';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const BRL = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`;
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

export default function Billing() {
  const { user } = useAuth();
  const [data, setData]         = useState([]);
  const [byProduct, setByProduct] = useState([]);
  const [reps, setReps]         = useState([]);
  const [groups, setGroups]     = useState([]);
  const [stores, setStores]     = useState([]);
  const [period, setPeriod]     = useState({ months: [7], year: 2026 });
  const [filters, setFilters]   = useState({ reps: [], groups: [], stores: [], search: '' });

  // For multi-rep filter: send first selected, else all
  const rid = filters.reps.length === 1 ? filters.reps[0] : (user?.role !== 'leader' ? user?.rep_id : null);

  async function load() {
    const monthParam = period.months.length > 1
      ? `months=${period.months.join(',')}`
      : `month=${period.months[0] || 7}`;
    const qs = new URLSearchParams({
      year: period.year,
      ...(rid ? { rep_id: rid } : {}),
    }).toString() + `&${monthParam}`;
    const [bil, prod] = await Promise.all([
      api.get(`/billing?${qs}`),
      api.get(`/billing/by-product?month=${period.month}&year=${period.year}`),
    ]);
    setData(bil.data);
    setByProduct(prod.data);

    // Build filter options from data
    setGroups([...new Set(bil.data.map(r => r.group_name).filter(Boolean))].sort());
    setStores([...new Set(bil.data.map(r => r.store_name).filter(Boolean))].sort());
  }

  useEffect(() => { load(); }, [period, filters.rep_id]);

  useEffect(() => {
    if (user?.role === 'leader') api.get('/representatives').then(r => setReps(r.data)).catch(() => {});
  }, []);

  // Apply client-side multi-select filters
  const filtered = data.filter(row => {
    const repOk  = filters.reps.length === 0   || filters.reps.includes(String(row.representative_id || ''));
    const grpOk  = filters.groups.length === 0 || filters.groups.includes(row.group_name);
    const stoOk  = filters.stores.length === 0 || filters.stores.includes(row.store_name);
    const qOk    = !filters.search || row.store_name?.toLowerCase().includes(filters.search.toLowerCase()) || row.group_name?.toLowerCase().includes(filters.search.toLowerCase());
    return repOk && grpOk && stoOk && qOk;
  });

  const totalTMO      = filtered.reduce((a, b) => a + (b.qty || 0), 0);
  const totalValue    = filtered.reduce((a, b) => a + (b.total || 0), 0);
  const uniqueClients = [...new Set(filtered.map(r => r.client_id || r.store_name))].length;

  async function toggleNF(id, issued, sent) {
    await api.patch(`/billing/${id}/nf`, { nf_issued: issued, nf_sent: sent });
    load();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faturamento</h1>
          <p className="text-gray-500 text-sm">Dyego, Ednilson, Arthur, Jackson, Wallace, Délio, Daniela, Otávio, BASE MG</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <MultiSelect
            options={MONTHS.map((m, i) => ({ value: String(i+1), label: m }))}
            selected={period.months.map(String)}
            onChange={v => setPeriod(p => ({ ...p, months: v.map(Number) }))}
            placeholder="Mês"
            allLabel="Todos"
            className="w-48"
          />
          <select className="input w-auto text-sm" value={period.year} onChange={e => setPeriod(v => ({ ...v, year: +e.target.value }))}>
            {[2025,2026,2027].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Filtros Multi-select */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        {user?.role === 'leader' && (
          <div>
            <label className="label text-xs">Representante</label>
            <MultiSelect
              options={reps.map(r => ({ value: String(r.id), label: r.name }))}
              selected={filters.reps}
              onChange={v => { setFilters(f => ({ ...f, reps: v })); }}
              placeholder="Todos os representantes"
              allLabel="Todos"
              className="w-52"
            />
          </div>
        )}
        <div>
          <label className="label text-xs">Grupo</label>
          <MultiSelect
            options={groups}
            selected={filters.groups}
            onChange={v => setFilters(f => ({ ...f, groups: v }))}
            placeholder="Todos os grupos"
            allLabel="Todos"
            className="w-44"
          />
        </div>
        <div>
          <label className="label text-xs">Loja</label>
          <MultiSelect
            options={stores}
            selected={filters.stores}
            onChange={v => setFilters(f => ({ ...f, stores: v }))}
            placeholder="Todas as lojas"
            allLabel="Todas"
            className="w-52"
          />
        </div>
        <div>
          <label className="label text-xs">Busca</label>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
            <input className="input pl-8 w-44 text-sm" placeholder="Loja ou grupo..."
              value={filters.search} onChange={e => setFilters(v => ({ ...v, search: e.target.value }))} />
          </div>
        </div>
        <button className="btn-secondary text-sm py-1.5" onClick={() => { setFilters({ reps: [], groups: [], stores: [], search: '' }); }}>
          Limpar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total TMO', value: Number(totalTMO).toLocaleString('pt-BR'), sub: 'serviços', color: '#0D4F5C' },
          { label: 'Faturamento', value: BRL(totalValue), sub: `${filtered.length} lojas`, color: '#00AEEF' },
          { label: 'Total Clientes', value: String(uniqueClients), sub: 'lojas ativas', color: '#0D4F5C' },
          { label: 'Ticket Médio', value: BRL(filtered.length ? totalValue / filtered.length : 0), sub: 'por loja', color: '#8b5cf6' },
        ].map(k => (
          <div key={k.label} className="card p-4">
            <div className="text-xs text-gray-500">{k.label}</div>
            <div className="text-2xl font-bold mt-1" style={{ color: k.color }}>{k.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      {byProduct.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-4 text-sm">TMO por Produto</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={byProduct} layout="vertical" margin={{ left: 90, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="product" tick={{ fontSize: 11 }} width={90} />
              <Tooltip formatter={v => [v, 'TMO']} />
              <Bar dataKey="tmo" fill="#00AEEF" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 text-sm">Detalhe por Loja</h3>
          <span className="text-xs text-gray-400">{filtered.length} registros</span>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {user?.role === 'leader' && <th className="table-header">Rep.</th>}
                <th className="table-header">Grupo</th>
                <th className="table-header">Loja</th>
                <th className="table-header">UF</th>
                <th className="table-header">Produto</th>
                <th className="table-header text-right">QTD</th>
                <th className="table-header text-right">R$/un</th>
                <th className="table-header text-right">Total</th>
                <th className="table-header text-center">NF</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="table-cell text-center text-gray-400 py-8">
                  Nenhum dado. Importe via "Sync Faturamento".
                </td></tr>
              ) : filtered.map(row => (
                <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50">
                  {user?.role === 'leader' && <td className="table-cell text-xs text-gray-500">{row.rep_name}</td>}
                  <td className="table-cell"><span className="badge-info text-xs">{row.group_name}</span></td>
                  <td className="table-cell font-medium text-gray-800 max-w-[150px] truncate">{row.store_name}</td>
                  <td className="table-cell text-gray-500">{row.state}</td>
                  <td className="table-cell">{row.product}</td>
                  <td className="table-cell text-right font-semibold">{Number(row.qty).toLocaleString('pt-BR')}</td>
                  <td className="table-cell text-right text-gray-500">{BRL(row.unit_price || 0)}</td>
                  <td className="table-cell text-right font-bold text-primary-600">{BRL(row.total)}</td>
                  <td className="table-cell text-center">
                    <button onClick={() => toggleNF(row.id, !row.nf_issued, row.nf_sent)}>
                      {row.nf_issued
                        ? <CheckCircle size={15} className="text-green-500 mx-auto" />
                        : <XCircle size={15} className="text-gray-300 mx-auto" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                  <td colSpan={user?.role === 'leader' ? 5 : 4} className="table-cell text-gray-700">TOTAL</td>
                  <td className="table-cell text-right">{Number(totalTMO).toLocaleString('pt-BR')}</td>
                  <td />
                  <td className="table-cell text-right text-primary-600">{BRL(totalValue)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
