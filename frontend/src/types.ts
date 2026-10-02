export const MAXIMUM_BYTES = 25 * 1024 * 1024;
export const THUMBNAIL_EDGE = 320;
export const EDITOR_MAXIMUM_EDGE = 2048;
export const HISTORY_GRACE_MILLISECONDS = 24 * 3600 * 1000;
export const DATABASE_NAME = "mmbox";
export const RECORD_STORE = "uploads";
export const DATABASE_VERSION = 1;
export const DEFAULT_TTL = 86400;
export const UPLOAD_TIMEOUT_MILLISECONDS = 120000;

export const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
export const ANIMATED_TYPES = new Set(["image/gif", "image/webp"]);
/** Accepted only when the visitor uploads to their own bucket; the server stores images only. */
export const VIDEO_EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export interface RenderSettings {
  width: number;
  height: number;
  imageType: string;
  imageQuality: number;
}

export interface PendingUpload {
  original: File;
  uploadFile: File | Blob;
  contentType: string;
  bytes: number;
  previewUrl: string;
  transportName: string;
  canEdit?: boolean;
  uploading?: boolean;
  finishing?: boolean;
  renderTarget?: HTMLImageElement;
  renderSettings?: RenderSettings;
}

/** Shape persisted in IndexedDB; `name` only exists on legacy records. */
export interface ShelfRecord {
  id: string;
  url: string;
  deleteToken: string;
  /** 0 when the object lives in the visitor's own bucket and never expires. */
  expiresAt: number;
  /** Set for objects in the visitor's own bucket: the key the signed DELETE needs. */
  bucketKey?: string;
  createdAt: number;
  label?: string;
  bytes?: number;
  contentType?: string;
  thumbnail?: Blob | null;
  name?: string;
}

export interface ShelfItem extends ShelfRecord {
  label: string;
  previewUrl: string;
  previewIsObject: boolean;
  node?: HTMLButtonElement;
  badge?: HTMLElement;
}

export interface UploadApiResponse {
  url: string;
  id: string;
  expires_at: string;
  ttl: number;
  delete_token: string;
}
