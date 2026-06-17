import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@thebes/sdk'
import { UNIVERSITY_CID, M, decodeMyCourses, drop, type MyCourse } from '../lib/university-api'
import { MediaImage } from '../components/MediaImage'
import { Button, Spinner, EmptyState, ErrorNote } from '../components/ui'

export function MyCourses() {
  const { data, loading, error, refetch } = useQuery<MyCourse[]>(UNIVERSITY_CID, M.mine, undefined, decodeMyCourses)
  const [busy, setBusy] = useState<bigint>()
  const [err, setErr] = useState<string>()

  if (loading) return <Spinner label="Loading your schedule" />
  if (error) return <ErrorNote message={error} />
  const mine = data ?? []
  if (mine.length === 0) {
    return <EmptyState title="You're not enrolled in anything" hint="Browse the catalog and enroll while registration is open." action={<Link to="/"><Button>Open catalog</Button></Link>} />
  }

  async function doDrop(id: bigint) {
    setBusy(id); setErr(undefined)
    try { await drop(id); refetch() } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(undefined) }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-extrabold">My schedule</h1>
      {err && <div className="mt-4"><ErrorNote message={err} /></div>}
      <ul className="mt-5 space-y-3">
        {mine.map((c) => (
          <li key={c.id.toString()} className="card flex items-center gap-4 p-3">
            <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg"><MediaImage path={c.photoPath} alt={c.title} ratio="3 / 2" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-crimson)]">{c.code}</p>
              <p className="truncate font-semibold">{c.title}</p>
              <p className="text-sm text-ink-soft">{c.instructor}</p>
            </div>
            <Button variant="ghost" disabled={busy === c.id} onClick={() => doDrop(c.id)}>{busy === c.id ? 'Dropping…' : 'Drop'}</Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
