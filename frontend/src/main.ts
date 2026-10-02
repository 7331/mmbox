import "./style.css";
import "preline";

import {
  ANIMATED_TYPES,
  DEFAULT_TTL,
  EXTENSIONS,
  MAXIMUM_BYTES,
  THUMBNAIL_EDGE,
  VIDEO_EXTENSIONS,
} from "./types";
import type { PendingUpload, ShelfItem, ShelfRecord, UploadApiResponse } from "./types";
import {
  BucketBlockedError,
  checkBucketRelay,
  corsCommandFor,
  corsPolicyFor,
  loadBucketSettings,
  normalizeBucketSettings,
  saveBucketSettings,
  testBucket,
  uploadThroughRelay,
  uploadToBucket,
} from "./bucket";
import { initBrowse, showBucket } from "./browse";
import type { BucketSettings } from "./bucket";
import { bindHistoryToast, saveRecord } from "./history";
import { UploadFailure, randomTransportName, sendUpload } from "./upload";
import { clickEditorDone, closeMarkerEditor, openMarkerEditor } from "./editor";
import type { EditorHooks } from "./editor";
import {
  absoluteUrl,
  copyItem,
  copyText,
  createShelfItem,
  formatLongDate,
  initShelf,
  publicLabel,
  restoreShelf,
  shareItem,
  startCountdown,
  uploads,
} from "./shelf";

const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const pickerView = element("pickerView");
const selectedView = element("selectedView");
const progressView = element("progressView");
const resultView = element("resultView");
const filePicker = element<HTMLInputElement>("filePicker");
const ttlSelect = element<HTMLSelectElement>("ttlSelect");
const selectedImage = element<HTMLImageElement>("selectedImage");
const selectedNote = element("selectedNote");
const progressImage = element<HTMLImageElement>("progressImage");
const progressFill = element("progressFill");
const progressText = element("progressText");
const resultImage = element<HTMLImageElement>("resultImage");
const resultLink = element("resultLink");
const dragCover = element("dragCover");
const toast = element("toast");

let pending: PendingUpload | null = null;
let bucketSettings: BucketSettings | null = loadBucketSettings();
let lastResult: ShelfItem | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function storedLifetime(): number {
  try {
    return Number(localStorage.getItem("mmbox.lifetime")) || DEFAULT_TTL;
  } catch {
    return DEFAULT_TTL;
  }
}
ttlSelect.value = String(storedLifetime());

function showOnly(view: HTMLElement): void {
  [pickerView, selectedView, progressView, resultView].forEach((candidate) => {
    candidate.hidden = candidate !== view;
  });
}

function say(message: string, tone = ""): void {
  if (toastTimer) clearTimeout(toastTimer);
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

function paintBucketStatus(): void {
  const active = Boolean(bucketSettings);
  const relayed = bucketSettings?.mode === "relay";
  element("bucketStatusText").textContent = active
    ? `Your bucket: ${bucketSettings!.bucket}${relayed ? " (relayed)" : ""}`
    : "Temporary storage";
  element("bucketStatusDot").className = active
    ? "size-2 rounded-full bg-accent dark:bg-accent-dark"
    : "size-2 rounded-full bg-line dark:bg-line-dark";
  element("pickerHint").textContent = !active
    ? "PNG, JPG, GIF or WEBP · 25 MB max"
    : relayed
      ? "PNG, JPG, GIF or WEBP · 25 MB max · relayed to your bucket"
      : "Images and MP4, WEBM or MOV video · straight into your bucket";
  element("ttlField").hidden = active;
  element("forgetBucket").hidden = !active;
  showBucket(bucketSettings);
}

/** Draws a video's first frame for the shelf thumbnail. */
function firstFrameOf(file: Blob): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = URL.createObjectURL(file);
    video.addEventListener("loadeddata", () => {
      createImageBitmap(video).then(resolve, reject).finally(() => URL.revokeObjectURL(video.src));
    });
    video.addEventListener("error", () => reject(new Error("video decode failed")));
  });
}

