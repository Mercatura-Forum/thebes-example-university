/** university-api.ts — typed reads/writes for the course-registration backend
 *  (trap-on-error throughout → SPA gets a clean success or a typed error). */
import { query, update, encodeArg, encodeArgs, decodeVecRecord, decodeBool } from '@thebes/sdk'
import { UNIVERSITY_CID } from './config'

export interface Course {
  id: bigint; code: string; title: string; capacity: bigint; enrolled: bigint; seatsLeft: bigint; instructor: string; photoPath: string
}
export interface MyCourse { id: bigint; code: string; title: string; instructor: string; photoPath: string }

const COURSE_FIELDS = [
  { name: 'id', type: 'nat' as const }, { name: 'code', type: 'text' as const }, { name: 'title', type: 'text' as const },
  { name: 'capacity', type: 'nat' as const }, { name: 'enrolled', type: 'nat' as const }, { name: 'seatsLeft', type: 'nat' as const },
  { name: 'instructor', type: 'text' as const }, { name: 'photoPath', type: 'text' as const },
]
const MYCOURSE_FIELDS = [
  { name: 'id', type: 'nat' as const }, { name: 'code', type: 'text' as const }, { name: 'title', type: 'text' as const },
  { name: 'instructor', type: 'text' as const }, { name: 'photoPath', type: 'text' as const },
]

export const decodeCourses = (h: string) => decodeVecRecord(h, COURSE_FIELDS) as unknown as Course[]
export const decodeMyCourses = (h: string) => decodeVecRecord(h, MYCOURSE_FIELDS) as unknown as MyCourse[]
export { decodeBool }

export const M = { courses: 'coursesView', mine: 'myCoursesView', open: 'isRegistrationOpen' } as const

// ── Writes (trap-on-error) ──
export async function enroll(courseId: bigint): Promise<void> { await update(UNIVERSITY_CID, 'enroll', encodeArg({ type: 'nat', value: courseId })) }
export async function drop(courseId: bigint): Promise<void> { await update(UNIVERSITY_CID, 'drop', encodeArg({ type: 'nat', value: courseId })) }
export async function claimOwner(): Promise<void> { await update(UNIVERSITY_CID, 'claimOwner') }
export async function setRegistrationOpen(open: boolean): Promise<void> { await update(UNIVERSITY_CID, 'setRegistrationOpen', encodeArg({ type: 'bool', value: open })) }
export async function addCourse(code: string, title: string, capacity: number, instructor: string, photoPath: string | null): Promise<void> {
  await update(UNIVERSITY_CID, 'addCourse', encodeArgs([
    { type: 'text', value: code }, { type: 'text', value: title }, { type: 'nat', value: BigInt(capacity) },
    { type: 'text', value: instructor }, { type: 'opt', inner: { type: 'text' }, value: photoPath },
  ]))
}

/** Seed a demo course catalog on a fresh registrar (no-op once any course exists). */
export async function seedDemo(): Promise<void> { await update(UNIVERSITY_CID, 'seedDemo') }

export { query, UNIVERSITY_CID }
