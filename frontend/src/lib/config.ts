/** Contract ids — injected at deploy; fallback 0 until then (university.mo built, not deployed). */
declare global {
  interface Window {
    UNIVERSITY_CID?: number
    MEDIA_CID?: number
  }
}
export const UNIVERSITY_CID: number = (typeof window !== 'undefined' && window.UNIVERSITY_CID) || 0
export const MEDIA_CID: number = (typeof window !== 'undefined' && window.MEDIA_CID) || 0