async function thumbnailOf(file: Blob): Promise<Blob | null> {
  const bitmap = file.type.startsWith("video/") ? await firstFrameOf(file) : await createImageBitmap(file);
  const scale = Math.min(1, THUMBNAIL_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.76));
}

/** Redraws a still so EXIF, GPS and other metadata never leave the browser (bucket uploads only). */
async function stripStill(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const quality = file.type === "image/png" ? undefined : 0.92;
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("could not re-encode"))), file.type, quality),
  );
}

async function isAnimated(file: File): Promise<boolean> {
  if (file.type === "image/gif") return true;
  if (file.type !== "image/webp") return false;
  const header = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  return header.some(
    (byte, index) =>
      byte === 0x41 && header[index + 1] === 0x4e && header[index + 2] === 0x49 && header[index + 3] === 0x4d,
  );
}

function revokePending(): void {
  if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
  pending = null;
}

function resetPicker(): void {
  revokePending();
  lastResult = null;
  showOnly(pickerView);
  filePicker.value = "";
}

function showSelected(message = "", allowEdit = true, buttonText = "Create link"): void {
  if (!pending) return;
  selectedImage.src = pending.previewUrl;
  selectedNote.textContent = message;
  selectedNote.hidden = !message;
  element("editSelected").hidden = !allowEdit;
  element("uploadSelected").textContent = buttonText;
  showOnly(selectedView);
}

async function accept(files: FileList | File[] | null): Promise<void> {
  if (pending) return say("Finish the current image first", "bad");
  const offered = [...(files || [])].filter(Boolean);
  if (!offered.length) return;
  if (offered.length > 1) say("One image at a time on mobile");
  const file = offered[0];
  const isVideo = Boolean(VIDEO_EXTENSIONS[file.type]);
  if (bucketSettings?.mode === "relay" && (isVideo || file.size > MAXIMUM_BYTES)) {
    return say("Video and files over 25 MB need CORS on your bucket (see bucket settings)", "bad");
  }
  if (bucketSettings) {
    if (!EXTENSIONS[file.type] && !isVideo) return say("Choose an image or an MP4, WEBM or MOV video", "bad");
  } else if (!EXTENSIONS[file.type] || file.size > MAXIMUM_BYTES) {
    return say("Choose a PNG, JPG, GIF or WEBP under 25 MB", "bad");
  }
  lastResult = null;
  pending = {
    original: file,
    uploadFile: file,
    contentType: file.type,
    bytes: file.size,
    previewUrl: URL.createObjectURL(file),
    transportName: randomTransportName(file.type),
  };
  if (isVideo) {
    pending.canEdit = false;
    showSelected("Video is uploaded as-is: its metadata is not removed.", false, "Upload to bucket");
    return;
  }
  const animated = ANIMATED_TYPES.has(file.type) && (await isAnimated(file).catch(() => true));
  pending.canEdit = !animated;
  const buttonText = bucketSettings ? "Upload to bucket" : "Create link";
  if (animated) {
    showSelected("Animation will be preserved.", false, buttonText);
    return;
  }
  showSelected("", true, buttonText);
}

const editorHooks: EditorHooks = {
  getPending: () => pending,
  showSelected,
  say,
};

function setProgress(percent: number): void {
  progressFill.style.width = `${percent}%`;
  progressText.textContent = `${percent}%`;
  progressView.querySelector('[role="progressbar"]')!.setAttribute("aria-valuenow", String(percent));
}

