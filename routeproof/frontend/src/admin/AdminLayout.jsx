import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Megaphone, MapPinned, Users, ShieldCheck, Truck, ClipboardList, History, LogOut, Menu } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { useLang } from '../i18n.jsx';
import { LangSwitch, Logo } from '../ui.jsx';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/campaigns', label: 'Campaigns', icon: Megaphone },
  { to: '/admin/visits', label: 'Visits', icon: MapPinned },
  { to: '/admin/drivers', label: 'Drivers', icon: Users },
  { to: '/admin/subadmins', label: 'Sub-admins', icon: ShieldCheck, admin: true },
  { to: '/admin/vehicles', label: 'Vehicles', icon: Truck },
  { to: '/admin/vehicle-log', label: 'Driver-vehicle log', icon: ClipboardList, perm: 'reports' },
  { to: '/admin/activity', label: 'Activity log', icon: History, admin: true },
];

export default function AdminLayout() {
  const { user, logout, can } = useAuth();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  useLocation();
  const items = NAV.filter((n) => (!n.admin || user.role === 'admin') && (!n.perm || can(n.perm)));
  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="brand"><Logo size={30} /> RouteProof</div>
        <hr />
        <div className="side-sub">Operations</div>
        <nav className="nav" onClick={() => setOpen(false)}>
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <n.icon size={18} /> {t(n.label)}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div>
            <div className="who">{user.name}</div>
            <div className="role">{user.role === 'admin' ? t('Admin') : t('Sub-admin')}</div>
          </div>
          <LangSwitch />
          <button className="btn sm" style={{ background: 'var(--navy-2)', color: '#E2E8F0', borderColor: 'var(--navy-3)' }} onClick={logout}>
            <LogOut size={15} /> {t('Log out')}
          </button>
        </div>
      </aside>
      <main className="main">
        <button className="icon-btn menu-btn" style={{ marginBottom: 10 }} onClick={() => setOpen((o) => !o)} aria-label="Menu">
          <Menu size={22} />
        </button>
        <Outlet />
      </main>
    </div>
  );
}
