import { AwsClient } from "aws4fetch";
import { UPLOAD_TIMEOUT_MILLISECONDS } from "./types";
import type { PendingUpload } from "./types";
import { UploadFailure, abortRequestOnSignal } from "./upload";

/** A visitor's own S3-compatible bucket. Kept in this browser only; the server never sees it. */
export interface BucketSettings {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBase: string;
  prefix: string;
  /** "direct": the browser talks to the bucket (needs CORS). "relay": the mmbox server does it. */
  mode: "direct" | "relay";
}

export interface BucketObject {
  key: string;
  sizeBytes: number;
  lastModifiedAt: string;
}

export interface BucketPage {
  objects: BucketObject[];
  nextContinuationToken: string | null;
}

/** The browser could not reach the bucket at all, which is how a missing CORS policy shows. */
export class BucketBlockedError extends UploadFailure {}

const STORAGE_KEY = "mmbox.bucket";
const CORS_TEST_KEY = "media-cors-test";

export function loadBucketSettings(): BucketSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BucketSettings) : null;
  } catch {
    return null;
  }
}

export function saveBucketSettings(settings: BucketSettings | null): void {
  if (settings) localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  else localStorage.removeItem(STORAGE_KEY);
}

export function normalizeBucketSettings(raw: Omit<BucketSettings, "mode">): BucketSettings {
  return {
    mode: "direct",
    endpoint: raw.endpoint.trim().replace(/\/+$/, ""),
    bucket: raw.bucket.trim(),
    region: raw.region.trim() || "auto",
    accessKeyId: raw.accessKeyId.trim(),
    secretAccessKey: raw.secretAccessKey.trim(),
    publicBase: raw.publicBase.trim().replace(/\/+$/, ""),
    prefix: raw.prefix.trim().replace(/^\/+|\/+$/g, ""),
  };
}

/** The one-time bucket setting a browser upload needs; shown to the visitor to paste. */
export function corsPolicyFor(origin: string): string {
  return JSON.stringify(
    [
      {
        AllowedOrigins: [origin],
        AllowedMethods: ["GET", "PUT", "DELETE"],
        AllowedHeaders: ["*"],
        ExposeHeaders: ["ETag"],
        MaxAgeSeconds: 3600,
      },
    ],
    null,
    2,
  );
}

export function objectKey(settings: BucketSettings, transportName: string): string {
  return settings.prefix ? `${settings.prefix}/${transportName}` : transportName;
}

/** The same policy as a one-line AWS CLI command (works against R2, RustFS, MinIO, AWS). */
export function corsCommandFor(settings: Pick<BucketSettings, "endpoint" | "bucket">, origin: string): string {
  const rules = {
    CORSRules: [
      { AllowedOrigins: [origin], AllowedMethods: ["GET", "PUT", "DELETE"], AllowedHeaders: ["*"], ExposeHeaders: ["ETag"], MaxAgeSeconds: 3600 },
    ],
  };
  return `aws s3api put-bucket-cors --endpoint-url ${settings.endpoint || "<endpoint>"} --bucket ${settings.bucket || "<bucket>"} --cors-configuration '${JSON.stringify(rules)}'`;
}

/** Path-style object URL: works on R2, RustFS, MinIO and AWS alike. */
export function objectUrl(settings: BucketSettings, key: string): string {
  return `${settings.endpoint}/${encodeURIComponent(settings.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function publicUrl(settings: BucketSettings, key: string): string {
  return `${settings.publicBase}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function clientFor(settings: BucketSettings): AwsClient {
  return new AwsClient({
    accessKeyId: settings.accessKeyId,
    secretAccessKey: settings.secretAccessKey,
    service: "s3",
    region: settings.region,
    retries: 0,
  });
}

async function signedRequest(
  settings: BucketSettings,
  key: string,
  method: "PUT" | "DELETE",
  contentType?: string,
): Promise<Request> {
  const headers: Record<string, string> = {
    // The body is not hashed, so a large video is not read twice in the browser.
    "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
  };
  if (contentType) headers["content-type"] = contentType;
  return clientFor(settings).sign(objectUrl(settings, key), { method, headers });
}

function explainNetworkFailure(settings: BucketSettings): UploadFailure {
  return new BucketBlockedError(
    `The bucket refused the browser. Add the CORS policy for ${location.origin} to ${settings.bucket} (see bucket settings).`,
  );
}

/** Signed PUT over XMLHttpRequest, because fetch() exposes no upload progress. */
export function uploadToBucket(
  settings: BucketSettings,
  item: PendingUpload,
  onProgress: (percent: number) => void,
  abortSignal?: AbortSignal,
): Promise<{ key: string; url: string }> {
  const key = objectKey(settings, item.transportName);
  return signedRequest(settings, key, "PUT", item.contentType).then(
    (signed) =>
      new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        abortRequestOnSignal(request, abortSignal, reject);
        request.open("PUT", signed.url);
        request.timeout = UPLOAD_TIMEOUT_MILLISECONDS * 10;
        signed.headers.forEach((value, name) => {
          if (name !== "host") request.setRequestHeader(name, value);
        });
        request.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
        });
        request.addEventListener("load", () => {
          if (request.status >= 200 && request.status < 300) resolve({ key, url: publicUrl(settings, key) });
          else reject(new UploadFailure(`Bucket rejected the upload (${request.status})`));
        });
        request.addEventListener("error", () => reject(explainNetworkFailure(settings)));
        request.addEventListener("timeout", () => reject(new UploadFailure("Upload timed out")));
        request.send(item.uploadFile);
      }),
  );
}