async function uploadPending(): Promise<void> {
  if (!pending || pending.uploading) return;
  pending.uploading = true;
  progressImage.src = pending.previewUrl;
  setProgress(0);
  ttlSelect.disabled = true;
  showOnly(progressView);
  try {
    if (bucketSettings) {
      // The relay strips on the server; a direct upload must strip here, since the server never sees it.
      const stillUntouched = pending.uploadFile === pending.original && EXTENSIONS[pending.contentType] && pending.canEdit;
      if (stillUntouched && bucketSettings.mode === "direct") pending.uploadFile = await stripStill(pending.original);
      const stored =
        bucketSettings.mode === "relay"
          ? await uploadThroughRelay(bucketSettings, pending, setProgress)
          : await uploadToBucket(bucketSettings, pending, setProgress);
      await settleUpload({ id: stored.key, url: stored.url, deleteToken: "", expiresAt: 0, bucketKey: stored.key });
    } else {
      const body = await sendUpload(pending, ttlSelect.value, setProgress);
      await settleUpload({
        id: body.id,
        url: body.url,
        deleteToken: body.delete_token,
        expiresAt: new Date(body.expires_at).getTime(),
      });
    }
  } catch (failure) {
    pending.uploading = false;
    ttlSelect.disabled = false;
    const retryAfter = failure instanceof UploadFailure ? failure.retryAfter : 0;
    const wait = retryAfter ? ` Try again in ${retryAfter} seconds.` : "";
    const message = (failure as Error).message;
    showSelected(`${message}.${wait}`, pending.canEdit, "Try again");
    say(message, "bad");
  }
}

type StoredUpload = Pick<ShelfRecord, "id" | "url" | "deleteToken" | "expiresAt" | "bucketKey">;

async function settleUpload(stored: StoredUpload): Promise<void> {
  const current = pending;
  if (!current) return;
  const item: ShelfItem = {
    ...stored,
    createdAt: Date.now(),
    label: publicLabel(stored.id.replace(/^.*\//, ""), current.contentType),
    bytes: current.bytes,
    contentType: current.contentType,
    previewUrl: "",
    previewIsObject: false,
  };
  const thumbnail = await thumbnailOf(current.uploadFile).catch(() => null);
  item.thumbnail = thumbnail;
  item.previewUrl = thumbnail ? URL.createObjectURL(thumbnail) : absoluteUrl(item);
  item.previewIsObject = Boolean(thumbnail);
  await saveRecord({
    id: item.id,
    url: item.url,
    deleteToken: item.deleteToken,
    expiresAt: item.expiresAt,
    bucketKey: item.bucketKey,
    createdAt: item.createdAt,
    label: item.label,
    bytes: item.bytes,
    contentType: item.contentType,
    thumbnail,
  });
  uploads.set(item.id, item);
  createShelfItem(item, true);
  URL.revokeObjectURL(current.previewUrl);
  pending = null;
  ttlSelect.disabled = false;
  lastResult = item;
  resultImage.src = item.previewUrl;
  resultLink.textContent = absoluteUrl(item);
  element("resultExpiry").textContent = item.expiresAt
    ? `Expires ${formatLongDate(item.expiresAt)}`
    : `In your bucket, never expires`;
  element("resultShare").hidden = !navigator.share;
  showOnly(resultView);
  const copied = await copyText(absoluteUrl(item));
  say(copied ? "Uploaded and link copied" : "Upload complete");
  if (item.bucketKey) showBucket(bucketSettings);
}

bindHistoryToast(say);
initShelf({ say, resetPicker, getLastResult: () => lastResult });
initBrowse({ say, copyText });
paintBucketStatus();

const bucketDialog = element<HTMLDialogElement>("bucketDialog");
const bucketForm = element<HTMLFormElement>("bucketForm");
const bucketMessage = element("bucketMessage");
element("corsPolicy").textContent = corsPolicyFor(location.origin);
const paintCorsCommand = (): void => {
  element("corsCommand").textContent = corsCommandFor(bucketFormSettings(), location.origin);
};
bucketForm.addEventListener("input", paintCorsCommand);

function bucketFormSettings(): BucketSettings {
  const data = new FormData(bucketForm);
  const field = (name: string): string => String(data.get(name) ?? "");
  return normalizeBucketSettings({
    endpoint: field("endpoint"),
    bucket: field("bucket"),
    region: field("region"),
    accessKeyId: field("accessKeyId"),
    secretAccessKey: field("secretAccessKey"),
    publicBase: field("publicBase"),
    prefix: field("prefix"),
  });
}

function tellBucket(message: string, tone = ""): void {
  bucketMessage.textContent = message;
  bucketMessage.dataset.tone = tone;
}

/** Direct first; when the bucket blocks the browser (no CORS), try the relay. Returns the working mode. */
async function runBucketTest(settings: BucketSettings): Promise<BucketSettings["mode"] | null> {
  const buttons = [element<HTMLButtonElement>("testBucket"), element<HTMLButtonElement>("saveBucket")];
  buttons.forEach((button) => (button.disabled = true));
  tellBucket("Writing and removing a test object…");
  try {
    await testBucket(settings);
    tellBucket("Works directly from this browser: any size, video included.");
    return "direct";
  } catch (failure) {
    if (!(failure instanceof BucketBlockedError)) {
      tellBucket((failure as Error).message, "bad");
      return null;
    }
  }
  try {
    tellBucket("No CORS on the bucket; trying the mmbox relay…");
    await checkBucketRelay(settings);
    tellBucket("Works through the mmbox relay (images up to 25 MB). Add CORS below for video and direct uploads.");
    return "relay";
  } catch (failure) {
    tellBucket(`Neither direct nor relayed access worked: ${(failure as Error).message}`, "bad");
    return null;
  } finally {
    buttons.forEach((button) => (button.disabled = false));
  }
}

element("openBucketSettings").addEventListener("click", () => {
  const current = bucketSettings;
  (Object.keys(bucketFormSettings()) as (keyof BucketSettings)[]).forEach((name) => {
    const input = bucketForm.elements.namedItem(name) as HTMLInputElement | null;
    if (input) input.value = current?.[name] ?? "";
  });
  tellBucket("");
  paintCorsCommand();
  bucketDialog.showModal();
});
element("cancelBucket").addEventListener("click", () => bucketDialog.close());
element("copyCorsPolicy").addEventListener("click", () => {
  void copyText(corsPolicyFor(location.origin)).then((copied) => say(copied ? "Policy copied" : "Could not copy", copied ? "" : "bad"));
});
element("copyCorsCommand").addEventListener("click", () => {
  void copyText(corsCommandFor(bucketFormSettings(), location.origin)).then((copied) =>
    say(copied ? "Command copied" : "Could not copy", copied ? "" : "bad"),
  );
});
element("testBucket").addEventListener("click", () => {
  if (bucketForm.reportValidity()) void runBucketTest(bucketFormSettings());
});
bucketForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const settings = bucketFormSettings();
  void runBucketTest(settings).then((mode) => {
    if (!mode) return;
    settings.mode = mode;
    bucketSettings = settings;
    saveBucketSettings(settings);
    paintBucketStatus();
    bucketDialog.close();
    say(mode === "relay" ? `Relaying to ${settings.bucket}` : `Uploading to ${settings.bucket}`);
  });
});
element("forgetBucket").addEventListener("click", () => {
  bucketSettings = null;
  saveBucketSettings(null);
  paintBucketStatus();
  bucketDialog.close();
  say("Back to temporary storage");
});

