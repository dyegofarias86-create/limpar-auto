import { useEffect, useState } from 'react';
import { api } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';
import { Building2, CheckCircle, XCircle, Search, Cloud, Plus, X, AlertCircle, Edit2, Save, ChevronDown } from 'lucide-react';
import MultiSelect from '../components/MultiSelect';

export default function Clients() {
  const { user } = useAuth();
  const [data, setData]       = useState([]);
  const [reps, setReps]       = useState([]);
  const [search, setSearch]   = useState('');
  const [filterGroups, setFilterGroups] = useState([]);
  const [filterReps, setFilterReps]     = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRepClient, setEditingRepClient] = useState(null); // client id being edited
  const [selectedClients, setSelectedClients] = useState(new Set());
  const [bulkRep, setBulkRep] = useState('');
  const [form, setForm] = useState({
    group_name: '', dealer_name: '', store_name: '', brand: '',
    state: '', city: '', cnpj: '', email: '', representative_id: '', provision_per_tmo: 0,
  });

  const isLeader = user?.role === 'leader';

  function load() {
    const repParam = filterReps.length === 1 ? `&rep_id=${filterReps[0]}` : (user?.role !== 'leader' && user?.rep_id ? `&rep_id=${user.rep_id}` : '');
    api.get(`/clients?${repParam}`).then(r => setData(r.data)).catch(() => {});
  }

  useEffect(() => { load(); }, [filterReps]);

  useEffect(() => {
    if (isLeader) api.get('/representatives').then(r => setReps(r.data)).catch(() => {});
  }, []);

  const groups = [...new Set(data.map(c => c.group_name))].sort();

  const filtered = data.filter(c => {
    const s = search.toLowerCase();
    const matchSearch = !s
      || c.store_name?.toLowerCase().includes(s)
      || c.group_name?.toLowerCase().includes(s)
      || c.city?.toLowerCase().includes(s)
      || c.brand?.toLowerCase().includes(s)
      || c.cnpj?.includes(s);
    const matchGroup = filterGroups.length === 0 || filterGroups.includes(c.group_name);
    const matchRep   = filterReps.length === 0   || filterReps.includes(String(c.representative_id || ''));
    return matchSearch && matchGroup && matchRep;
  });

  const active = filtered.filter(c => c.active).length;

  async function handleAdd() {
    if (!form.store_name || !form.cnpj) return alert('Nome da loja e CNPJ são obrigatórios');
    await api.post('/clients', form);
    setShowAddModal(false);
    setForm({ group_name:'', dealer_name:'', store_name:'', brand:'', state:'', city:'', cnpj:'', email:'', representative_id:'', provision_per_tmo:0 });
    load();
  }

  async function toggleActive(client) {
    await api.put(`/clients/${client.id}`, { ...client, active: !client.active });
    load();
  }

  async function changeRepresentative(client, newRepId) {
    await api.put(`/clients/${client.id}`, { ...client, representative_id: parseInt(newRepId) });
    setEditingRepClient(null);
    load();
  }

  async function bulkReassign() {
    if (!bulkRep || selectedClients.size === 0) return;
    await api.post('/clients/reassign', {
      client_ids: [...selectedClients],
      representative_id: parseInt(bulkRep),
    });
    setSelectedClients(new Set());
    setBulkRep('');
    load();
  }

  function toggleSelect(id) {
    setSelectedClients(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedClients(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(c => c.id)));
  }

  // Group by representative for display
  const repNames = {};
  reps.forEach(r => { repNames[r.id] = r.name; });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500 text-sm">{active} de {filtered.length} ativos</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input className="input pl-8 w-52 text-sm" placeholder="Buscar loja, CNPJ, cidade..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {isLeader && (
            <MultiSelect
              options={reps.map(r => ({ value: String(r.id), label: r.name }))}
              selected={filterReps}
              onChange={setFilterReps}
              placeholder="Representantes"
              allLabel="Todos"
              className="w-48"
            />
          )}
          <MultiSelect
            options={groups}
            selected={filterGroups}
            onChange={setFilterGroups}
            placeholder="Grupos"
            allLabel="Todos"
            className="w-40"
          />
          {isLeader && (
            <button className="btn-primary text-sm" onClick={() => setShowAddModal(true)}>
              <Plus size={15} /> Novo Cliente
            </button>
          )}
        </div>
      </div>

      {/* Bulk reassign bar */}
      {isLeader && selectedClients.size > 0 && (
        <div className="card p-3 border border-primary-200 bg-primary-50 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-primary-700">{selectedClients.size} cliente(s) selecionado(s)</span>
          <select className="input w-48 text-sm" value={bulkRep} onChange={e => setBulkRep(e.target.value)}>
            <option value="">Mover para representante...</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button className="btn-primary text-sm py-1.5" onClick={bulkReassign} disabled={!bulkRep}>
            <Save size={14} /> Reatribuir
          </button>
          <button className="btn-secondary text-sm py-1.5" onClick={() => setSelectedClients(new Set())}>Cancelar</button>
        </div>
      )}

      {/* OneDrive import banner */}
      {isLeader && (
        <div className="card p-4 border border-blue-200 bg-blue-50 flex items-start gap-3">
          <Cloud size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-0.5">Importar clientes do OneDrive</p>
            <p className="text-blue-600 text-xs">
              Use a página <strong>Sync Faturamento</strong> para importar os clientes e vinculá-los automaticamente aos representantes
              a partir do arquivo <strong>FATURAMENTO_GERAL_CONSOLIDADO_LIMPAR.XLSX</strong>.
              A coluna <code className="bg-blue-100 px-1 rounded">RESPONSÁVEL</code> será usada para o vínculo.
            </p>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="card">
        <div className="overflow-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {isLeader && (
                  <th className="table-header w-10">
                    <input type="checkbox" className="rounded" checked={selectedClients.size === filtered.length && filtered.length > 0} onChange={selectAll} />
                  </th>
                )}
                <th className="table-header">Grupo</th>
                <th className="table-header">Loja</th>
                <th className="table-header">Marca</th>
                <th className="table-header">Cidade/UF</th>
                <th className="table-header">CNPJ</th>
                {isLeader && <th className="table-header">Representante</th>}
                <th className="table-header text-right">Prov./TMO</th>
                <th className="table-header text-center">Ativo</th>
                {isLeader && <th className="table-header"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="table-cell text-center text-gray-400 py-8">Nenhum cliente encontrado</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className={`border-b border-gray-50 hover:bg-gray-50 ${selectedClients.has(c.id) ? 'bg-primary-50' : ''}`}>
                  {isLeader && (
                    <td className="table-cell w-10">
                      <input type="checkbox" className="rounded" checked={selectedClients.has(c.id)} onChange={() => toggleSelect(c.id)} onClick={e => e.stopPropagation()} />
                    </td>
                  )}
                  <td className="table-cell"><span className="badge-info text-xs">{c.group_name}</span></td>
                  <td className="table-cell font-medium text-gray-800">{c.store_name}</td>
                  <td className="table-cell text-gray-600 text-sm">{c.brand}</td>
                  <td className="table-cell text-gray-500 text-sm">{c.city}/{c.state}</td>
                  <td className="table-cell text-gray-400 font-mono text-xs">{c.cnpj}</td>
                  {isLeader && (
                    <td className="table-cell text-xs">
                      {editingRepClient === c.id ? (
                        <select autoFocus className="input text-xs py-0.5 px-1 w-32"
                          defaultValue={c.representative_id || ''}
                          onChange={e => changeRepresentative(c, e.target.value)}
                          onBlur={() => setEditingRepClient(null)}>
                          <option value="">—</option>
                          {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      ) : (
                        <button onClick={() => setEditingRepClient(c.id)}
                          className="flex items-center gap-1 text-gray-600 hover:text-primary-600 group">
                          <span>{repNames[c.representative_id] || <span className="text-gray-300">—</span>}</span>
                          <Edit2 size={10} className="opacity-0 group-hover:opacity-100" />
                        </button>
                      )}
                    </td>
                  )}
                  <td className="table-cell text-right">
                    {c.provision_per_tmo > 0
                      ? <span className="text-teal-600 font-semibold text-xs">R$ {c.provision_per_tmo}/TMO</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="table-cell text-center">
                    {c.active
                      ? <CheckCircle size={16} className="text-green-500 mx-auto" />
                      : <XCircle size={16} className="text-gray-300 mx-auto" />}
                  </td>
                  {isLeader && (
                    <td className="table-cell">
                      <button
                        onClick={() => toggleActive(c)}
                        className={`text-xs px-2 py-1 rounded-md font-medium ${c.active ? 'text-red-500 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}
                      >
                        {c.active ? 'Desativar' : 'Ativar'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Novo Cliente */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg text-gray-900">Novo Cliente</h3>
              <button onClick={() => setShowAddModal(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'store_name', label: 'Nome da Loja *', span: 2 },
                { key: 'dealer_name', label: 'Concessionária', span: 2 },
                { key: 'group_name', label: 'Grupo', span: 1 },
                { key: 'brand', label: 'Marca', span: 1 },
                { key: 'cnpj', label: 'CNPJ *', span: 1 },
                { key: 'email', label: 'E-mail', span: 1 },
                { key: 'city', label: 'Cidade', span: 1 },
                { key: 'state', label: 'UF', span: 1 },
              ].map(f => (
                <div key={f.key} className={f.span === 2 ? 'col-span-2' : ''}>
                  <label className="label">{f.label}</label>
                  <input className="input" value={form[f.key]} onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label className="label">Provisão/TMO (R$)</label>
                <input type="number" className="input" value={form.provision_per_tmo} onChange={e => setForm(v => ({ ...v, provision_per_tmo: parseFloat(e.target.value) || 0 }))} min="0" step="0.01" />
              </div>
              <div>
                <label className="label">Representante</label>
                <select className="input" value={form.representative_id} onChange={e => setForm(v => ({ ...v, representative_id: e.target.value }))}>
                  <option value="">Selecionar...</option>
                  {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button className="btn-secondary flex-1 justify-center" onClick={() => setShowAddModal(false)}>Cancelar</button>
              <button className="btn-primary flex-1 justify-center" onClick={handleAdd}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
