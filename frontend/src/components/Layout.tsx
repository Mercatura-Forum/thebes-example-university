import { NavLink, Outlet } from 'react-router-dom'
import { SignOutChip } from '@thebes/sdk'

const tabs = [
  { to: '/', label: 'Catalog', end: true },
  { to: '/mine', label: 'My courses' },
  { to: '/registrar', label: 'Registrar' },
]

export function Layout() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--color-line)] bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <NavLink to="/" className="font-display text-2xl font-extrabold tracking-tight">
            Quad<span className="text-[var(--color-crimson)]">.</span>
          </NavLink>
          <nav className="flex items-center gap-1">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end}
                className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${isActive ? 'bg-[var(--color-crimson)]/10 text-[var(--color-crimson-ink)]' : 'text-ink-soft hover:text-ink'}`}>
                {t.label}
              </NavLink>
            ))}
            <SignOutChip className="ml-2 border-l border-[var(--color-line)] pl-3" />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8"><Outlet /></main>
      <footer className="mx-auto max-w-6xl px-5 py-8 text-xs text-ink-soft">
        On-chain course registration — the catalog and every enrollment live on
        the chain. No course is overbooked; no student double-enrolls.
      </footer>
    </div>
  )
}
