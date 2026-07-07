import { useRef, useState } from 'react'
import { useQuery } from '@thebes/sdk'
import {
  UNIVERSITY_CID, M, decodeCatalog, enroll, joinWaitlist, leaveWaitlist, seedDemo,
  type CatalogRow,
} from '../lib/university-api'
import { MediaImage } from '../components/MediaImage'
import { Constellation } from '../components/Constellation'
import { SeatBar, Button, Spinner, EmptyState, ErrorNote } from '../components/ui'

export function Catalog() {
  const catalog = useQuery<CatalogRow[]>(UNIVERSITY_CID, M.catalog, undefined, decodeCatalog)
  const [busy, setBusy] = useState<bigint>()
  const [seeding, setSeeding] = useState(false)
  const [err, setErr] = useState<string>()
  const cardRefs = useRef<Record<string, HTMLElement | null>>({})

  if (catalog.loading) return <Spinner label="Loading the catalog" />
  if (catalog.error) return <ErrorNote message={catalog.error} />
  const all = catalog.data ?? []

  const run = (id: bigint, fn: () => Promise<unknown>) => async () => {
    setBusy(id); setErr(undefined)
    try { await fn(); catalog.refetch() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(undefined) }
  }
  async function seed() {
    setSeeding(true); setErr(undefined)
    try { await seedDemo(); catalog.refetch() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setSeeding(false) }
  }
  function jumpTo(id: bigint) {
    cardRefs.current[id.toString()]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (all.length === 0) {
    return (
      <div className="mt-6"><EmptyState
        title="No courses published"
        hint="Load a demo catalog — six courses with a real prerequisite chain — or add courses in the Registrar tab."
        action={<Button onClick={seed} disabled={seeding}>{seeding ? 'Loading…' : 'Load the demo catalog'}</Button>}
      />{err && <div className="mx-auto mt-4 max-w-md"><ErrorNote message={err} /></div>}</div>
    )
  }

  const codeOf = new Map(all.map((c) => [c.id.toString(), c.code]))

  return (
    <div>
      {/* ── Hero: YOUR degree constellation, computed from your transcript ── */}
      <section className="hero p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="hero-kicker">Computed from your on-chain transcript</p>
            <h1 className="font-display mt-2 text-3xl font-extrabold">Your degree constellation</h1>
          </div>
          <p className="max-w-sm text-xs text-ink-soft">
            Gold = completed · crimson = enrolled · green ring = open to you ·
            dim = locked behind a prerequisite you haven't earned. Click a star.
          </p>
        </div>
        <Constellation rows={all} onPick={jumpTo} className="mt-2 h-[300px] w-full" />
      </section>

      {err && <div className="mt-4"><ErrorNote message={err} /></div>}

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {all.map((c) => {
          const prereqCodes = c.prereqIds ? c.prereqIds.split('|').map((p) => codeOf.get(p) ?? `#${p}`) : []
          const full = c.enrolled >= c.capacity
          const state = c.myState
          return (
            <article key={c.id.toString()} ref={(el) => { cardRefs.current[c.id.toString()] = el }}
              className={`card overflow-hidden ${state === 'locked' ? 'opacity-70' : ''}`}>
              <MediaImage path={c.photoPath} alt={c.title} ratio="3 / 2" />
              <div className="p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-crimson)]">{c.code}</p>
                  <p className="text-xs text-ink-soft nums">{c.credits.toString()} cr</p>
                </div>
                <p className="font-display mt-1 text-lg font-bold leading-tight">{c.title}</p>
                <p className="text-sm text-ink-soft">{c.instructor}</p>
                {prereqCodes.length > 0 && (
                  <p className="mt-1 text-[11px] text-ink-soft">requires {prereqCodes.join(' + ')}</p>
                )}
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-ink-soft nums">
                    <span>{c.enrolled.toString()}/{c.capacity.toString()} enrolled</span>
                    {c.waitlistLen > 0n && <span className="text-amber-600">{c.waitlistLen.toString()} waiting</span>}
                  </div>
                  <SeatBar enrolled={Number(c.enrolled)} capacity={Number(c.capacity)} />
                </div>
                {state === 'completed' && <p className="mt-3 rounded-lg bg-[#d4a017]/12 px-3 py-2 text-center text-sm font-bold text-[#a37812]">Completed ✓</p>}
                {state === 'enrolled' && <p className="mt-3 rounded-lg bg-[var(--color-crimson)]/10 px-3 py-2 text-center text-sm font-bold text-[var(--color-crimson-ink)]">Enrolled — this term</p>}
                {state === 'waitlisted' && (
                  <Button variant="ghost" className="mt-3 w-full" disabled={busy === c.id}
                    onClick={run(c.id, () => leaveWaitlist(c.id))}>Waitlisted — leave the queue</Button>
                )}
                {state === 'locked' && <p className="mt-3 rounded-lg bg-[var(--color-paper)] px-3 py-2 text-center text-xs font-semibold text-ink-soft" data-testid="locked-note">🔒 {c.lockReason}</p>}
                {state === 'full' && (
                  <Button className="mt-3 w-full" disabled={busy === c.id}
                    onClick={run(c.id, () => joinWaitlist(c.id))}>{busy === c.id ? 'Joining…' : `Full — join waitlist (${c.waitlistLen.toString()} ahead)`}</Button>
                )}
                {state === 'open' && (
                  <Button className="mt-3 w-full" disabled={busy === c.id}
                    onClick={run(c.id, () => enroll(c.id))}>{busy === c.id ? 'Enrolling…' : full ? 'Full' : 'Enroll'}</Button>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
