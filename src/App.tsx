import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useStore, levelFor } from './store';
import { Bar, Icon, Toaster, type IconName } from './components/ui';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Portfolio from './pages/Portfolio';
import Optimizer from './pages/Optimizer';
import Savings from './pages/Savings';
import Credit from './pages/Credit';
import Learn from './pages/Learn';
import Rewards from './pages/Rewards';

const NAV: { to: string; icon: IconName; label: string }[] = [
  { to: '/', icon: 'home', label: 'Home' },
  { to: '/learn', icon: 'learn', label: 'Learn' },
  { to: '/savings', icon: 'savings', label: 'Savings' },
  { to: '/portfolio', icon: 'portfolio', label: 'Portfolio' },
  { to: '/optimizer', icon: 'optimizer', label: 'Optimizer' },
  { to: '/credit', icon: 'credit', label: 'Credit' },
  { to: '/rewards', icon: 'rewards', label: 'Rewards' },
];

export default function App() {
  const onboarded = useStore((s) => s.profile.onboarded);
  const xp = useStore((s) => s.xp);
  if (!onboarded) return <Onboarding />;
  const level = levelFor(xp);
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo"><span className="logo-mark">S</span>Sprout</div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <Icon name={n.icon} />{n.label}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <div className="eyebrow">Level {level.index}</div>
          <div className="small" style={{ fontWeight: 600, margin: '2px 0 8px' }}>{level.name}</div>
          <Bar value={level.progress} />
          <div className="tiny muted" style={{ marginTop: 6 }}>{xp} XP{level.next ? ` · ${level.toNext} to ${level.next}` : ''}</div>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/savings" element={<Savings />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/optimizer" element={<Optimizer />} />
          <Route path="/credit" element={<Credit />} />
          <Route path="/rewards" element={<Rewards />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      <nav className="mobile-nav" aria-label="Main">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon name={n.icon} />{n.label}
          </NavLink>
        ))}
      </nav>
      <Toaster />
    </div>
  );
}
