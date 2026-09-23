import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Banknote, Bell, Database, Home, LogOut, Menu, MoreHorizontal, Settings as SettingsIcon, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { APP_NAME } from '../lib/supabase';
import { LogoMark, RoleBadge } from './ui';
import InstallPrompt from './InstallPrompt';
import BackupSheet from './BackupSheet';

const TABS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/loans', label: 'Loans', icon: Banknote },
  { to: '/reminders', label: 'Remind', icon: Bell },
];
const TITLES = { '/': 'Home', '/clients': 'Clients', '/loans': 'Loans', '/reminders': 'Reminders', '/settings': 'Settings' };
function titleFor(pathname) {
  if (TITLES[pathname]) return TITLES[pathname];
  if (pathname.startsWith('/clients/')) return 'Client';
  if (pathname === '/loans/new') return 'New loan';
  if (pathname.startsWith('/loans/')) return 'Loan';
  return null;
}

function Drawer({ onClose, onBackup }) {
  const { admin, isMaster, signOut } = useAuth();

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="drawer-in flex h-full w-[86%] max-w-sm flex-col bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl">
        <div className="flex items-center justify-between bg-brand-600 px-4 py-4 text-white">
          <div className="flex items-center gap-3">
            <LogoMark size={40} />
            <span className="font-display text-xl font-bold">{APP_NAME}</span>
          </div>
          <button aria-label="Close menu" onClick={onClose} className="flex h-12 w-12 items-center justify-center rounded-xl active:bg-white/15"><X size={26} /></button>
        </div>

        <div className="border-b border-stone-200 px-4 py-4">
          <div className="truncate text-lg font-semibold">{admin?.full_name}</div>
          <div className="truncate text-sm text-stone-500">{admin?.email}</div>
          <RoleBadge role={admin?.role} className="mt-2" />
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to} to={to} end={end} onClick={onClose}
              className={({ isActive }) => `flex min-h-[56px] items-center gap-4 rounded-xl px-4 text-lg font-medium ${isActive ? 'bg-brand-50 text-brand-800' : 'text-stone-800 active:bg-stone-100'}`}
            >
              <Icon size={24} /> {label}
            </NavLink>
          ))}
          <div className="mt-4 space-y-2 px-2">
            {isMaster && (
              <NavLink
                to="/settings" onClick={onClose}
                className={({ isActive }) => `flex min-h-[56px] items-center gap-4 rounded-xl px-4 text-lg font-medium ${isActive ? 'bg-brand-50 text-brand-800' : 'text-stone-800 active:bg-stone-100'}`}
              >
                <SettingsIcon size={24} /> Settings
              </NavLink>
            )}
            <button
              onClick={onBackup}
              className="flex min-h-[56px] w-full items-center gap-4 rounded-xl px-4 text-lg font-medium text-stone-800 active:bg-stone-100"
            >
              <Database size={24} /> Backup data
            </button>
            <InstallPrompt />
          </div>
        </nav>

        <div className="border-t border-stone-200 p-4">
          <button className="btn-danger-ghost w-full" onClick={signOut}><LogOut size={20} /> Sign out</button>
        </div>
      </div>
      <button aria-label="Close menu" className="backdrop-in flex-1 bg-black/40" onClick={onClose} />
    </div>
  );
}

export default function AppShell() {
  const { admin } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [pathname]);

  const tabClass = ({ isActive }) =>
    `flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-xs font-semibold ${isActive ? 'text-brand-700' : 'text-stone-500 active:text-stone-800'}`;

  return (
    <div className="min-h-[100dvh]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-1 px-2">
          <button aria-label="Open menu" onClick={() => setOpen(true)} className="flex h-12 w-12 items-center justify-center rounded-xl text-stone-800 active:bg-stone-100">
            <Menu size={26} />
          </button>
          <div className="flex-1 font-display text-xl font-bold text-brand-800">{titleFor(pathname) || APP_NAME}</div>
          <RoleBadge role={admin?.role} className="mr-2" />
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 pb-32 pt-5">
        <Outlet />
      </main>

      {/* Bottom navigation (like a phone app) */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={tabClass}>
              <Icon size={24} /> {label}
            </NavLink>
          ))}
          <button onClick={() => setOpen(true)} className="flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-xs font-semibold text-stone-500 active:text-stone-800">
            <MoreHorizontal size={24} /> More
          </button>
        </div>
      </nav>

      {open && <Drawer onClose={() => setOpen(false)} onBackup={() => { setOpen(false); setBackupOpen(true); }} />}
      {backupOpen && <BackupSheet onClose={() => setBackupOpen(false)} />}
    </div>
  );
}
