import { useEffect, useState } from 'react';
import { api } from '../contexts/AuthContext';
import { Users, Building2, TrendingUp, ChevronRight, MapPin, Map } from 'lucide-react';

const BRL = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`;

const STATE_COLORS = {
  'AM': 'bg-green-100 text-green-800', 'PA': 'bg-emerald-100 text-emerald-800',
  'PE': 'bg-orange-100 text-orange-800', 'CE': 'bg-amber-100 text-amber-800',
  'BA': 'bg-yellow-100 text-yellow-800', 'MG': 'bg-blue-100 text-blue-800',
  'SP': 'bg-indigo-100 text-indigo-800', 'RJ': 'bg-purple-100 text-purple-800',
  'PR': 'bg-teal-100 text-teal-800', 'SC': 'bg-cyan-100 text-cyan-800',
  'RS': 'bg-sky-100 text-sky-800', 'MT': 'bg-lime-100 text-lime-800',
  'GO': 'bg-rose-100 text-rose-800', 'MS': 'bg-violet-100 text-violet-800',
  'RR': 'bg-pink-100 text-pink-800', 'RO': 'bg-fuchsia-100 text-fuchsia-800',
  'AC': 'bg-green-200 text-green-900', 'AP': 'bg-teal-200 text-teal-900',
  'TO': 'bg-amber-200 text-amber-900', 'MA': 'bg-orange-200 text-orange-900',
  'PI': 'bg-yellow-200 text-yellow-900', 'RN': 'bg-red-100 text-red-800',
  'PB': 'bg-pink-200 text-pink-900', 'AL': 'bg-rose-200 text-rose-900',
  'SE': 'bg-purple-200 text-purple-900', 'ES': 'bg-indigo-200 text-indigo-900',
  'DF': 'bg-blue-200 text-blue-900',
};

function StateTag({ state }) {
  const colorClass = STATE_COLORS[state] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold ${colorClass}`}>
      {state}
    </span>
  );
}

export default function Representatives() {
  const [reps, setReps]     = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [period, setPeriod] = useState({ month: 6, year: 2026 });
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  useEffect(() => {
    api.get('/representatives').then(r => setReps(r.data)).catch(console.error);
  }, []);

  useEffect(() => {
    if (selected) {
      api.get(`/representatives/${selected}/details?month=${period.month}&year=${period.year}`)
        .then(r => setDetail(r.data))
        .catch(console.error);
    }
  }, [selected, period]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Representantes</h1>
          <p className="text-gray-500 text-sm">Visão consolidada por representante</p>
        </div>
        <div className="flex gap-2">
          <select className="input w-auto" value={period.month} onChange={e => setPeriod(v => ({ ...v, month: +e.target.value }))}>
            {months.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select className="input w-auto" value={period.year} onChange={e => setPeriod(v => ({ ...v, year: +e.target.value }))}>
            {[2024,2025,2026].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rep list */}
        <div className="space-y-3">
          {reps.length === 0 ? (
            <div className="card p-8 text-center text-gray-400">
              <Users size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum representante</p>
            </div>
          ) : reps.map(rep => (
            <div
              key={rep.id}
              onClick={() => setSelected(rep.id)}
              className={`card p-4 cursor-pointer hover:shadow-md transition-all ${selected === rep.id ? 'border-primary-500 shadow-md' : ''}`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900">{rep.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{rep.email}</div>
                </div>
                <ChevronRight size={16} className="text-gray-400 flex-shrink-0 mt-1" />
              </div>

              {/* Stats badges */}
              <div className="flex gap-2 flex-wrap mb-2">
                <span className="badge-info">{rep.client_count} clientes</span>
                {rep.seller_count > 0 && <span className="badge-teal">{rep.seller_count} vendedor(es)</span>}
              </div>

              {/* States — geolocation at a glance */}
              {rep.states && rep.states.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                  <MapPin size={11} className="text-gray-400 flex-shrink-0" />
                  {rep.states.slice(0, 8).map(s => (
                    <StateTag key={s} state={s} />
                  ))}
                  {rep.states.length > 8 && (
                    <span className="text-xs text-gray-400">+{rep.states.length - 8}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          {!detail ? (
            <div className="card p-12 text-center text-gray-400">
              <Users size={40} className="mx-auto mb-3 opacity-30" />
              <p>Selecione um representante para ver os detalhes</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header */}
              <div className="card p-5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <Users size={22} className="text-primary-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 text-lg">{detail.rep.name}</h3>
                    <p className="text-sm text-gray-500">{detail.rep.email}</p>
                    {detail.sellers?.length > 0 && (
                      <div className="mt-1 flex gap-1 flex-wrap">
                        {detail.sellers.map(s => <span key={s.id} className="badge-teal text-xs">{s.name}</span>)}
                      </div>
                    )}
                  </div>
                </div>

                {/* States/Cities section */}
                {(() => {
                  const rep = reps.find(r => r.id === selected);
                  if (!rep?.states?.length) return null;
                  return (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="flex items-center gap-2 mb-3">
                        <Map size={14} className="text-primary-500" />
                        <span className="text-sm font-semibold text-gray-700">Área de Atuação</span>
                        <span className="text-xs text-gray-400">({rep.states.length} estado{rep.states.length > 1 ? 's' : ''})</span>
                      </div>

                      {/* States */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {rep.states.map(s => <StateTag key={s} state={s} />)}
                      </div>

                      {/* Cities grouped by state */}
                      {rep.top_cities?.length > 0 && (
                        <div className="space-y-1.5">
                          {rep.states.slice(0, 5).map(state => {
                            const stateCities = rep.top_cities.filter(c => c.state === state).slice(0, 5);
                            if (!stateCities.length) return null;
                            return (
                              <div key={state} className="flex items-start gap-2 text-xs">
                                <StateTag state={state} />
                                <span className="text-gray-500 leading-5">
                                  {stateCities.map(c => c.city).join(', ')}
                                  {rep.top_cities.filter(c => c.state === state).length > 5 && '...'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* KPI cards */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { label: 'Faturamento', value: BRL(detail.billing?.total), color: '#00AEEF' },
                  { label: 'TMO', value: Number(detail.billing?.tmo||0).toLocaleString('pt-BR'), color: '#0D4F5C' },
                  { label: 'Saldo Provisão', value: BRL(detail.provisions?.balance), color: '#10b981' },
                ].map(k => (
                  <div key={k.label} className="card p-3">
                    <div className="text-xs text-gray-500">{k.label}</div>
                    <div className="text-lg font-bold mt-0.5" style={{ color: k.color }}>{k.value}</div>
                  </div>
                ))}
              </div>

              {/* Expenses */}
              {detail.expenses?.length > 0 && (
                <div className="card p-4">
                  <h4 className="font-semibold text-gray-800 mb-3 text-sm">Gastos por Categoria</h4>
                  <div className="space-y-2">
                    {detail.expenses.map(e => (
                      <div key={e.category} className="flex justify-between text-sm">
                        <span className="text-gray-600">{e.category}</span>
                        <span className="font-semibold text-gray-800">{BRL(e.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Clients */}
              <div className="card p-4">
                <h4 className="font-semibold text-gray-800 mb-3 text-sm">Clientes ({detail.clients?.length || 0})</h4>
                <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto">
                  {detail.clients?.map(c => (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <Building2 size={11} className="text-gray-400 flex-shrink-0" />
                      <span className="text-gray-700 flex-1 truncate">{c.store_name}</span>
                      <span className="text-gray-400 text-xs flex-shrink-0">{c.city}/{c.state}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
