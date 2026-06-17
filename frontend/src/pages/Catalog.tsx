import { useState } from 'react'
import { useQuery } from '@thebes/sdk'
import { UNIVERSITY_CID, M, decodeCourses, decodeBool, decodeMyCourses, enroll, seedDemo, type Course, type MyCourse } from '../lib/university-api'
import { MediaImage } from '../components/MediaImage'
import { SeatBar, Button, Spinner, EmptyState, ErrorNote } from '../components/ui'

export function Catalog() {
  const courses = useQuery<Course[]>(UNIVERSITY_CID, M.courses, undefined, decodeCourses)
  const open = useQuery<boolean>(UNIVERSITY_CID, M.open, undefined, (h) => decodeBool(h))
  const mine = useQuery<MyCourse[]>(UNIVERSITY_CID, M.mine, undefined, decodeMyCourses)
  const [busy, setBusy] = useState<bigint>()
  const [seeding, setSeeding] = useState(false)
  const [err, setErr] = useState<string>()

  if (courses.loading) return <Spinner label="Loading the catalog" />
  if (courses.error) return <ErrorNote message={courses.error} />
  const all = courses.data ?? []
  const enrolledIds = new Set((mine.data ?? []).map((c) => c.id.toString()))
  const regOpen = open.data ?? false

  async function doEnroll(c: Course) {
    setBusy(c.id); setErr(undefined)
    try { await enroll(c.id); courses.refetch(); mine.refetch() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(undefined) }
  }
  async function seed() {
    setSeeding(true); setErr(undefined)
    try { await seedDemo(); courses.refetch() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setSeeding(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-extrabold">Course catalog</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${regOpen ? 'bg-[var(--color-seats)]/12 text-[var(--color-seats)]' : 'bg-[var(--color-full)]/10 text-[var(--color-full)]'}`}>
          Registration {regOpen ? 'open' : 'closed'}
        </span>
      </div>
      {err && <div className="mt-4"><ErrorNote message={err} /></div>}

      {all.length === 0 ? (
        <div className="mt-6"><EmptyState
          title="No courses published"
          hint="Load a demo catalog to see registration live, or add courses in the Registrar tab."
          action={<Button onClick={seed} disabled={seeding}>{seeding ? 'Loading…' : 'Load demo data'}</Button>}
        /></div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {all.map((c) => {
            const full = c.seatsLeft === 0n
            const already = enrolledIds.has(c.id.toString())
            return (
              <article key={c.id.toString()} className="card overflow-hidden">
                <MediaImage path={c.photoPath} alt={c.title} ratio="3 / 2" />
                <div className="p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-crimson)]">{c.code}</p>
                  <p className="font-display mt-1 text-lg font-bold leading-tight">{c.title}</p>
                  <p className="text-sm text-ink-soft">{c.instructor}</p>
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs text-ink-soft nums">
                      <span>{c.enrolled.toString()}/{c.capacity.toString()} enrolled</span>
                      <span>{c.seatsLeft.toString()} seats left</span>
                    </div>
                    <SeatBar enrolled={Number(c.enrolled)} capacity={Number(c.capacity)} />
                  </div>
                  <Button className="mt-3 w-full" disabled={already || full || !regOpen || busy === c.id}
                    onClick={() => doEnroll(c)} variant={already ? 'ghost' : 'primary'}>
                    {already ? 'Enrolled ✓' : busy === c.id ? 'Enrolling…' : full ? 'Full' : !regOpen ? 'Registration closed' : 'Enroll'}
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
