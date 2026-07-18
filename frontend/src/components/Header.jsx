import { useEffect, useState, useRef } from 'react';
import { Menu, LogOut, User, Bell, Check, Calendar, DollarSign, Wallet, Upload } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const roleLabels = { leader: 'Líder', representative: 'Representante', seller: 'Vendedor' };

const TYPE_ICON = {
  agenda:    { icon: Calendar,   color: 'text-blue-500',  bg: 'bg-blue-50'   },
  expense:   { icon: DollarSign, color: 'text-red-500',   bg: 'bg-red-50'    },
  provision: { icon: Wallet,     color: 'text-teal-500',  bg: 'bg-teal-50'   },
  upload:    { icon: Upload,     color: 'text-purple-500',bg: 'bg-purple-50' },
  info:      { icon: Bell,       color: 'text-gray-500',  bg: 'bg-gray-50'   },
};

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d}d atrás`;
}

export default function Header({ onMenuClick }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef(null);
  const pollRef  = useRef(null);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  async function fetchNotifs() {
    try {
      const { data } = await api.get('/notifications');
      setNotifs(data.notifications || []);
      setUnread(data.unread || 0);
    } catch(e) { /* ignore */ }
  }

  useEffect(() => {
    fetchNotifs();
    // Poll every 30 seconds
    pollRef.current = setInterval(fetchNotifs, 30000);
    return () => clearInterval(pollRef.current);
  }, []);

  // Close panel on outside click
  useEffect(() => {
    function onClickOut(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClickOut);
    return () => document.removeEventListener('mousedown', onClickOut);
  }, [open]);

  async function markRead(id) {
    await api.post(`/notifications/${id}/read`).catch(() => {});
    fetchNotifs();
  }

  async function markAllRead() {
    await api.post('/notifications/read-all').catch(() => {});
    fetchNotifs();
  }

  function toggleOpen() {
    setOpen(v => !v);
    if (!open) fetchNotifs();
  }

  return (
    <header className="bg-white border-b border-gray-200 h-14 flex items-center px-4 gap-4 flex-shrink-0">
      <button onClick={onMenuClick} className="text-gray-500 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100">
        <Menu size={20} />
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        {/* Bell */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={toggleOpen}
            className={`relative p-1.5 rounded-lg transition-colors ${open ? 'bg-primary-50 text-primary-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
          >
            <Bell size={18} />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {/* Notifications panel */}
          {open && (
            <div className="absolute right-0 top-10 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-[200] overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="font-semibold text-gray-800 text-sm">Notificações</span>
                {unread > 0 && (
                  <button onClick={markAllRead} className="text-xs text-primary-600 hover:text-primary-800 flex items-center gap-1">
                    <Check size={11} /> Marcar todas como lidas
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
                {notifs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                    <Bell size={28} className="mb-2 opacity-30" />
                    <p className="text-sm">Nenhuma notificação</p>
                  </div>
                ) : notifs.map(n => {
                  const cfg = TYPE_ICON[n.type] || TYPE_ICON.info;
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={n.id}
                      onClick={() => markRead(n.id)}
                      className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${!n.read ? 'bg-blue-50/40' : ''}`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg.bg}`}>
                        <Icon size={14} className={cfg.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-semibold ${!n.read ? 'text-gray-900' : 'text-gray-600'}`}>{n.title}</div>
                        {n.body && <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</div>}
                        <div className="text-[10px] text-gray-400 mt-1">{timeAgo(n.created_at)}</div>
                      </div>
                      {!n.read && <span className="w-2 h-2 bg-primary-500 rounded-full mt-2 flex-shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* User info */}
        <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
          <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center">
            <User size={16} className="text-white" />
          </div>
          <div className="text-sm leading-none">
            <div className="font-semibold text-gray-800">{user?.name}</div>
            <div className="text-xs text-gray-500 mt-0.5">{roleLabels[user?.role]}</div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="p-1.5 text-gray-500 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
          title="Sair"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
