import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BookOpen, Briefcase, Database, FileCheck, Home, LogOut, MessageSquare, Settings, Shield, UserCircle, Users } from 'lucide-react';
import { useProduct, useSession } from '@/state/session';
import { cx } from '@/components/ui';
import { MOCK_MODE } from '@/api/client';
import type { Role } from '@shared/lib/types';

interface NavItem { to: string; label: string; icon: React.ComponentType<{ className?: string }>; roles: Role[]; end?: boolean }

const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, roles: ['client', 'advisor', 'admin'], end: true },
  { to: '/plan/profile', label: 'My plan', icon: Briefcase, roles: ['client'] },
  { to: '/clients', label: 'Clients', icon: Users, roles: ['advisor', 'admin'] },
  { to: '/proposals', label: 'Proposals', icon: FileCheck, roles: ['client', 'advisor', 'admin'] },
  { to: '/assistant', label: 'Assistant', icon: MessageSquare, roles: ['client', 'advisor', 'admin'] },
  { to: '/playbook', label: 'Playbook', icon: BookOpen, roles: ['client', 'advisor', 'admin'] },
  { to: '/data', label: 'Data & sources', icon: Database, roles: ['client', 'advisor', 'admin'] },
  { to: '/admin/users', label: 'Users', icon: Shield, roles: ['admin'] },
  { to: '/admin/audit', label: 'Audit log', icon: FileCheck, roles: ['admin'] },
  { to: '/admin/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
  { to: '/account', label: 'Account', icon: UserCircle, roles: ['client', 'advisor', 'admin'] },
];

