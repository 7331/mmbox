// A visitor's own S3-compatible bucket. The settings, keys included, stay in this browser (localStorage
// "mmbox.bucket"); the server sees them only per relay request and never stores them. "direct": the browser signs
// and talks to the bucket (needs CORS, any size, video too). "relay": the mmbox server does it (`/api/buckets/*`,
// images only, stripped on the server).
import { AwsClient } from "aws4fetch"

import { abortRequestOnSignal, UploadFailure } from "@/lib/server_upload"
import { uploadTimeoutMilliseconds, type PendingUpload } from "@/lib/media_upload_types"

export interface BucketSettings {
  endpoint: string
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  publicBase: string
  prefix: string
  mode: "direct" | "relay"
}

export type BucketSettingsFormValues = Omit<BucketSettings, "mode">

export interface BucketObject {
  key: string
  sizeBytes: number
  lastModifiedAt: string
}

export interface BucketListingPage {
  objects: BucketObject[]
  nextContinuationToken: string | null
}

// The browser could not reach the bucket at all, which is how a missing CORS policy shows.
export class BucketBlockedError extends UploadFailure {}

const bucketSettingsStorageKey = "mmbox.bucket"
const corsTestObjectName = "media-cors-test"

export function loadBucketSettings(): BucketSettings | null {
  try {
    const storedSettingsText = localStorage.getItem(bucketSettingsStorageKey)
    return storedSettingsText ? (JSON.parse(storedSettingsText) as BucketSettings) : null
  } catch {
    return null
  }
}

export function saveBucketSettings(bucketSettings: BucketSettings | null): void {
  if (bucketSettings) localStorage.setItem(bucketSettingsStorageKey, JSON.stringify(bucketSettings))
  else localStorage.removeItem(bucketSettingsStorageKey)
}

export function normalizeBucketSettings(formValues: BucketSettingsFormValues): BucketSettings {
  return {
    mode: "direct",
    endpoint: formValues.endpoint.trim().replace(/\/+$/, ""),
    bucket: formValues.bucket.trim(),
    region: formValues.region.trim() || "auto",
    accessKeyId: formValues.accessKeyId.trim(),
    secretAccessKey: formValues.secretAccessKey.trim(),
    publicBase: formValues.publicBase.trim().replace(/\/+$/, ""),
    prefix: formValues.prefix.trim().replace(/^\/+|\/+$/g, ""),
  }
}

const corsRule = (pageOrigin: string) => ({
  AllowedOrigins: [pageOrigin],
  AllowedMethods: ["GET", "PUT", "DELETE"],
  AllowedHeaders: ["*"],
  ExposeHeaders: ["ETag"],
  MaxAgeSeconds: 3600,
})

// The one-time bucket setting a browser upload needs; shown to the visitor to paste.
export function createCorsPolicyText(pageOrigin: string): string {
  return JSON.stringify([corsRule(pageOrigin)], null, 2)
}

// The same policy as a one-line AWS CLI command (works against R2, RustFS, MinIO, AWS).
export function createCorsCommandText(bucketSettings: Pick<BucketSettings, "endpoint" | "bucket">, pageOrigin: string): string {
  const corsConfiguration = { CORSRules: [corsRule(pageOrigin)] }
  return `aws s3api put-bucket-cors --endpoint-url ${bucketSettings.endpoint || "<endpoint>"} --bucket ${bucketSettings.bucket || "<bucket>"} --cors-configuration '${JSON.stringify(corsConfiguration)}'`
}

export function buildObjectKey(bucketSettings: BucketSettings, transportName: string): string {
  return bucketSettings.prefix ? `${bucketSettings.prefix}/${transportName}` : transportName
}

const encodeKeyPath = (objectKey: string): string => objectKey.split("/").map(encodeURIComponent).join("/")

// Path-style object URL: works on R2, RustFS, MinIO and AWS alike.
function buildSignedObjectUrl(bucketSettings: BucketSettings, objectKey: string): string {
  return `${bucketSettings.endpoint}/${encodeURIComponent(bucketSettings.bucket)}/${encodeKeyPath(objectKey)}`
}

export function buildPublicObjectUrl(bucketSettings: BucketSettings, objectKey: string): string {
  return `${bucketSettings.publicBase}/${encodeKeyPath(objectKey)}`
}

function createSigningClient(bucketSettings: BucketSettings): AwsClient {
  return new AwsClient({
    accessKeyId: bucketSettings.accessKeyId,
    secretAccessKey: bucketSettings.secretAccessKey,
    service: "s3",
    region: bucketSettings.region,
    retries: 0,
  })
}