ttlSelect.addEventListener("change", () => {
  try {
    localStorage.setItem("mmbox.lifetime", ttlSelect.value);
  } catch {
    /* Selection still works for this tab. */
  }
});
filePicker.addEventListener("change", () => void accept(filePicker.files));
element("changeSelected").addEventListener("click", () => {
  resetPicker();
  filePicker.click();
});
element("editSelected").addEventListener("click", () => void openMarkerEditor(editorHooks));
element("uploadSelected").addEventListener("click", () => void uploadPending());
element("cancelEditor").addEventListener("click", () => closeMarkerEditor(editorHooks));
element("doneEditor").addEventListener("click", clickEditorDone);
element("uploadAnother").addEventListener("click", () => {
  resetPicker();
  filePicker.click();
});
element("resultCopy").addEventListener("click", () => lastResult && void copyItem(lastResult));
element("resultShare").addEventListener("click", () => lastResult && void shareItem(lastResult));

let dragDepth = 0;
document.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  dragCover.hidden = false;
});
document.addEventListener("dragover", (event) => event.preventDefault());
document.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  dragCover.hidden = dragDepth === 0;
});
document.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  dragCover.hidden = true;
  void accept(event.dataTransfer?.files || []);
});
document.addEventListener("paste", (event) => {
  const files = [...(event.clipboardData?.items || [])]
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  if (!files.length) return;
  event.preventDefault();
  void accept(files);
});

startCountdown();
void restoreShelf();
