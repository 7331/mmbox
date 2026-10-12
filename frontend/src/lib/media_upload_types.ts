// What the page uploads and remembers: limits, accepted types, a picked file on its way, and the shelf's records.

export const maximumUploadBytes = 25 * 1024 * 1024
export const thumbnailEdgePixels = 320
export const editorMaximumEdgePixels = 2048
// Expired server links stay on the shelf this long after expiring, then are forgotten.
export const expiredShelfGraceMilliseconds = 24 * 3600 * 1000
export const defaultLifetimeSeconds = 86400
export const uploadTimeoutMilliseconds = 120000

export const imageExtensionsByContentType: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
}
export const possiblyAnimatedContentTypes = new Set(["image/gif", "image/webp"])
// Accepted only when the visitor uploads straight to their own bucket; the server stores images only.
export const videoExtensionsByContentType: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
}

export const acceptedImageTypes = "image/png,image/jpeg,image/gif,image/webp"
export const acceptedImageAndVideoTypes = `${acceptedImageTypes},video/mp4,video/webm,video/quicktime`

// Any lifetime the server accepts (backend media/enums.py: a minute to a week); the page offers these presets and
// Custom (components/lifetime_picker.tsx).
export const minimumLifetimeSeconds = 60
export const maximumLifetimeSeconds = 7 * 86400
export const lifetimePresets = [
  { seconds: 900, label: "15 min" },
  { seconds: 3600, label: "1 hour" },
  { seconds: 86400, label: "1 day" },
] as const
export const lifetimeUnits = [
  { name: "minutes", label: "min", seconds: 60 },
  { name: "hours", label: "hours", seconds: 3600 },
  { name: "days", label: "days", seconds: 86400 },
] as const
export type LifetimeUnit = (typeof lifetimeUnits)[number]

export function isVideoContentType(contentType: string | undefined): boolean {
  return Boolean(contentType && videoExtensionsByContentType[contentType])
}

export interface MarkerRenderSettings {
  width: number
  height: number
  imageType: string
  imageQuality: number
}

// A picked (or edited) file before and during its upload. Replaced, never mutated, when the editor changes it.
export interface PendingUpload {
  originalFile: File
  uploadFile: File | Blob
  contentType: string
  byteCount: number
  previewUrl: string
  transportName: string
  canEdit: boolean
}

// One upload as kept in IndexedDB; `name` only exists on records from before labels.
export interface ShelfRecord {
  id: string
  url: string
  deleteToken: string
  // 0 when the object lives in the visitor's own bucket and never expires.
  expiresAt: number
  // Set for objects in the visitor's own bucket: the key the signed DELETE needs.
  bucketKey?: string
  createdAt: number
  label?: string
  bytes?: number
  contentType?: string
  thumbnail?: Blob | null
  name?: string
}

export interface ShelfItem extends ShelfRecord {
  label: string
  previewUrl: string
  previewIsObjectUrl: boolean
}

export interface ServerUploadResponse {
  url: string
  id: string
  expires_at: string
  ttl: number
  delete_token: string
}