/** Product mark. Base Case: the line chart on ink. Flight Plan: the original cockpit mark (magenta track on a panel tile). */
export function ProductLogo({ size = 22, tagline = false }: { size?: number; tagline?: boolean }) {
  const product = useProduct();
  const flight = product.key === 'flight-plan';
  if (flight) {
    return (
      <div className="flex items-center gap-3">
        <svg width={size + 4} height={size + 4} viewBox="0 0 32 32" aria-hidden>
          <rect width="32" height="32" rx="6" fill="#121821" stroke="#243042" />
          <path d="M5 21 L12 14 L19 17 L27 9" stroke="#FF4FD8" strokeWidth="2.2" fill="none" />
          <circle cx="27" cy="9" r="2.2" fill="#FF4FD8" />
        </svg>
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-[0.22em] uppercase">{product.name}</div>
          {tagline && <div className="text-[10px] tracking-[0.12em] uppercase text-ink-3">{product.tagline}</div>}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="7" fill="rgb(var(--c-ink))" />
        <path d="M8 22 L13 14 L18 18 L24 9" fill="none" stroke="rgb(var(--c-rec))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="24" cy="9" r="2.5" fill="rgb(var(--c-paper))" />
      </svg>
      <span className="font-semibold tracking-tight">{product.name}</span>
    </div>
  );
}

function Logo() {
  return <ProductLogo />;
}

export function AppShell() {
  const { me, logout } = useSession();
  const product = useProduct();
  const navigate = useNavigate();
  const role = me?.user.role ?? 'client';
  const items = NAV.filter((n) => n.roles.includes(role));
  const doLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (product.key === 'flight-plan') return <CockpitShell items={items} onLogout={doLogout} />;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cx(
      'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap focus-visible:ring-2 focus-visible:ring-edit focus-visible:outline-none',
      isActive ? 'bg-paper-3 text-ink font-medium' : 'text-ink-2 hover:bg-paper-3',
    );
  const userChip = (
    <div className="flex items-center gap-2 min-w-0">
      <div className="h-7 w-7 shrink-0 rounded-full bg-rec-soft text-rec flex items-center justify-center text-xs font-semibold" aria-hidden>
        {(me?.user.displayName ?? '?').slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 leading-tight">
        <div className="text-sm font-medium truncate">{me?.user.displayName}</div>
        <div className="text-xxs text-ink-3 capitalize truncate">{me?.user.role}{me?.firm.name ? ` · ${me.firm.name}` : ''}</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-paper-2 focus:px-3 focus:py-2">Skip to content</a>
      {/* Left rail (>= 1024) */}
      <aside data-shell className="hidden lg:flex lg:flex-col w-[232px] shrink-0 border-r border-line bg-paper-2/80 backdrop-blur sticky top-0 h-screen">
        <div className="px-4 py-4 border-b border-line-2"><Logo /></div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-0.5">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={linkClass}>
              <n.icon className="h-4 w-4 text-ink-3" aria-hidden />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-line-2 flex items-center justify-between gap-2">
          {userChip}
          <button type="button" onClick={doLogout} aria-label="Sign out" className="rounded p-1.5 text-ink-3 hover:bg-paper-3 focus-visible:ring-2 focus-visible:ring-edit focus-visible:outline-none"><LogOut className="h-4 w-4" aria-hidden /></button>
        </div>
        {MOCK_MODE && <div className="px-3 py-1 text-xxs text-warn bg-warn-soft border-t border-warn/30">Mock API (dev)</div>}
      </aside>
      {/* Top bar (< 1024) */}
      <header data-shell className="lg:hidden sticky top-0 z-40 border-b border-line bg-paper-2/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 h-12">
          <Logo />
          <div className="flex items-center gap-2 min-w-0">
            {userChip}
            <button type="button" onClick={doLogout} aria-label="Sign out" className="rounded p-1.5 text-ink-3 hover:bg-paper-3 focus-visible:ring-2 focus-visible:ring-edit focus-visible:outline-none"><LogOut className="h-4 w-4" aria-hidden /></button>
          </div>
        </div>
        <nav aria-label="Main" className="flex gap-0.5 overflow-x-auto px-2 pb-1.5 -mt-0.5">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={linkClass}>
              <n.icon className="h-4 w-4 text-ink-3" aria-hidden />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main id="main" data-shell-main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}

/** Flight Plan shell: the original's top header (mark, name, tagline) with the platform's navigation as cockpit tabs. */
function CockpitShell({ items, onLogout }: { items: NavItem[]; onLogout: () => void }) {
  const { me } = useSession();
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cx(
      'rounded-sm px-2 py-1 text-[11px] uppercase tracking-[0.12em] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-edit focus-visible:outline-none',
      isActive ? 'bg-edit/15 text-edit' : 'text-ink-3 hover:text-ink',
    );
  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-paper-2 focus:px-3 focus:py-2">Skip to content</a>
      <header data-shell className="no-print sticky top-0 z-40 flex items-center gap-4 border-b border-line bg-[#090D12] px-4 py-2.5 lg:px-6">
        <ProductLogo size={22} tagline />
        <nav aria-label="Main" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded border border-line bg-[#0B1118] p-0.5">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={linkClass}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-3 min-w-0">
          <div className="min-w-0 leading-tight text-right">
            <div className="text-[12px] truncate">{me?.user.displayName}</div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3 truncate">{me?.user.role}{me?.firm.name && me.firm.name !== 'Flight Plan' ? ` · ${me.firm.name}` : ''}</div>
          </div>
          <button type="button" onClick={onLogout} className="ui-btn inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5" aria-label="Sign out"><LogOut className="h-3.5 w-3.5" aria-hidden />Sign out</button>
        </div>
        {MOCK_MODE && <div className="text-[10px] uppercase tracking-wider text-warn">Mock API (dev)</div>}
      </header>
      <main id="main" data-shell-main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}

/** Standard content container. Base Case: max 1280, 24px gutters. Flight Plan: full width like the original. */
export function Page({ children, className, wide }: { children: React.ReactNode; className?: string; wide?: boolean }) {
  const product = useProduct();
  const cockpit = product.key === 'flight-plan';
  return <div className={cx('mx-auto w-full px-4 sm:px-6 py-5', cockpit ? 'max-w-none py-4' : wide ? 'max-w-[1400px]' : 'max-w-[1280px]', className)}>{children}</div>;
}
