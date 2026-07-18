import { useEffect, useState } from 'react';
import { api } from '../contexts/AuthContext';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { TrendingUp, DollarSign, Wallet, Megaphone, Users, ArrowUpRight } from 'lucide-react';
import MultiSelect from '../components/MultiSelect';

const COLORS = ['#00AEEF','#0D4F5C','#14b8a6','#f59e0b','#8b5cf6','#ef4444','#10b981','#6366f1'];
const BRL = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + '20' }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-500 font-medium">{label}</div>
        <div className="text-2xl font-bold text-gray-900 mt-0.5">{value}</div>
        {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary]         = useState(null);
  const [repComparison, setRepComp]   = useState([]);
  const [monthlyByRep, setMonthly]    = useState([]);
  const [provSummary, setProvSummary] = useState(null);
  const [mktSummary, setMktSummary]   = useState(null);
  const [reps, setReps]               = useState([]);

  const [period, setPeriod]   = useState({ months: [7], year: 2026 });
  const [selectedRep, setSelectedRep] = useState('');

  async function load() {
    const { months, year } = period;
    // Use last selected month for single-period endpoints, or aggregate for multi
    const primaryMonth = months[months.length - 1] || 7;
    const monthsParam = months.length > 1 ? `months=${months.join(',')}` : `month=${primaryMonth}`;
    const [sum, rep, monthly, prov, mkt, repList] = await Promise.all([
      api.get(`/dashboard/summary?${monthsParam}&year=${year}`).catch(() => ({ data: null })),
      api.get(`/dashboard/rep-comparison?${monthsParam}&year=${year}`).catch(() => ({ data: [] })),
      api.get(`/dashboard/monthly-by-rep?year=${year}${selectedRep ? `&rep_id=${selectedRep}` : ''}`).catch(() => ({ data: [] })),
      api.get(`/dashboard/provision-summary?${monthsParam}&year=${year}`).catch(() => ({ data: null })),
      api.get(`/dashboard/mkt-summary?year=${year}`).catch(() => ({ data: null })),
      api.get('/representatives').catch(() => ({ data: [] })),
    ]);
    setSummary(sum.data);
    setRepComp(rep.data);
    setMonthly(monthly.data);
    setProvSummary(prov.data);
    setMktSummary(mkt.data);
    setReps(repList.data);
  }

  useEffect(() => { load(); }, [period, selectedRep]);

  if (!summary) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500">Carregando dashboard...</p>
      </div>
    </div>
  );

  const gross_margin = summary.billing.total > 0
    ? ((summary.billing.total - summary.expenses.total) / summary.billing.total * 100).toFixed(1)
    : 0;

  // Monthly data for selected rep (or all)
  const monthlyData = selectedRep
    ? monthlyByRep.find(r => String(r.rep_id) === String(selectedRep))?.months || []
    : (() => {
        // Aggregate all reps
        const base = Array.from({ length: 12 }, (_, i) => ({ month: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][i], gastos: 0, faturamento: 0 }));
        monthlyByRep.forEach(rep => {
          rep.months?.forEach((m, i) => {
            base[i].gastos      += m.gastos;
            base[i].faturamento += m.faturamento;
          });
        });
        return base;
      })();

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm">Visão geral do período selecionado</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <MultiSelect
            options={MONTHS.map((m, i) => ({ value: String(i+1), label: m }))}
            selected={period.months.map(String)}
            onChange={v => setPeriod(p => ({ ...p, months: v.map(Number) }))}
            placeholder="Mês"
            allLabel="Todos os meses"
            className="w-52"
          />
          <select className="input w-auto text-sm" value={period.year} onChange={e => setPeriod(v => ({ ...v, year: +e.target.value }))}>
            {[2024,2025,2026].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="Faturamento" value={BRL(summary.billing.total)} sub={`${Number(summary.billing.tmo||0).toLocaleString('pt-BR')} TMO`} color="#00AEEF" />
        <StatCard icon={Wallet}     label="Total Gastos" value={BRL(summary.expenses.total)} sub={`Margem: ${gross_margin}%`} color="#ef4444" />
        <StatCard icon={DollarSign} label="Saldo Provisão" value={BRL(summary.provisions.balance)} sub={`Total: ${BRL(summary.provisions.provisioned)}`} color="#0D4F5C" />
        <StatCard icon={Megaphone}  label="Verba MKT disp." value={BRL(summary.marketing.available)} sub={`Total: ${BRL(summary.marketing.total)}`} color="#f59e0b" />
      </div>

      {/* ── SEÇÃO: Gastos vs Faturamento por Rep ── */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Users size={16} className="text-primary-500" />
          Gastos vs. Faturamento por Representante — {period.months.map(m=>MONTHS[m-1].slice(0,3)).join(", ")}/{period.year}
        </h3>
        {repComparison.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-6">Sem dados de faturamento. Use "Sync Faturamento" para importar.</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="table-header">Representante</th>
                  <th className="table-header text-right">Faturamento</th>
                  <th className="table-header text-right">TMO</th>
                  <th className="table-header text-right">Gastos</th>
                  <th className="table-header text-right">% Gastos/Fat.</th>
                  <th className="table-header text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {repComparison.map(row => (
                  <tr key={row.rep_name} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="table-cell font-medium text-gray-800">{row.rep_name}</td>
                    <td className="table-cell text-right text-primary-600 font-semibold">{BRL(row.faturamento)}</td>
                    <td className="table-cell text-right text-gray-500">{Number(row.tmo).toLocaleString('pt-BR')}</td>
                    <td className="table-cell text-right text-red-500">{BRL(row.gastos)}</td>
                    <td className="table-cell text-right">
                      <span className={`badge-${row.pct_gastos > 50 ? 'warning' : 'success'}`}>
                        {row.pct_gastos}%
                      </span>
                    </td>
                    <td className="table-cell text-right font-bold text-green-600">{BRL(row.faturamento - row.gastos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── SEÇÃO: Gráfico mensal por representante ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <TrendingUp size={16} className="text-primary-500" />
            Gastos Mês a Mês — {period.year}
          </h3>
          <select className="input w-44 text-sm" value={selectedRep} onChange={e => setSelectedRep(e.target.value)}>
            <option value="">Equipe completa</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v, name) => [BRL(v), name === 'gastos' ? 'Gastos' : 'Faturamento']} />
            <Bar dataKey="faturamento" fill="#00AEEF" radius={[4,4,0,0]} name="faturamento" />
            <Bar dataKey="gastos" fill="#ef444466" radius={[4,4,0,0]} name="gastos" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Linha 3: Provisão + MKT ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Provisão por representante */}
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <DollarSign size={16} className="text-teal-600" />
            Provisão — {period.months.map(m=>MONTHS[m-1].slice(0,3)).join(", ")}/{period.year}
          </h3>
          {!provSummary || provSummary.byRep.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-4">Sem dados de provisão</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  { label: 'Prov. Mês', value: BRL(provSummary.total.prov_mes), color: '#00AEEF' },
                  { label: 'Total', value: BRL(provSummary.total.prov_total), color: '#0D4F5C' },
                  { label: 'Retirado', value: BRL(provSummary.total.retiradas), color: '#ef4444' },
                  { label: 'Saldo', value: BRL(provSummary.total.saldo), color: '#10b981' },
                ].map(k => (
                  <div key={k.label} className="bg-gray-50 rounded-lg p-2.5 text-center">
                    <div className="text-xs text-gray-500">{k.label}</div>
                    <div className="font-bold text-sm mt-0.5" style={{ color: k.color }}>{k.value}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {provSummary.byRep.slice(0, 7).map(rep => (
                  <div key={rep.rep_name} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 font-medium truncate mr-2">{rep.rep_name}</span>
                    <div className="flex gap-3 text-right flex-shrink-0">
                      <span className="text-gray-500 text-xs">{BRL(rep.prov_mes)}</span>
                      <span className="font-bold text-green-600">{BRL(rep.saldo)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Verba MKT por representante */}
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Megaphone size={16} className="text-amber-500" />
            Verba MKT — {period.year}
          </h3>
          {!mktSummary || mktSummary.byRep.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-4">Sem dados de MKT. Importe o faturamento primeiro.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  { label: 'Total Gerada', value: BRL(mktSummary.total.total), color: '#f59e0b' },
                  { label: 'Disponível', value: BRL(mktSummary.total.available), color: '#10b981' },
                ].map(k => (
                  <div key={k.label} className="bg-gray-50 rounded-lg p-2.5 text-center">
                    <div className="text-xs text-gray-500">{k.label}</div>
                    <div className="font-bold text-sm mt-0.5" style={{ color: k.color }}>{k.value}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {mktSummary.byRep.slice(0, 7).map(rep => (
                  <div key={rep.rep_name}>
                    <div className="flex justify-between text-sm mb-0.5">
                      <span className="text-gray-600 font-medium">{rep.rep_name}</span>
                      <span className="text-amber-600 font-bold">{BRL(rep.total)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-amber-400" style={{
                        width: mktSummary.total.total > 0 ? `${Math.min(100, rep.total / mktSummary.total.total * 100)}%` : '0%'
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Linha 4: Gráfico 6 meses + Ranking ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-5 lg:col-span-2">
          <h3 className="font-semibold text-gray-800 mb-4">Faturamento vs Gastos — Últimos 6 meses</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={summary.monthly} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v, name) => [BRL(v), name === 'faturamento' ? 'Faturamento' : 'Gastos']} />
              <Bar dataKey="faturamento" fill="#00AEEF" radius={[4,4,0,0]} name="faturamento" />
              <Bar dataKey="gastos" fill="#ef444466" radius={[4,4,0,0]} name="gastos" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Ranking de Faturamento</h3>
          <div className="space-y-2">
            {summary.billingByGroup.slice(0, 6).map((row, i) => (
              <div key={row.group_name} className="flex items-center gap-2 text-sm">
                <span className="text-gray-400 font-mono w-4 text-right flex-shrink-0">{i+1}</span>
                <span className="text-gray-700 flex-1 truncate">{row.group_name}</span>
                <span className="font-bold text-primary-600 flex-shrink-0">{BRL(row.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Gastos por categoria ── */}
      {summary.expensesByCategory.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Gastos por Categoria — {period.months.map(m=>MONTHS[m-1].slice(0,3)).join(", ")}/{period.year}</h3>
          <div className="space-y-3">
            {summary.expensesByCategory.map((item, i) => {
              const max = summary.expensesByCategory[0].total;
              return (
                <div key={item.category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 font-medium">{item.category}</span>
                    <span className="text-gray-900 font-semibold">{BRL(item.total)}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full" style={{ width: `${(item.total / max * 100)}%`, background: COLORS[i % COLORS.length] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
