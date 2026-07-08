import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { SignOutChip, useQuery } from '@thebes/sdk'
import { UNIVERSITY_CID, M, decodeSeal, calibrateChainClock, type SealRow } from '../lib/university-api'

function themePreference(): boolean {
  const saved = localStorage.getItem('quad-theme')
  if (saved) return saved === 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function UniversitySeal() {
  const { data } = useQuery<SealRow>(UNIVERSITY_CID, M.seal, undefined, decodeSeal)
  if (!data) return null
  const ok = Number(data.violations) === 0
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 nums text-[11px]" data-testid="university-seal">
      <span className={`inline-block h-2 w-2 rounded-full ${ok ? 'bg-[var(--color-seats)]' : 'bg-[var(--color-full)]'}`} />
      {ok ? (
        <span>
          <b className="text-ink">Every roll reconciles on-chain</b> · {data.seatsFilled.toString()}/{data.seatsTotal.toString()} seats filled
          across {data.courses.toString()} courses · {data.students.toString()} students · {data.waitlisted.toString()} waitlisted ·{' '}
          {data.transcriptLines.toString()} transcript lines · 0 violations across 5 laws
        </span>
      ) : (
        <span className="font-semibold text-[var(--color-full)]">The oracle reports {data.violations.toString()} violation(s).</span>
      )}
    </div>
  )
}

const tabs = [
  { to: '/', label: 'Catalog', end: true },
  { to: '/mine', label: 'My courses' },
  { to: '/registrar', label: 'Registrar' },
]

export function Layout() {
  const [dark, setDark] = useState(themePreference)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('quad-theme', dark ? 'dark' : 'light')
  }, [dark])
  useEffect(() => { calibrateChainClock().catch(() => {}) }, [])
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--color-line)] bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-1.5 px-5 py-3">
          <NavLink to="/" className="font-display text-2xl font-extrabold tracking-tight">
            Quad<span className="text-[var(--color-crimson)]">.</span>
          </NavLink>
          <nav className="flex flex-wrap items-center justify-end gap-1">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end}
                className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${isActive ? 'bg-[var(--color-crimson)]/10 text-[var(--color-crimson-ink)]' : 'text-ink-soft hover:text-ink'}`}>
                {t.label}
              </NavLink>
            ))}
            <button
              onClick={() => setDark((d) => !d)}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="ml-1 grid h-8 w-8 place-items-center rounded-lg text-ink-soft ring-1 ring-[var(--color-line)] hover:text-ink"
            >
              {dark ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
              )}
            </button>
            <SignOutChip className="ml-2 border-l border-[var(--color-line)] pl-3" />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8"><Outlet /></main>
      <footer className="mx-auto w-full max-w-6xl px-5 py-8 text-xs text-ink-soft">
        <p>
          On-chain registration — the catalog, every enrollment, waitlist and grade
          live on the chain. No seat oversells, no double-enrolls, no course without
          its prerequisites, no load over the cap; the transcript is append-only and
          GPA is computed from it on-chain.
        </p>
        <UniversitySeal />
      </footer>
    </div>
  )
}
