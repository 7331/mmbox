// Server-hosted images: `POST /api/upload` (multipart, with a lifetime) and `DELETE /api/media/{id}` with the
// delete token. Uploads go over XMLHttpRequest because fetch() reports no upload progress.
import {
  imageExtensionsByContentType,
  uploadTimeoutMilliseconds,
  videoExtensionsByContentType,
  type PendingUpload,
  type ServerUploadResponse,
} from "@/lib/media_upload_types"

export class UploadFailure extends Error {
  retryAfterSeconds: number

  constructor(message: string, retryAfterSeconds = 0) {
    super(message)
    this.name = "UploadFailure"
    this.retryAfterSeconds = retryAfterSeconds
  }
}

// The visitor pressed Cancel; not an error worth a red line.
export class UploadCancelled extends UploadFailure {
  constructor() {
    super("Upload cancelled")
    this.name = "UploadCancelled"
  }
}

// Aborts the request when the signal fires, and rejects with UploadCancelled.
export function abortRequestOnSignal(
  request: XMLHttpRequest,
  abortSignal: AbortSignal | undefined,
  reject: (reason: UploadFailure) => void,
): void {
  if (!abortSignal) return
  if (abortSignal.aborted) {
    reject(new UploadCancelled())
    return
  }
  abortSignal.addEventListener("abort", () => request.abort(), { once: true })
  request.addEventListener("abort", () => reject(new UploadCancelled()))
}

export function createRandomTransportName(contentType: string): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(8))
  const randomToken = [...randomBytes].map((randomByte) => randomByte.toString(16).padStart(2, "0")).join("")
  return `${randomToken}.${imageExtensionsByContentType[contentType] || videoExtensionsByContentType[contentType]}`
}

export function uploadToServer(
  pendingUpload: PendingUpload,
  lifetimeSeconds: number,
  onProgress: (percent: number) => void,
  abortSignal?: AbortSignal,
): Promise<ServerUploadResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    abortRequestOnSignal(request, abortSignal, reject)
    request.open("POST", "/api/upload")
    request.responseType = "json"
    request.timeout = uploadTimeoutMilliseconds
    request.upload.addEventListener("progress", (progressEvent) => {
      if (progressEvent.lengthComputable) onProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100))
    })
    request.addEventListener("load", () => {
      const responseBody = request.response as ServerUploadResponse | { message?: string } | null
      if (request.status >= 200 && request.status < 300 && responseBody) {
        resolve(responseBody as ServerUploadResponse)
        return
      }
      reject(
        new UploadFailure(
          (responseBody as { message?: string } | null)?.message || `Upload failed (${request.status})`,
          Number(request.getResponseHeader("Retry-After")) || 0,
        ),
      )
    })
    request.addEventListener("error", () => reject(new UploadFailure("No connection")))
    request.addEventListener("timeout", () => reject(new UploadFailure("Upload timed out")))
    const uploadForm = new FormData()
    uploadForm.append("file", pendingUpload.uploadFile, pendingUpload.transportName)
    uploadForm.append("ttl", String(lifetimeSeconds))
    request.send(uploadForm)
  })
}

// A 404 counts as deleted: the link expired or was deleted already.
export async function deleteFromServer(mediaId: string, deleteToken: string): Promise<void> {
  const response = await fetch(`/api/media/${mediaId}`, { method: "DELETE", headers: { "X-Delete-Token": deleteToken } })
  if (!response.ok && response.status !== 404) {
    const responseBody = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(responseBody?.message || "Could not delete the upload")
  }
}