async function signObjectRequest(
  bucketSettings: BucketSettings,
  objectKey: string,
  method: "PUT" | "DELETE",
  contentType?: string,
): Promise<Request> {
  // The body is not hashed, so a large video is not read twice in the browser.
  const requestHeaders: Record<string, string> = { "x-amz-content-sha256": "UNSIGNED-PAYLOAD" }
  if (contentType) requestHeaders["content-type"] = contentType
  return createSigningClient(bucketSettings).sign(buildSignedObjectUrl(bucketSettings, objectKey), { method, headers: requestHeaders })
}

function explainBlockedBrowser(bucketSettings: BucketSettings): UploadFailure {
  return new BucketBlockedError(
    `The bucket refused the browser. Add the CORS policy for ${location.origin} to ${bucketSettings.bucket} (see bucket settings).`,
  )
}

// Signed PUT over XMLHttpRequest, because fetch() exposes no upload progress.
export async function uploadDirectlyToBucket(
  bucketSettings: BucketSettings,
  pendingUpload: PendingUpload,
  onProgress: (percent: number) => void,
  abortSignal?: AbortSignal,
): Promise<{ key: string; url: string }> {
  const objectKey = buildObjectKey(bucketSettings, pendingUpload.transportName)
  const signedRequest = await signObjectRequest(bucketSettings, objectKey, "PUT", pendingUpload.contentType)
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    abortRequestOnSignal(request, abortSignal, reject)
    request.open("PUT", signedRequest.url)
    request.timeout = uploadTimeoutMilliseconds * 10
    signedRequest.headers.forEach((headerValue, headerName) => {
      if (headerName !== "host") request.setRequestHeader(headerName, headerValue)
    })
    request.upload.addEventListener("progress", (progressEvent) => {
      if (progressEvent.lengthComputable) onProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100))
    })
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) resolve({ key: objectKey, url: buildPublicObjectUrl(bucketSettings, objectKey) })
      else reject(new UploadFailure(`Bucket rejected the upload (${request.status})`))
    })
    request.addEventListener("error", () => reject(explainBlockedBrowser(bucketSettings)))
    request.addEventListener("timeout", () => reject(new UploadFailure("Upload timed out")))
    request.send(pendingUpload.uploadFile)
  })
}

async function deleteDirectlyFromBucket(bucketSettings: BucketSettings, objectKey: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(await signObjectRequest(bucketSettings, objectKey, "DELETE"))
  } catch {
    throw explainBlockedBrowser(bucketSettings)
  }
  if (!response.ok && response.status !== 404) throw new Error(`Bucket refused the delete (${response.status})`)
}

// Writes and removes an empty object: proves keys, bucket name and the CORS policy together.
export async function testDirectBucketAccess(bucketSettings: BucketSettings): Promise<void> {
  const objectKey = buildObjectKey(bucketSettings, corsTestObjectName)
  let response: Response
  try {
    response = await fetch(await signObjectRequest(bucketSettings, objectKey, "PUT", "text/plain"), { body: "" })
  } catch {
    throw explainBlockedBrowser(bucketSettings)
  }
  if (!response.ok) throw new Error(`Bucket refused the test upload (${response.status}): check keys and bucket name`)
  await deleteDirectlyFromBucket(bucketSettings, objectKey)
}

// Lists one page under the folder, signed in the browser.
async function listBucketDirectly(bucketSettings: BucketSettings, continuationToken: string | null): Promise<BucketListingPage> {
  const listingUrl = new URL(`${bucketSettings.endpoint}/${encodeURIComponent(bucketSettings.bucket)}`)
  listingUrl.searchParams.set("list-type", "2")
  listingUrl.searchParams.set("max-keys", "100")
  listingUrl.searchParams.set("prefix", bucketSettings.prefix ? `${bucketSettings.prefix}/` : "")
  if (continuationToken) listingUrl.searchParams.set("continuation-token", continuationToken)
  let response: Response
  try {
    response = await createSigningClient(bucketSettings).fetch(listingUrl.toString(), {
      method: "GET",
      headers: { "x-amz-content-sha256": "UNSIGNED-PAYLOAD" },
    })
  } catch {
    throw new BucketBlockedError("bucket blocked the browser")
  }
  if (!response.ok) throw new Error(`Bucket refused the listing (${response.status})`)
  const listingDocument = new DOMParser().parseFromString(await response.text(), "application/xml")
  const readChildText = (parentElement: Element, childName: string): string =>
    parentElement.getElementsByTagName(childName)[0]?.textContent ?? ""
  const objects = [...listingDocument.getElementsByTagName("Contents")].map((contentsElement) => ({
    key: readChildText(contentsElement, "Key"),
    sizeBytes: Number(readChildText(contentsElement, "Size")),
    lastModifiedAt: readChildText(contentsElement, "LastModified"),
  }))
  const listingIsTruncated = listingDocument.getElementsByTagName("IsTruncated")[0]?.textContent === "true"
  const nextContinuationToken = listingDocument.getElementsByTagName("NextContinuationToken")[0]?.textContent ?? null
  return { objects, nextContinuationToken: listingIsTruncated ? nextContinuationToken : null }
}

