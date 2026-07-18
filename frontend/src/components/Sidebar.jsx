import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, TrendingUp, DollarSign, Megaphone,
  FileText, CalendarDays, Building2, Upload, Users, ChevronLeft, ChevronRight, Wind, Cloud
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ['leader','representative','seller'] },
  { to: '/faturamento', icon: TrendingUp, label: 'Faturamento', roles: ['leader','representative','seller'] },
  { to: '/provisoes', icon: DollarSign, label: 'Provisões', roles: ['leader','representative'] },
  { to: '/gastos', icon: FileText, label: 'Gastos', roles: ['leader','representative','seller'] },
  { to: '/marketing', icon: Megaphone, label: 'Verba MKT', roles: ['leader','representative'] },
  { to: '/agenda', icon: CalendarDays, label: 'Agenda', roles: ['leader','representative'] },
  { to: '/clientes', icon: Building2, label: 'Clientes', roles: ['leader','representative'] },
  { to: '/representantes', icon: Users, label: 'Representantes', roles: ['leader'] },
  { to: '/upload', icon: Upload, label: 'Upload Planilha', roles: ['leader'] },
  { to: '/onedrive', icon: Cloud, label: 'Sync Faturamento', roles: ['leader'] },
];

export default function Sidebar({ open, onToggle }) {
  const { user } = useAuth();

  const visible = navItems.filter(n => n.roles.includes(user?.role));

  return (
    <aside
      className={`${open ? 'w-64' : 'w-16'} bg-teal-800 text-white flex flex-col transition-all duration-300 flex-shrink-0`}
      style={{ background: 'linear-gradient(180deg, #0D4F5C 0%, #0a3d47 100%)' }}
    >
      {/* Logo */}
      <div className="flex items-center justify-center px-3 py-4 border-b border-teal-700">
        {open ? (
          <img
            src="/logo-limpar.png"
            alt="LimpAr Auto"
            className="h-10 object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center flex-shrink-0">
            <Wind size={18} className="text-white" />
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {visible.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 mx-2 rounded-lg mb-1 transition-all duration-150 group
              ${isActive
                ? 'bg-primary-500 text-white shadow-md'
                : 'text-teal-100 hover:bg-teal-700 hover:text-white'}`
            }
          >
            <Icon size={18} className="flex-shrink-0" />
            {open && <span className="text-sm font-medium">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Toggle */}
      <button
        onClick={onToggle}
        className="flex items-center justify-center p-3 border-t border-teal-700 text-teal-300 hover:text-white hover:bg-teal-700 transition-colors"
      >
        {open ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        {open && <span className="ml-2 text-xs">Recolher</span>}
      </button>
    </aside>
  );
}