export async function deleteFromBucket(settings: BucketSettings, key: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(await signedRequest(settings, key, "DELETE"));
  } catch {
    throw explainNetworkFailure(settings);
  }
  if (!response.ok && response.status !== 404) throw new Error(`Bucket refused the delete (${response.status})`);
}

/** Writes and removes an empty object: proves keys, bucket name and the CORS policy together. */
export async function testBucket(settings: BucketSettings): Promise<void> {
  const key = objectKey(settings, CORS_TEST_KEY);
  let response: Response;
  try {
    response = await fetch(await signedRequest(settings, key, "PUT", "text/plain"), { body: "" });
  } catch {
    throw explainNetworkFailure(settings);
  }
  if (!response.ok) throw new Error(`Bucket refused the test upload (${response.status}): check keys and bucket name`);
  await deleteFromBucket(settings, key);
}

/** Lists one page under the folder, signed in the browser. */
export async function listBucketDirect(settings: BucketSettings, continuationToken: string | null): Promise<BucketPage> {
  const url = new URL(`${settings.endpoint}/${encodeURIComponent(settings.bucket)}`);
  url.searchParams.set("list-type", "2");
  url.searchParams.set("max-keys", "100");
  url.searchParams.set("prefix", settings.prefix ? `${settings.prefix}/` : "");
  if (continuationToken) url.searchParams.set("continuation-token", continuationToken);
  let response: Response;
  try {
    response = await clientFor(settings).fetch(url.toString(), {
      method: "GET",
      headers: { "x-amz-content-sha256": "UNSIGNED-PAYLOAD" },
    });
  } catch {
    throw new BucketBlockedError("bucket blocked the browser");
  }
  if (!response.ok) throw new Error(`Bucket refused the listing (${response.status})`);
  const documentRoot = new DOMParser().parseFromString(await response.text(), "application/xml");
  const text = (element: Element, name: string): string => element.getElementsByTagName(name)[0]?.textContent ?? "";
  const objects = [...documentRoot.getElementsByTagName("Contents")].map((element) => ({
    key: text(element, "Key"),
    sizeBytes: Number(text(element, "Size")),
    lastModifiedAt: text(element, "LastModified"),
  }));
  const truncated = documentRoot.getElementsByTagName("IsTruncated")[0]?.textContent === "true";
  const token = documentRoot.getElementsByTagName("NextContinuationToken")[0]?.textContent ?? null;
  return { objects, nextContinuationToken: truncated ? token : null };
}

/** The connection as the relay expects it; sent per request, never stored on the server. */
function relayConnection(settings: BucketSettings): Record<string, string> {
  return {
    endpoint: settings.endpoint,
    bucket: settings.bucket,
    region: settings.region,
    access_key_id: settings.accessKeyId,
    secret_access_key: settings.secretAccessKey,
  };
}

async function relayPost(path: string, body: unknown): Promise<Response> {
  const response = await fetch(`/api/buckets/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const failure = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(failure?.message || `Relay failed (${response.status})`);
  }
  return response;
}

export async function checkBucketRelay(settings: BucketSettings): Promise<void> {
  await relayPost("check", { connection: relayConnection(settings), prefix: settings.prefix });
}

export async function listBucketRelay(settings: BucketSettings, continuationToken: string | null): Promise<BucketPage> {
  const response = await relayPost("objects", {
    connection: relayConnection(settings),
    prefix: settings.prefix,
    continuation_token: continuationToken,
  });
  const body = (await response.json()) as {
    objects: { key: string; size_bytes: number; last_modified_at: string }[];
    next_continuation_token: string | null;
  };
  return {
    objects: body.objects.map((object) => ({ key: object.key, sizeBytes: object.size_bytes, lastModifiedAt: object.last_modified_at })),
    nextContinuationToken: body.next_continuation_token,
  };
}

export async function deleteBucketRelay(settings: BucketSettings, key: string): Promise<void> {
  await relayPost("delete", { connection: relayConnection(settings), key });
}

/** Multipart upload through the relay, over XMLHttpRequest for progress. The server strips the image. */
export function uploadThroughRelay(
  settings: BucketSettings,
  item: PendingUpload,
  onProgress: (percent: number) => void,
  abortSignal?: AbortSignal,
): Promise<{ key: string; url: string }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    abortRequestOnSignal(request, abortSignal, reject);
    request.open("POST", "/api/buckets/upload");
    request.responseType = "json";
    request.timeout = UPLOAD_TIMEOUT_MILLISECONDS;
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      const body = request.response as { key?: string; message?: string } | null;
      if (request.status >= 200 && request.status < 300 && body?.key) {
        resolve({ key: body.key, url: publicUrl(settings, body.key) });
        return;
      }
      reject(new UploadFailure(body?.message || `Relay upload failed (${request.status})`, Number(request.getResponseHeader("Retry-After")) || 0));
    });
    request.addEventListener("error", () => reject(new UploadFailure("No connection")));
    request.addEventListener("timeout", () => reject(new UploadFailure("Upload timed out")));
    const form = new FormData();
    form.append("file", item.uploadFile, item.transportName);
    form.append("connection", JSON.stringify(relayConnection(settings)));
    form.append("prefix", settings.prefix);
    request.send(form);
  });
}

export async function listBucket(settings: BucketSettings, continuationToken: string | null): Promise<BucketPage> {
  return settings.mode === "relay" ? listBucketRelay(settings, continuationToken) : listBucketDirect(settings, continuationToken);
}

export async function deleteBucketObject(settings: BucketSettings, key: string): Promise<void> {
  return settings.mode === "relay" ? deleteBucketRelay(settings, key) : deleteFromBucket(settings, key);
}
