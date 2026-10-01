'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore, levelFor } from '../store';
import { Bar, Icon, Toaster, type IconName } from '../components/ui';
import Onboarding from '../views/Onboarding';

const NAV: { href: string; icon: IconName; label: string }[] = [
  { href: '/', icon: 'home', label: 'Home' },
  { href: '/learn', icon: 'learn', label: 'Learn' },
  { href: '/savings', icon: 'savings', label: 'Savings' },
  { href: '/portfolio', icon: 'portfolio', label: 'Portfolio' },
  { href: '/optimizer', icon: 'optimizer', label: 'Optimizer' },
  { href: '/credit', icon: 'credit', label: 'Credit' },
  { href: '/rewards', icon: 'rewards', label: 'Rewards' },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  // Data lives in the browser (localStorage), so render nothing on the server and
  // wait for the first client render; otherwise server and client HTML disagree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const onboarded = useStore((s) => s.profile.onboarded);
  const xp = useStore((s) => s.xp);
  const path = usePathname();

  if (!mounted) return null;
  if (!onboarded) return <Onboarding />;
  const level = levelFor(xp);
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo"><span className="logo-mark">S</span>Sprout</div>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`nav-link${path === n.href ? ' active' : ''}`}>
            <Icon name={n.icon} />{n.label}
          </Link>
        ))}
        <div className="sidebar-foot">
          <div className="eyebrow">Level {level.index}</div>
          <div className="small" style={{ fontWeight: 600, margin: '2px 0 8px' }}>{level.name}</div>
          <Bar value={level.progress} />
          <div className="tiny muted" style={{ marginTop: 6 }}>{xp} XP{level.next ? ` · ${level.toNext} to ${level.next}` : ''}</div>
        </div>
      </aside>
      <main className="main">{children}</main>
      <nav className="mobile-nav" aria-label="Main">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={path === n.href ? 'active' : ''}>
            <Icon name={n.icon} />{n.label}
          </Link>
        ))}
      </nav>
      <Toaster />
    </div>
  );
}
