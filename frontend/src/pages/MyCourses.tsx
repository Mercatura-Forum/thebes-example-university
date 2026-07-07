import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@thebes/sdk'
import {
  UNIVERSITY_CID, M, decodeCatalog, decodeStanding, decodeTranscript, drop, gradeLetter,
  type CatalogRow, type Standing, type TranscriptRow,
} from '../lib/university-api'
import { wallDate } from '../lib/chainTime'
import { Button, Spinner, EmptyState, ErrorNote } from '../components/ui'

export function MyCourses() {
  const catalog = useQuery<CatalogRow[]>(UNIVERSITY_CID, M.catalog, undefined, decodeCatalog)
  const standing = useQuery<Standing | undefined>(UNIVERSITY_CID, M.standing, undefined, decodeStanding)
  const transcript = useQuery<TranscriptRow[]>(UNIVERSITY_CID, M.transcript, undefined, decodeTranscript)
  const [busy, setBusy] = useState<bigint>()
  const [err, setErr] = useState<string>()

  if (catalog.loading) return <Spinner label="Loading your standing" />
  if (catalog.error) return <ErrorNote message={catalog.error} />
  const mine = (catalog.data ?? []).filter((c) => c.myState === 'enrolled')
  const waits = (catalog.data ?? []).filter((c) => c.myState === 'waitlisted')
  const s = standing.data
  const lines = transcript.data ?? []

  async function doDrop(id: bigint) {
    setBusy(id); setErr(undefined)
    try { await drop(id); catalog.refetch(); standing.refetch() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(undefined) }
  }

  if (mine.length === 0 && lines.length === 0 && waits.length === 0) {
    return <EmptyState title="Nothing on your record yet" hint="Browse the catalog and enroll — your term, transcript and GPA build here."
      action={<Link to="/"><Button>Catalog</Button></Link>} />
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Standing */}
      {s && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card p-4 text-center">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">GPA</p>
            <p className="font-display mt-1 text-3xl font-extrabold nums" data-testid="gpa">
              {(Number(s.gpaX100) / 100).toFixed(2)}
            </p>
            <p className="text-[11px] text-ink-soft">on-chain, credit-weighted</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">This term</p>
            <p className="font-display mt-1 text-3xl font-extrabold nums">{s.creditsInProgress.toString()}<span className="text-base text-ink-soft">/{s.maxLoad.toString()}</span></p>
            <p className="text-[11px] text-ink-soft">credits carried</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Completed</p>
            <p className="font-display mt-1 text-3xl font-extrabold nums">{s.creditsCompleted.toString()}</p>
            <p className="text-[11px] text-ink-soft">credits earned</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Transcript</p>
            <p className="font-display mt-1 text-3xl font-extrabold nums">{s.transcriptCount.toString()}</p>
            <p className="text-[11px] text-ink-soft">lines, append-only</p>
          </div>
        </section>
      )}

      {err && <ErrorNote message={err} />}

      {mine.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold">This term</h2>
          <ul className="mt-3 space-y-2">
            {mine.map((c) => (
              <li key={c.id.toString()} className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-semibold"><span className="text-xs font-bold uppercase tracking-wider text-[var(--color-crimson)]">{c.code}</span> {c.title}</p>
                  <p className="text-xs text-ink-soft nums">{c.credits.toString()} cr · {c.instructor}</p>
                </div>
                <Button variant="ghost" disabled={busy === c.id} onClick={() => doDrop(c.id)}>
                  {busy === c.id ? 'Dropping…' : 'Drop'}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {waits.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold">Waitlists</h2>
          <ul className="mt-3 space-y-2">
            {waits.map((c) => (
              <li key={c.id.toString()} className="card px-4 py-3 text-sm">
                <b>{c.code}</b> {c.title} — queued; you're seated automatically when a seat frees and you're still eligible.
              </li>
            ))}
          </ul>
        </section>
      )}

      {lines.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-bold">Transcript</h2>
          <p className="text-xs text-ink-soft">Recorded once by the registrar; never edited.</p>
          <table className="card mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-left text-[11px] uppercase tracking-wide text-ink-soft">
                <th className="px-4 py-2 font-semibold">Course</th>
                <th className="px-4 py-2 text-right font-semibold">Credits</th>
                <th className="px-4 py-2 text-right font-semibold">Grade</th>
                <th className="px-4 py-2 text-right font-semibold">Recorded</th>
              </tr>
            </thead>
            <tbody className="nums">
              {lines.map((t, i) => (
                <tr key={i} className="border-b border-dashed border-[var(--color-line)] last:border-0">
                  <td className="px-4 py-2"><b>{t.code}</b> <span className="text-ink-soft">{t.title}</span></td>
                  <td className="px-4 py-2 text-right">{t.credits.toString()}</td>
                  <td className="px-4 py-2 text-right font-display font-bold">{gradeLetter(t.gradeX100)}</td>
                  <td className="px-4 py-2 text-right text-xs text-ink-soft">{wallDate(t.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
