import { useRef, useState } from 'react'
import { useQuery, useUpdate, useMediaUpload } from '@thebes/sdk'
import {
  UNIVERSITY_CID, M, decodeCourses, decodeBool, addCourse, setRegistrationOpen, type Course,
} from '../lib/university-api'
import { MEDIA_CID } from '../lib/config'
import { MediaImage } from '../components/MediaImage'
import { Button, SeatBar, Spinner, ErrorNote } from '../components/ui'

export function Registrar() {
  const courses = useQuery<Course[]>(UNIVERSITY_CID, M.courses, undefined, decodeCourses)
  const open = useQuery<boolean>(UNIVERSITY_CID, M.open, undefined, (h) => decodeBool(h))
  const { call } = useUpdate()
  const media = useMediaUpload(MEDIA_CID)
  const fileRef = useRef<HTMLInputElement>(null)
  const [f, setF] = useState({ code: '', title: '', capacity: '30', instructor: '' })
  const [photoPath, setPhotoPath] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string>()
  const [err, setErr] = useState<string>()
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }))

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    try { setPhotoPath((await media.upload(file, 'photo')).path) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }
  async function create() {
    setBusy(true); setErr(undefined); setNote(undefined)
    try {
      await addCourse(f.code.trim() || 'CS101', f.title.trim() || 'Course', Number(f.capacity || '30'), f.instructor.trim(), photoPath)
      setF({ code: '', title: '', capacity: '30', instructor: '' }); setPhotoPath(null)
      if (fileRef.current) fileRef.current.value = ''
      setNote('Course published'); courses.refetch()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  async function toggleReg() {
    setErr(undefined)
    try { await setRegistrationOpen(!(open.data ?? false)); open.refetch() } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }

  const regOpen = open.data ?? false

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      <section className="space-y-6">
        <div className="card p-4">
          <h2 className="font-display text-lg font-bold">Registrar</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => call(UNIVERSITY_CID, 'claimOwner').then(() => setNote('Ownership claimed')).catch((e) => setErr(String(e)))}>Claim ownership</Button>
            <Button onClick={toggleReg}>{regOpen ? 'Close registration' : 'Open registration'}</Button>
          </div>
          <p className="mt-2 text-xs text-ink-soft">Registration is currently <span className="font-semibold">{regOpen ? 'open' : 'closed'}</span>.</p>
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
            <div className="grid grid-cols-2 gap-2">
              <input className={inp} placeholder="Instructor" value={f.instructor} onChange={set('instructor')} />
              <input className={`${inp} nums`} inputMode="numeric" placeholder="Capacity" value={f.capacity} onChange={set('capacity')} />
            </div>
          </div>
          {note && <p className="mt-3 text-sm text-[var(--color-crimson-ink)]">{note}</p>}
          {err && <div className="mt-3"><ErrorNote message={err} /></div>}
          <Button className="mt-3 w-full" onClick={create} disabled={busy || !f.title.trim()}>{busy ? 'Publishing…' : 'Publish course'}</Button>
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-bold">Courses</h2>
        {courses.loading ? <div className="mt-4"><Spinner /></div> : (
          <ul className="mt-4 space-y-3">
            {(courses.data ?? []).map((c) => (
              <li key={c.id.toString()} className="card p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold"><span className="text-[var(--color-crimson)]">{c.code}</span> · {c.title}</p>
                  <span className="text-xs text-ink-soft nums">{c.enrolled.toString()}/{c.capacity.toString()}</span>
                </div>
                <div className="mt-2"><SeatBar enrolled={Number(c.enrolled)} capacity={Number(c.capacity)} /></div>
              </li>
            ))}
            {courses.data?.length === 0 && <p className="text-sm text-ink-soft">No courses yet.</p>}
          </ul>
        )}
      </section>
    </div>
  )
}

const inp = 'w-full rounded-lg border border-[var(--color-line)] bg-paper px-3 py-2 text-sm'
