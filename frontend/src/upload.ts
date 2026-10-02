import { EXTENSIONS, UPLOAD_TIMEOUT_MILLISECONDS, VIDEO_EXTENSIONS } from "./types";
import type { PendingUpload, UploadApiResponse } from "./types";

export class UploadFailure extends Error {
  retryAfter: number;

  constructor(message: string, retryAfter = 0) {
    super(message);
    this.name = "UploadFailure";
    this.retryAfter = retryAfter;
  }
}

export function randomTransportName(contentType: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const token = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${token}.${EXTENSIONS[contentType] || VIDEO_EXTENSIONS[contentType]}`;
}

export function sendUpload(
  item: PendingUpload,
  ttl: string,
  onProgress: (percent: number) => void,
): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/upload");
    request.responseType = "json";
    request.timeout = UPLOAD_TIMEOUT_MILLISECONDS;
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      const body = request.response as UploadApiResponse | { message?: string } | null;
      if (request.status >= 200 && request.status < 300 && body) {
        resolve(body as UploadApiResponse);
        return;
      }
      reject(
        new UploadFailure(
          (body as { message?: string } | null)?.message || `Upload failed (${request.status})`,
          Number(request.getResponseHeader("Retry-After")) || 0,
        ),
      );
    });
    request.addEventListener("error", () => reject(new UploadFailure("No connection")));
    request.addEventListener("timeout", () => reject(new UploadFailure("Upload timed out")));
    const form = new FormData();
    form.append("file", item.uploadFile, item.transportName);
    form.append("ttl", ttl);
    request.send(form);
  });
}