// The connection as the relay expects it; sent per request, never stored on the server.
function buildRelayConnection(bucketSettings: BucketSettings): Record<string, string> {
  return {
    endpoint: bucketSettings.endpoint,
    bucket: bucketSettings.bucket,
    region: bucketSettings.region,
    access_key_id: bucketSettings.accessKeyId,
    secret_access_key: bucketSettings.secretAccessKey,
  }
}

async function postToBucketRelay(relayPath: string, requestBody: unknown): Promise<Response> {
  const response = await fetch(`/api/buckets/${relayPath}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody),
  })
  if (!response.ok) {
    const failureBody = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(failureBody?.message || `Relay failed (${response.status})`)
  }
  return response
}

export async function checkBucketThroughRelay(bucketSettings: BucketSettings): Promise<void> {
  await postToBucketRelay("check", { connection: buildRelayConnection(bucketSettings), prefix: bucketSettings.prefix })
}

async function listBucketThroughRelay(bucketSettings: BucketSettings, continuationToken: string | null): Promise<BucketListingPage> {
  const response = await postToBucketRelay("objects", {
    connection: buildRelayConnection(bucketSettings),
    prefix: bucketSettings.prefix,
    continuation_token: continuationToken,
  })
  const responseBody = (await response.json()) as {
    objects: { key: string; size_bytes: number; last_modified_at: string }[]
    next_continuation_token: string | null
  }
  return {
    objects: responseBody.objects.map((relayedObject) => ({
      key: relayedObject.key,
      sizeBytes: relayedObject.size_bytes,
      lastModifiedAt: relayedObject.last_modified_at,
    })),
    nextContinuationToken: responseBody.next_continuation_token,
  }
}

// Multipart upload through the relay, over XMLHttpRequest for progress. The server strips the image.
export function uploadThroughBucketRelay(
  bucketSettings: BucketSettings,
  pendingUpload: PendingUpload,
  onProgress: (percent: number) => void,
  abortSignal?: AbortSignal,
): Promise<{ key: string; url: string }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    abortRequestOnSignal(request, abortSignal, reject)
    request.open("POST", "/api/buckets/upload")
    request.responseType = "json"
    request.timeout = uploadTimeoutMilliseconds
    request.upload.addEventListener("progress", (progressEvent) => {
      if (progressEvent.lengthComputable) onProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100))
    })
    request.addEventListener("load", () => {
      const responseBody = request.response as { key?: string; message?: string } | null
      if (request.status >= 200 && request.status < 300 && responseBody?.key) {
        resolve({ key: responseBody.key, url: buildPublicObjectUrl(bucketSettings, responseBody.key) })
        return
      }
      reject(
        new UploadFailure(
          responseBody?.message || `Relay upload failed (${request.status})`,
          Number(request.getResponseHeader("Retry-After")) || 0,
        ),
      )
    })
    request.addEventListener("error", () => reject(new UploadFailure("No connection")))
    request.addEventListener("timeout", () => reject(new UploadFailure("Upload timed out")))
    const uploadForm = new FormData()
    uploadForm.append("file", pendingUpload.uploadFile, pendingUpload.transportName)
    uploadForm.append("connection", JSON.stringify(buildRelayConnection(bucketSettings)))
    uploadForm.append("prefix", bucketSettings.prefix)
    request.send(uploadForm)
  })
}

export function listBucketObjects(bucketSettings: BucketSettings, continuationToken: string | null): Promise<BucketListingPage> {
  return bucketSettings.mode === "relay"
    ? listBucketThroughRelay(bucketSettings, continuationToken)
    : listBucketDirectly(bucketSettings, continuationToken)
}

export async function deleteBucketObject(bucketSettings: BucketSettings, objectKey: string): Promise<void> {
  if (bucketSettings.mode === "relay") await postToBucketRelay("delete", { connection: buildRelayConnection(bucketSettings), key: objectKey })
  else await deleteDirectlyFromBucket(bucketSettings, objectKey)
}

export function describeBucketPlace(bucketSettings: Pick<BucketSettings, "bucket" | "prefix">): string {
  return bucketSettings.prefix ? `${bucketSettings.bucket} / ${bucketSettings.prefix}` : bucketSettings.bucket
}

// How the grid and the viewer show an object: by its key's extension.
export const imageObjectKeyPattern = /\.(png|jpe?g|gif|webp|avif)$/i
export const videoObjectKeyPattern = /\.(mp4|webm|mov)$/i

export const readObjectFileName = (objectKey: string): string => objectKey.split("/").pop() || objectKey
export const readObjectExtension = (objectKey: string): string => objectKey.split(".").pop()?.toLowerCase() || "file"
