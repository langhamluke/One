import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useStore, levelFor } from './store';
import { Bar, Toaster } from './components/ui';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Portfolio from './pages/Portfolio';
import Optimizer from './pages/Optimizer';
import Savings from './pages/Savings';
import Credit from './pages/Credit';
import Learn from './pages/Learn';

const NAV = [
  { to: '/', icon: '🏠', label: 'Home' },
  { to: '/portfolio', icon: '📊', label: 'Portfolio' },
  { to: '/optimizer', icon: '🎯', label: 'Optimizer' },
  { to: '/savings', icon: '🐷', label: 'Savings' },
  { to: '/credit', icon: '💳', label: 'Credit' },
  { to: '/learn', icon: '🎓', label: 'Learn' },
];

export default function App() {
  const onboarded = useStore((s) => s.profile.onboarded);
  const xp = useStore((s) => s.xp);
  if (!onboarded) return <Onboarding />;
  const level = levelFor(xp);
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo"><span className="logo-mark">🌱</span>Sprout</div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <span className="nav-icon">{n.icon}</span>{n.label}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <div className="small"><strong>Level {level.index} · {level.name}</strong></div>
          <div className="tiny muted" style={{ margin: '2px 0 6px' }}>{xp} XP{level.next ? ` · ${level.toNext} to ${level.next}` : ''}</div>
          <Bar value={level.progress} />
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/optimizer" element={<Optimizer />} />
          <Route path="/savings" element={<Savings />} />
          <Route path="/credit" element={<Credit />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      <nav className="mobile-nav" aria-label="Main">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-icon">{n.icon}</span>{n.label}
          </NavLink>
        ))}
      </nav>
      <Toaster />
    </div>
  );
}
