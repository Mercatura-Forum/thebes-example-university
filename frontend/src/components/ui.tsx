import type { ButtonHTMLAttributes, ReactNode } from 'react'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }
export function Button({ variant = 'primary', className = '', ...props }: BtnProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed'
  const styles: Record<string, string> = {
    primary: 'bg-[var(--color-crimson)] text-white hover:brightness-110 active:brightness-95',
    ghost: 'bg-transparent text-ink ring-1 ring-[var(--color-line)] hover:bg-[var(--color-paper)]',
  }
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />
}

/** Seat-capacity bar — fills toward full; green with seats, red when full. */
export function SeatBar({ enrolled, capacity }: { enrolled: number; capacity: number }) {
  const pct = capacity <= 0 ? 100 : Math.min(100, (enrolled / capacity) * 100)
  const full = enrolled >= capacity
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-line)]">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: full ? 'var(--color-full)' : 'var(--color-seats)' }} />
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-ink-soft text-sm" role="status">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-line)] border-t-[var(--color-crimson)]" />
      {label}…
    </div>
  )
}
export function EmptyState({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="card border-dashed p-10 text-center">
      <p className="font-display text-lg text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">{hint}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
export function ErrorNote({ message }: { message: string }) {
  return <p className="rounded-lg bg-[var(--color-full)]/8 px-3 py-2 text-sm text-[var(--color-full)]">{message}</p>
}
