import { useRef, useState } from 'react'
import { useQuery, useUpdate, useMediaUpload } from '@thebes/sdk'
import {
  UNIVERSITY_CID, M, decodeCatalog, decodeRoll, idArg,
  addCourse, setRegistrationOpen, recordGrade,
  type CatalogRow, type RollRow,
} from '../lib/university-api'
import { MEDIA_CID } from '../lib/config'
import { MediaImage } from '../components/MediaImage'
import { Button, SeatBar, Spinner, ErrorNote } from '../components/ui'

const GRADES = [
  { label: 'A', x100: 400 }, { label: 'B', x100: 300 }, { label: 'C', x100: 200 },
  { label: 'D', x100: 100 }, { label: 'F', x100: 0 },
]

export function Registrar() {
  const catalog = useQuery<CatalogRow[]>(UNIVERSITY_CID, M.catalog, undefined, decodeCatalog)
  const { call } = useUpdate()
  const media = useMediaUpload(MEDIA_CID)
  const fileRef = useRef<HTMLInputElement>(null)
  const [f, setF] = useState({ code: '', title: '', credits: '4', capacity: '30', instructor: '' })
  const [prereqs, setPrereqs] = useState<Set<string>>(new Set())
  const [photoPath, setPhotoPath] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string>()
  const [err, setErr] = useState<string>()
  const [rollFor, setRollFor] = useState<bigint>()
  const roll = useQuery<RollRow[]>(UNIVERSITY_CID, M.roll, idArg(rollFor ?? 0n), decodeRoll, [rollFor?.toString() ?? ''])
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }))

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    try { setPhotoPath((await media.upload(file, 'photo')).path) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }
  async function create() {
    setBusy(true); setErr(undefined); setNote(undefined)
    try {
      await addCourse(
        f.code.trim() || 'CS101', f.title.trim() || 'Course',
        Number(f.credits || '4'), Number(f.capacity || '30'), f.instructor.trim(),
        [...prereqs].map((p) => BigInt(p)), photoPath,
      )
      setF({ code: '', title: '', credits: '4', capacity: '30', instructor: '' }); setPrereqs(new Set()); setPhotoPath(null)
      if (fileRef.current) fileRef.current.value = ''
      setNote('Course published'); catalog.refetch()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  async function grade(student: string, courseId: bigint, x100: number) {
    setErr(undefined); setNote(undefined)
    try {
      await recordGrade(student, courseId, x100)
      setNote('Grade recorded — the seat freed and the waitlist promoted.')
      catalog.refetch(); roll.refetch()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }

  const rows = catalog.data ?? []

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      <section className="space-y-6">
        <div className="card p-4">
          <h2 className="font-display text-lg font-bold">Registrar</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => call(UNIVERSITY_CID, 'claimOwner').then(() => setNote('Ownership claimed')).catch((e) => setErr(String(e)))}>Claim ownership</Button>
            <Button variant="ghost" onClick={() => setRegistrationOpen(true).then(() => setNote('Registration opened')).catch((e) => setErr(String(e)))}>Open registration</Button>
            <Button variant="ghost" onClick={() => setRegistrationOpen(false).then(() => setNote('Registration closed')).catch((e) => setErr(String(e)))}>Close registration</Button>
          </div>
        </div>

        <div className="card p-4">
          <h2 className="font-display text-lg font-bold">Publish a course</h2>
          <div className="mt-3 flex items-center gap-4">
            <div className="w-24 shrink-0 overflow-hidden rounded-xl border border-[var(--color-line)]"><MediaImage path={photoPath ?? ''} alt="Course" ratio="3 / 2" /></div>
            <input ref={fileRef} type="file" accept="image/*" onChange={(e) => pickPhoto(e.target.files?.[0])}
              className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--color-crimson)] file:px-3 file:py-1.5 file:text-white" />
          </div>
          {media.busy && <p className="mt-2 text-xs text-ink-soft nums">Uploading… {Math.round(media.progress * 100)}%</p>}
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <input className={`${inp} w-28`} placeholder="Code" value={f.code} onChange={set('code')} />
              <input className={inp} placeholder="Title" value={f.title} onChange={set('title')} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input className={inp} placeholder="Instructor" value={f.instructor} onChange={set('instructor')} />
              <input className={`${inp} nums`} inputMode="numeric" placeholder="Credits" value={f.credits} onChange={set('credits')} />
              <input className={`${inp} nums`} inputMode="numeric" placeholder="Capacity" value={f.capacity} onChange={set('capacity')} />
            </div>
            {rows.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-ink-soft">Prerequisites (the catalog stays a DAG — only existing courses can be required)</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {rows.map((c) => (
                    <button key={c.id.toString()}
                      onClick={() => setPrereqs((p) => { const n = new Set(p); const k = c.id.toString(); if (n.has(k)) n.delete(k); else n.add(k); return n })}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${prereqs.has(c.id.toString()) ? 'bg-[var(--color-crimson)]/12 text-[var(--color-crimson-ink)] ring-[var(--color-crimson)]/40' : 'text-ink-soft ring-[var(--color-line)]'}`}>
                      {c.code}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {note && <p className="mt-3 text-sm text-[var(--color-crimson-ink)]">{note}</p>}
          {err && <div className="mt-3"><ErrorNote message={err} /></div>}
          <Button className="mt-3 w-full" onClick={create} disabled={busy || !f.title.trim()}>{busy ? 'Publishing…' : 'Publish course'}</Button>
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-bold">Courses & grading</h2>
        {catalog.loading ? <div className="mt-4"><Spinner /></div> : (
          <ul className="mt-4 space-y-3">
            {rows.map((c) => (
              <li key={c.id.toString()} className="card p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold"><span className="text-[var(--color-crimson)]">{c.code}</span> · {c.title}</p>
                  <span className="text-xs text-ink-soft nums">{c.enrolled.toString()}/{c.capacity.toString()}{c.waitlistLen > 0n && <> · {c.waitlistLen.toString()} waiting</>}</span>
                </div>
                <div className="mt-2"><SeatBar enrolled={Number(c.enrolled)} capacity={Number(c.capacity)} /></div>
                <button className="mt-2 text-xs font-semibold text-[var(--color-crimson-ink)] hover:underline"
                  onClick={() => setRollFor(rollFor === c.id ? undefined : c.id)}>
                  {rollFor === c.id ? 'Hide roll' : 'Roll & grades'}
                </button>
                {rollFor === c.id && (
                  <ul className="mt-2 space-y-1.5 border-t border-[var(--color-line)] pt-2" data-testid="roll">
                    {(roll.data ?? []).map((r) => (
                      <li key={r.student} className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono text-ink-soft">{r.student.slice(0, 12)}…</span>
                        <span className="text-ink-soft nums">({r.load.toString()} cr load)</span>
                        <span className="ml-auto flex gap-1">
                          {GRADES.map((g) => (
                            <button key={g.label} onClick={() => grade(r.student, c.id, g.x100)}
                              className="rounded px-1.5 py-0.5 font-bold ring-1 ring-[var(--color-line)] hover:bg-[var(--color-crimson)]/10">
                              {g.label}
                            </button>
                          ))}
                        </span>
                      </li>
                    ))}
                    {(roll.data ?? []).length === 0 && <li className="text-xs text-ink-soft">Nobody enrolled (or you're not the registrar).</li>}
                  </ul>
                )}
              </li>
            ))}
            {rows.length === 0 && <p className="text-sm text-ink-soft">No courses yet.</p>}
          </ul>
        )}
      </section>
    </div>
  )
}

const inp = 'w-full rounded-lg border border-[var(--color-line)] bg-paper px-3 py-2 text-sm'
