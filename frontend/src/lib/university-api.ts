/** university-api.ts — typed reads/writes for the Quad registrar backend
 *  (trap-on-error throughout → SPA gets a clean success or a typed error). */
import { query, update, encodeArg, encodeArgs, decodeVecRecord, decodeNat } from '@thebes/sdk'
import { UNIVERSITY_CID } from './config'
import { calibrate } from './chainTime'

export interface CatalogRow {
  id: bigint; code: string; title: string; credits: bigint; capacity: bigint; enrolled: bigint
  instructor: string; photoPath: string; prereqIds: string; waitlistLen: bigint
  myState: string; lockReason: string; nowNs: bigint
}
export interface Standing {
  creditsInProgress: bigint; creditsCompleted: bigint; gpaX100: bigint
  enrolledCount: bigint; transcriptCount: bigint; maxLoad: bigint; nowNs: bigint
}
export interface TranscriptRow { courseId: bigint; code: string; title: string; credits: bigint; gradeX100: bigint; at: bigint }
export interface SealRow {
  courses: bigint; seatsFilled: bigint; seatsTotal: bigint; students: bigint
  waitlisted: bigint; transcriptLines: bigint; violations: bigint; checkedAt: bigint
}
export interface ViolationRow { rule: string; detail: string }
export interface RollRow { student: string; load: bigint }

type F = { name: string; type: 'nat' | 'int' | 'bool' | 'text' | 'principal' }
const nat = (n: string): F => ({ name: n, type: 'nat' })
const int = (n: string): F => ({ name: n, type: 'int' })
const text = (n: string): F => ({ name: n, type: 'text' })
const principal = (n: string): F => ({ name: n, type: 'principal' })

const CATALOG_FIELDS: F[] = [
  nat('id'), text('code'), text('title'), nat('credits'), nat('capacity'), nat('enrolled'),
  text('instructor'), text('photoPath'), text('prereqIds'), nat('waitlistLen'),
  text('myState'), text('lockReason'), int('nowNs'),
]
const STANDING_FIELDS: F[] = [
  nat('creditsInProgress'), nat('creditsCompleted'), nat('gpaX100'),
  nat('enrolledCount'), nat('transcriptCount'), nat('maxLoad'), int('nowNs'),
]
const TRANSCRIPT_FIELDS: F[] = [nat('courseId'), text('code'), text('title'), nat('credits'), nat('gradeX100'), int('at')]
const SEAL_FIELDS: F[] = [
  nat('courses'), nat('seatsFilled'), nat('seatsTotal'), nat('students'),
  nat('waitlisted'), nat('transcriptLines'), nat('violations'), int('checkedAt'),
]
const VIOLATION_FIELDS: F[] = [text('rule'), text('detail')]
const ROLL_FIELDS: F[] = [principal('student'), nat('load')]

export const decodeCatalog = (h: string) => {
  const rows = decodeVecRecord(h, CATALOG_FIELDS) as unknown as CatalogRow[]
  if (rows.length > 0) calibrate(rows[0].nowNs)
  return rows
}
export const decodeStanding = (h: string) => {
  const rows = decodeVecRecord(h, STANDING_FIELDS) as unknown as Standing[]
  if (rows.length > 0) calibrate(rows[0].nowNs)
  return rows[0]
}
export const decodeTranscript = (h: string) => decodeVecRecord(h, TRANSCRIPT_FIELDS) as unknown as TranscriptRow[]
export const decodeSeal = (h: string) => {
  const rows = decodeVecRecord(h, SEAL_FIELDS) as unknown as SealRow[]
  if (rows.length > 0) calibrate(rows[0].checkedAt)
  return rows[0]
}
export const decodeViolations = (h: string) => decodeVecRecord(h, VIOLATION_FIELDS) as unknown as ViolationRow[]
export const decodeRoll = (h: string) => decodeVecRecord(h, ROLL_FIELDS) as unknown as RollRow[]

export const M = {
  catalog: 'catalogView', standing: 'myStandingView', transcript: 'myTranscriptView',
  seal: 'universitySealView', invariants: 'invariantReportView', roll: 'rollView',
} as const

export const idArg = (id: bigint) => encodeArg({ type: 'nat', value: id })

// ── Writes ──
export async function enroll(courseId: bigint): Promise<void> {
  await update(UNIVERSITY_CID, 'enroll', encodeArg({ type: 'nat', value: courseId }))
}
export async function drop(courseId: bigint): Promise<void> {
  await update(UNIVERSITY_CID, 'drop', encodeArg({ type: 'nat', value: courseId }))
}
export async function joinWaitlist(courseId: bigint): Promise<bigint> {
  const r = await update(UNIVERSITY_CID, 'joinWaitlist', encodeArg({ type: 'nat', value: courseId }))
  return decodeNat(r.reply_hex ?? r.reply ?? '')
}
export async function leaveWaitlist(courseId: bigint): Promise<void> {
  await update(UNIVERSITY_CID, 'leaveWaitlist', encodeArg({ type: 'nat', value: courseId }))
}
export async function addCourse(code: string, title: string, credits: number, capacity: number, instructor: string, prereqs: bigint[], photoPath: string | null): Promise<bigint> {
  const r = await update(UNIVERSITY_CID, 'addCourse', encodeArgs([
    { type: 'text', value: code }, { type: 'text', value: title },
    { type: 'nat', value: BigInt(credits) }, { type: 'nat', value: BigInt(capacity) },
    { type: 'text', value: instructor },
    { type: 'vec', inner: { type: 'nat' }, value: prereqs },
    { type: 'opt', inner: { type: 'text' }, value: photoPath },
  ]))
  return decodeNat(r.reply_hex ?? r.reply ?? '')
}
export async function recordGrade(studentHex: string, courseId: bigint, gradeX100: number): Promise<void> {
  await update(UNIVERSITY_CID, 'recordGrade', encodeArgs([
    { type: 'principal', value: studentHex }, { type: 'nat', value: courseId }, { type: 'nat', value: BigInt(gradeX100) },
  ]))
}
export async function setRegistrationOpen(open: boolean): Promise<void> {
  await update(UNIVERSITY_CID, 'setRegistrationOpen', encodeArg({ type: 'bool', value: open }))
}
export async function claimOwner(): Promise<void> { await update(UNIVERSITY_CID, 'claimOwner') }
export async function seedDemo(): Promise<void> { await update(UNIVERSITY_CID, 'seedDemo') }

/** One-shot chain-clock calibration (the seal carries checkedAt). */
export async function calibrateChainClock(): Promise<void> {
  const r = await query(UNIVERSITY_CID, 'universitySealView')
  decodeSeal(r.reply_hex ?? r.reply ?? '')
}

export function gradeLetter(x100: bigint): string {
  const g = Number(x100)
  return g >= 400 ? 'A' : g >= 300 ? 'B' : g >= 200 ? 'C' : g >= 100 ? 'D' : 'F'
}

export { query, UNIVERSITY_CID }
