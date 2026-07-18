import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';
import {
  ChevronLeft, ChevronRight, Plus, X, Calendar, MapPin,
  FileText, AlertTriangle, Lightbulb, Edit2, Trash2, Check,
  Building2, Search, ChevronDown, User, Clock
} from 'lucide-react';
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameDay, addWeeks, subWeeks, startOfMonth, endOfMonth,
  eachDayOfInterval as eachDay, getDay, addMonths, subMonths,
  parseISO, isToday, getHours, getMinutes
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

const DAY_SHORT  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 07:00 → 19:00

const EVENT_COLORS = [
  '#00AEEF','#0D4F5C','#7c3aed','#f59e0b','#10b981','#ef4444','#6366f1','#ec4899'
];

/* ─── Client Dropdown ─── */
function ClientSelect({ clients, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef();

  const selected = clients.find(c => c.id === value);
  const filtered = clients.filter(c =>
    !search ||
    c.store_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.group_name?.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { setOpen(v => !v); setSearch(''); }}
        className="input flex items-center justify-between text-left w-full">
        {selected ? (
          <span className="flex items-center gap-2 text-gray-800 min-w-0">
            <Building2 size={12} className="text-primary-500 flex-shrink-0" />
            <span className="font-medium truncate">{selected.store_name}</span>
            <span className="text-xs text-gray-400 flex-shrink-0">({selected.group_name})</span>
          </span>
        ) : <span className="text-gray-400">Selecionar cliente...</span>}
        <ChevronDown size={13} className="text-gray-400 flex-shrink-0 ml-1" />
      </button>

      {open && (
        <div className="absolute z-[200] top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-56 flex flex-col">
          <div className="p-2 border-b border-gray-100 flex-shrink-0">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-2.5 text-gray-400" />
              <input autoFocus className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-4">Nenhum cliente</div>
            ) : filtered.map(c => (
              <button key={c.id} type="button"
                onClick={() => { onChange(c.id, c.store_name); setOpen(false); }}
                className={`w-full text-left px-3 py-2 hover:bg-primary-50 flex items-start gap-2 ${c.id === value ? 'bg-primary-50' : ''}`}>
                <Building2 size={11} className="text-primary-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-800 truncate">{c.store_name}</div>
                  <div className="text-xs text-gray-400">{c.group_name} · {c.city}/{c.state}</div>
                </div>
                {c.id === value && <Check size={12} className="text-primary-500 flex-shrink-0 mt-0.5" />}
              </button>
            ))}
          </div>
          {value && (
            <div className="border-t border-gray-100 p-2 flex-shrink-0">
              <button type="button" onClick={() => { onChange('', ''); setOpen(false); }}
                className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                <X size={10} /> Limpar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Event Form Panel ─── */
function EventPanel({ event, clients, reps, isNew, defaultDate, defaultHour, currentRepId, isLeader, onSave, onDelete, onClose }) {
  const defaultDateStr = defaultDate ? format(defaultDate, 'yyyy-MM-dd') : '';
  const defaultTime    = defaultHour != null ? `${String(defaultHour).padStart(2,'0')}:00` : '09:00';

  const [form, setForm] = useState({
    representative_id: event?.representative_id || currentRepId || '',
    client_id:    event?.client_id    || '',
    client_name:  event?.client_name  || '',
    title:        event?.title        || '',
    date:         event?.date         || defaultDateStr,
    time:         event?.time         || defaultTime,
    duration:     event?.duration     || 60,
    visit_report: event?.visit_report || '',
    difficulties: event?.difficulties || '',
    action_plan:  event?.action_plan  || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  function handleClientChange(id, name) {
    setForm(v => ({ ...v, client_id: id, client_name: name }));
  }

  async function handleSave() {
    setError('');
    if (!form.date) return setError('Informe a data.');
    if (!form.client_id && !form.client_name.trim()) return setError('Selecione o cliente.');
    if (isLeader && !form.representative_id) return setError('Selecione o representante.');
    setSaving(true);
    try { await onSave(form); }
    catch (e) { setError('Erro ao salvar.'); setSaving(false); }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #0D4F5C 0%, #00AEEF 100%)' }}>
        <div className="flex items-center gap-2 text-white">
          <Calendar size={14} />
          <span className="font-semibold text-sm">{isNew ? 'Nova Visita' : 'Editar Visita'}</span>
        </div>
        <button onClick={onClose} className="text-white/70 hover:text-white p-1 rounded hover:bg-white/10"><X size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLeader && (
          <div>
            <label className="label text-xs flex items-center gap-1"><User size={11} />Representante</label>
            <select className="input text-sm" value={form.representative_id}
              onChange={e => setForm(v => ({ ...v, representative_id: e.target.value }))}>
              <option value="">Selecionar...</option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label text-xs flex items-center gap-1"><Calendar size={11} />Data *</label>
            <input type="date" className="input text-sm" value={form.date} onChange={e => setForm(v => ({ ...v, date: e.target.value }))} />
          </div>
          <div>
            <label className="label text-xs flex items-center gap-1"><Clock size={11} />Horário</label>
            <input type="time" className="input text-sm" value={form.time} onChange={e => setForm(v => ({ ...v, time: e.target.value }))} />
          </div>
        </div>

        <div>
          <label className="label text-xs flex items-center gap-1"><Building2 size={11} />Cliente *</label>
          <ClientSelect clients={clients} value={form.client_id} onChange={handleClientChange} />
          {!form.client_id && (
            <input className="input mt-1.5 text-sm" placeholder="Ou digite manualmente..."
              value={form.client_name} onChange={e => setForm(v => ({ ...v, client_name: e.target.value }))} />
          )}
        </div>

        <div>
          <label className="label text-xs">Objetivo / Título</label>
          <input className="input text-sm" placeholder="Ex: Apresentação de produto..."
            value={form.title} onChange={e => setForm(v => ({ ...v, title: e.target.value }))} />
        </div>

        <div className="border-t border-dashed border-gray-200 pt-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <FileText size={10} /> Relato Pós-Visita
          </p>
        </div>

        <div>
          <label className="label text-xs">O que foi feito</label>
          <textarea className="input resize-none text-sm" rows={3} placeholder="Descreva o que aconteceu na visita..."
            value={form.visit_report} onChange={e => setForm(v => ({ ...v, visit_report: e.target.value }))} />
        </div>
        <div>
          <label className="label text-xs flex items-center gap-1"><AlertTriangle size={10} className="text-amber-500" />Dificuldades</label>
          <textarea className="input resize-none text-sm" rows={2} placeholder="Problemas encontrados..."
            value={form.difficulties} onChange={e => setForm(v => ({ ...v, difficulties: e.target.value }))} />
        </div>
        <div>
          <label className="label text-xs flex items-center gap-1"><Lightbulb size={10} className="text-green-500" />Plano de Ação</label>
          <textarea className="input resize-none text-sm" rows={2} placeholder="Próximos passos..."
            value={form.action_plan} onChange={e => setForm(v => ({ ...v, action_plan: e.target.value }))} />
        </div>
      </div>

      {error && <div className="mx-4 mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      <div className="flex-shrink-0 border-t border-gray-100 p-4 space-y-2 bg-gray-50">
        <button onClick={handleSave} disabled={saving} className="btn-primary w-full justify-center">
          <Check size={14} /> {saving ? 'Salvando...' : isNew ? 'Adicionar Visita' : 'Salvar Alterações'}
        </button>
        {!isNew && onDelete && (
          <button onClick={onDelete} className="btn-danger w-full justify-center"><Trash2 size={13} /> Excluir</button>
        )}
        <button onClick={onClose} className="btn-secondary w-full justify-center">Fechar</button>
      </div>
    </div>
  );
}

/* ─── Main Agenda Page ─── */
export default function Agenda() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode]       = useState('week'); // 'week' | 'month'
  const [events, setEvents]           = useState([]);
  const [clients, setClients]         = useState([]);
  const [reps, setReps]               = useState([]);
  const [filterRep, setFilterRep]     = useState('');
  const [panel, setPanel]             = useState(null);
  const [dayPopup, setDayPopup]        = useState(null); // { day, events }
  const scrollRef = useRef();

  const isLeader = user?.role === 'leader';

  const repColors = {};
  reps.forEach((r, i) => { repColors[r.id] = EVENT_COLORS[i % EVENT_COLORS.length]; });

  // ── Week range ──
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd   = endOfWeek(currentDate,   { weekStartsOn: 0 });
  const weekDays  = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // ── Month range ──
  const monthStart = startOfMonth(currentDate);
  const monthEnd   = endOfMonth(currentDate);
  const monthFirstDay = getDay(monthStart);
  const monthDays  = eachDay({ start: monthStart, end: monthEnd });
  const monthCells = Array.from({ length: Math.ceil((monthFirstDay + monthDays.length) / 7) * 7 }, (_, i) => {
    const idx = i - monthFirstDay;
    return idx >= 0 && idx < monthDays.length ? monthDays[idx] : null;
  });

  const load = useCallback(async () => {
    const month = currentDate.getMonth() + 1;
    const year  = currentDate.getFullYear();
    let url = `/agenda?month=${month}&year=${year}`;
    if (!isLeader && user?.rep_id) url += `&rep_id=${user.rep_id}`;
    else if (isLeader && filterRep) url += `&rep_id=${filterRep}`;
    const r = await api.get(url);
    setEvents(r.data);
  }, [currentDate, filterRep]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data)).catch(() => {});
    if (isLeader) api.get('/representatives').then(r => setReps(r.data)).catch(() => {});
  }, []);

  // Scroll to 8am on mount
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 60 * 1; // 1hr = 60px, 8am = 1hr offset from 7am
  }, [viewMode]);

  function getEventsForDay(day) {
    return events.filter(e => e.date && isSameDay(parseISO(e.date + 'T00:00:00'), day));
  }

  function getEventTop(ev) {
    const [h, m] = (ev.time || '09:00').split(':').map(Number);
    return ((h - 7) * 60 + (m || 0)) * (60 / 60); // px per minute (1px/min, 60px/hr)
  }

  function getEventHeight(ev) {
    return Math.max(30, (ev.duration || 60));
  }

  function getRepColor(ev) {
    return repColors[ev.representative_id] || '#00AEEF';
  }

  function openNew(day, hour) {
    setPanel({ mode: 'new', date: day, hour });
  }

  function openEdit(ev, e) {
    e?.stopPropagation();
    setPanel({ mode: 'edit', event: ev });
  }

  async function handleSave(form) {
    const month = parseInt(form.date?.split('-')[1]) || currentDate.getMonth() + 1;
    const year  = parseInt(form.date?.split('-')[0]) || currentDate.getFullYear();
    const week  = Math.ceil(parseInt(form.date?.split('-')[2] || '1') / 7);
    const repId = form.representative_id || user?.rep_id || 1;

    const payload = {
      representative_id: repId,
      client_id:    form.client_id   || null,
      date:         form.date,
      time:         form.time        || '09:00',
      duration:     form.duration    || 60,
      week, month, year,
      client_name:  form.client_name || '',
      title:        form.title       || '',
      visit_report: form.visit_report || '',
      difficulties: form.difficulties || '',
      action_plan:  form.action_plan  || '',
    };

    if (panel.mode === 'new') {
      await api.post('/agenda', payload);
    } else {
      await api.put(`/agenda/${panel.event.id}`, payload);
    }
    setPanel(null);
    load();
  }

  async function handleDelete() {
    if (!confirm('Excluir esta visita?')) return;
    await api.delete(`/agenda/${panel.event.id}`);
    setPanel(null);
    load();
  }

  const hasReport = ev => !!(ev.visit_report || ev.difficulties || ev.action_plan);

  // ── Week View ──
  const WeekView = () => (
    <div className="flex flex-col h-full">
      {/* Day headers */}
      <div className="flex border-b border-gray-200 flex-shrink-0">
        <div className="w-14 flex-shrink-0" />
        {weekDays.map(day => {
          const today = isToday(day);
          return (
            <div key={day.toISOString()} className="flex-1 text-center py-2 min-w-0">
              <div className="text-xs font-semibold text-gray-500 uppercase">{DAY_SHORT[day.getDay()]}</div>
              <div className={`mx-auto mt-1 w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold transition-colors
                ${today ? 'bg-primary-500 text-white' : 'text-gray-700 hover:bg-gray-100 cursor-pointer'}`}
                onClick={() => openNew(day, 9)}>
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex" style={{ minHeight: `${HOURS.length * 60}px` }}>
          {/* Hours column */}
          <div className="w-14 flex-shrink-0">
            {HOURS.map(h => (
              <div key={h} className="h-[60px] flex items-start justify-end pr-2 pt-0.5">
                <span className="text-xs text-gray-400">{String(h).padStart(2,'0')}:00</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map(day => {
            const dayEvents = getEventsForDay(day);
            const today = isToday(day);
            return (
              <div key={day.toISOString()}
                className={`flex-1 relative border-l border-gray-100 min-w-0 ${today ? 'bg-blue-50/30' : ''}`}
                onClick={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const y = e.clientY - rect.top;
                  const hour = Math.floor(y / 60) + 7;
                  openNew(day, Math.min(19, Math.max(7, hour)));
                }}>
                {/* Hour lines */}
                {HOURS.map(h => (
                  <div key={h} className="h-[60px] border-t border-gray-100" />
                ))}

                {/* Events */}
                {dayEvents.map((ev, ei) => {
                  const top    = getEventTop(ev);
                  const height = getEventHeight(ev);
                  const color  = getRepColor(ev);
                  return (
                    <div key={ev.id}
                      onClick={e => openEdit(ev, e)}
                      title={`${ev.client_name || ev.title} — ${ev.time || '09:00'}`}
                      className="absolute left-0.5 right-0.5 rounded overflow-hidden cursor-pointer hover:opacity-90 z-10"
                      style={{ top: `${top}px`, height: `${height}px`, background: color, borderLeft: `3px solid ${color}cc` }}>
                      <div className="p-1 text-white overflow-hidden h-full">
                        <div className="text-xs font-semibold leading-tight truncate">{ev.client_name || ev.title || 'Visita'}</div>
                        {height >= 40 && <div className="text-xs opacity-80">{ev.time || '09:00'}</div>}
                        {hasReport(ev) && <div className="w-1.5 h-1.5 rounded-full bg-white/80 absolute bottom-1 right-1" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── Month View ──
  const MonthView = () => (
    <div className="flex flex-col h-full">
      {/* Day names */}
      <div className="grid grid-cols-7 border-b border-gray-200 flex-shrink-0">
        {DAY_SHORT.map(d => (
          <div key={d} className="py-2 text-center text-xs font-bold text-gray-500 uppercase bg-gray-50">{d}</div>
        ))}
      </div>
      {/* Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-7" style={{ gridAutoRows: 'minmax(90px, 1fr)' }}>
          {monthCells.map((day, i) => {
            const dayEvents = day ? getEventsForDay(day) : [];
            const today = day && isToday(day);
            return (
              <div key={i}
                onClick={() => day && openNew(day, 9)}
                className={`p-1.5 border-b border-r border-gray-100 cursor-pointer hover:bg-primary-50/40 transition-colors
                  ${!day ? 'bg-gray-50/50' : ''}`}>
                {day && (
                  <>
                    <div className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1
                      ${today ? 'bg-primary-500 text-white' : 'text-gray-600'}`}>
                      {day.getDate()}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0,3).map((ev, ei) => (
                        <div key={ev.id}
                          onClick={e => openEdit(ev, e)}
                          className="text-xs text-white rounded px-1.5 py-0.5 truncate cursor-pointer hover:opacity-80 flex items-center gap-1"
                          style={{ background: getRepColor(ev) }}>
                          {hasReport(ev) && <span className="w-1 h-1 rounded-full bg-white/80 flex-shrink-0" />}
                          <span className="truncate">{ev.client_name || ev.title || 'Visita'}</span>
                        </div>
                      ))}
                      {dayEvents.length > 3 && (<button onClick={e => { e.stopPropagation(); setDayPopup({ day, events: dayEvents }); }} className="text-xs font-semibold text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded px-1 py-0.5 w-full text-left">+{dayEvents.length - 3} mais</button>)}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const navPrev = () => viewMode === 'week' ? setCurrentDate(d => subWeeks(d,1)) : setCurrentDate(d => subMonths(d,1));
  const navNext = () => viewMode === 'week' ? setCurrentDate(d => addWeeks(d,1)) : setCurrentDate(d => addMonths(d,1));

  const headerTitle = viewMode === 'week'
    ? `${format(weekStart, 'd')} – ${format(weekEnd, 'd')} de ${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    : `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  return (
    <div className="flex h-full gap-0" style={{ height: 'calc(100vh - 56px)' }}>

      {/* ── Calendar ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white flex-shrink-0">
          {/* Today */}
          <button className="btn-secondary text-sm py-1.5 px-3" onClick={() => setCurrentDate(new Date())}>Hoje</button>

          {/* Nav */}
          <button className="p-1.5 rounded-full hover:bg-gray-100 text-gray-600" onClick={navPrev}><ChevronLeft size={18} /></button>
          <button className="p-1.5 rounded-full hover:bg-gray-100 text-gray-600" onClick={navNext}><ChevronRight size={18} /></button>

          {/* Title */}
          <h2 className="font-semibold text-gray-800 text-base ml-1 flex-1">{headerTitle}</h2>

          {/* Rep filter (leader) */}
          {isLeader && reps.length > 0 && (
            <select className="input w-40 text-sm" value={filterRep} onChange={e => setFilterRep(e.target.value)}>
              <option value="">Todos</option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}

          {/* View toggle */}
          <div className="flex border border-gray-200 rounded-lg overflow-hidden flex-shrink-0">
            {[['week','Semana'],['month','Mês']].map(([v,l]) => (
              <button key={v} onClick={() => setViewMode(v)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${viewMode===v ? 'bg-primary-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                {l}
              </button>
            ))}
          </div>

          {/* Add */}
          {!isLeader && (
            <button className="btn-primary text-sm py-1.5" onClick={() => openNew(new Date(), 9)}>
              <Plus size={15} /> Nova Visita
            </button>
          )}
        </div>

        {/* Calendar body */}
        <div className="flex-1 overflow-hidden bg-white">
          {viewMode === 'week' ? WeekView() : MonthView()}
        </div>

        {/* Visit summary by rep */}
        {isLeader && reps.length > 0 && (() => {
          // Count events per rep for the current month
          const month = currentDate.getMonth() + 1;
          const year  = currentDate.getFullYear();
          const counts = {};
          events.forEach(ev => {
            const name = ev.rep_name || '?';
            counts[name] = (counts[name] || 0) + 1;
          });
          const total = Object.values(counts).reduce((a,b)=>a+b,0);
          return (
            <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 flex-shrink-0">
              <div className="flex items-center gap-1 mb-1.5">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Visitas — {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][month-1]}/{year}</span>
                <span className="ml-auto text-xs font-bold text-primary-600">{total} total</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {reps.map((r, i) => (
                  <span key={r.id} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: EVENT_COLORS[i % EVENT_COLORS.length] }} />
                    <span className="font-medium">{r.name}</span>
                    <span className="text-gray-400 font-bold">{counts[r.name] || 0}</span>
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Day Popup (overflow events) ── */}
      {dayPopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[300] p-4" onClick={() => setDayPopup(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-900">
                  {dayPopup.day.toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' })}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">{dayPopup.events.length} visita{dayPopup.events.length > 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setDayPopup(null)} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
            </div>

            {/* All events for this day */}
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {dayPopup.events.map((ev, ei) => (
                <div
                  key={ev.id}
                  onClick={() => { openEdit(ev, { stopPropagation: () => {} }); setDayPopup(null); }}
                  className="flex items-start gap-3 p-3 rounded-xl cursor-pointer hover:bg-gray-50 border border-gray-100 transition-colors group"
                >
                  <div className="w-3 h-3 rounded-full mt-1 flex-shrink-0" style={{ background: EVENT_COLORS[ei % EVENT_COLORS.length] }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 text-sm truncate">{ev.client_name || ev.title || 'Visita'}</div>
                    <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                      {ev.time && <span>{ev.time}</span>}
                      {ev.rep_name && <span>· {ev.rep_name}</span>}
                      {hasReport(ev) && <span className="text-green-500">· Relato preenchido</span>}
                    </div>
                    {ev.title && ev.client_name && (
                      <div className="text-xs text-gray-500 mt-0.5 truncate">{ev.title}</div>
                    )}
                  </div>
                  <Edit2 size={13} className="text-gray-300 group-hover:text-primary-500 flex-shrink-0 mt-1 transition-colors" />
                </div>
              ))}
            </div>

            {/* Add new event for this day */}
            {!isLeader && (
              <button
                onClick={() => { openNew(dayPopup.day, 9); setDayPopup(null); }}
                className="btn-primary w-full justify-center mt-4 text-sm"
              >
                <Plus size={14} /> Nova visita neste dia
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Side Panel ── */}
      {panel && (
        <div className="w-80 flex-shrink-0 border-l border-gray-200 shadow-2xl bg-white flex flex-col overflow-hidden">
          <EventPanel
            key={panel.event?.id ?? `new-${Date.now()}`}
            event={panel.event}
            clients={clients}
            reps={reps}
            isNew={panel.mode === 'new'}
            defaultDate={panel.date}
            defaultHour={panel.hour}
            currentRepId={user?.rep_id}
            isLeader={isLeader}
            onSave={handleSave}
            onDelete={panel.mode === 'edit' ? handleDelete : null}
            onClose={() => setPanel(null)}
          />
        </div>
      )}
    </div>
  );
}
