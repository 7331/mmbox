import "./style.css";

import { ANIMATED_TYPES, DEFAULT_TTL, EXTENSIONS, MAXIMUM_BYTES, THUMBNAIL_EDGE, VIDEO_EXTENSIONS } from "./types";
import type { PendingUpload, ShelfItem, ShelfRecord } from "./types";
import { loadBucketSettings, saveBucketSettings, uploadThroughRelay, uploadToBucket } from "./bucket";
import type { BucketSettings } from "./bucket";
import { initBrowse, refreshBucket, showBucket } from "./browse";
import { initBucketSheet, openBucketSheet } from "./bucketSheet";
import { clickEditorDone, closeMarkerEditor, openMarkerEditor } from "./editor";
import type { EditorHooks } from "./editor";
import { formatBytes, formatDayAndTime, formatLinkForDisplay } from "./format";
import { bindHistoryToast, saveRecord } from "./history";
import { iconMarkup, renderIconPlaceholders } from "./icons";
import type { IconName } from "./icons";
import {
  absoluteUrl,
  copyItem,
  copyText,
  createShelfItem,
  deleteShelfItem,
  describeExpiry,
  initShelf,
  publicLabel,
  restoreShelf,
  shareItem,
  startCountdown,
  uploads,
} from "./shelf";
import { UploadCancelled, UploadFailure, randomTransportName, sendUpload } from "./upload";
import { initViewer } from "./viewer";

const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp";
const IMAGE_AND_VIDEO_ACCEPT = `${IMAGE_ACCEPT},video/mp4,video/webm,video/quicktime`;
const LIFETIME_STORAGE_KEY = "mmbox.lifetime";

const homeScreen = element("homeScreen");
const homeBottomBar = element("homeBottomBar");
const flowScreen = element("flowScreen");
const selectedView = element("selectedView");
const progressView = element("progressView");
const resultView = element("resultView");
const filePicker = element<HTMLInputElement>("filePicker");
const flowImage = element<HTMLImageElement>("flowImage");
const flowVideo = element<HTMLVideoElement>("flowVideo");
const lifetimeChoices = element("lifetimeChoices");
const uploadSelectedButton = element<HTMLButtonElement>("uploadSelected");
const progressFill = element("progressFill");
const dragCover = element("dragCover");
const toast = element("toast");

type FlowStage = "selected" | "progress" | "result";

let pending: PendingUpload | null = null;
let bucketSettings: BucketSettings | null = loadBucketSettings();
let lastResult: ShelfItem | null = null;
let uploadAbortController: AbortController | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let selectedLifetimeSeconds = storedLifetime();

function storedLifetime(): number {
  try {
    return Number(localStorage.getItem(LIFETIME_STORAGE_KEY)) || DEFAULT_TTL;
  } catch {
    return DEFAULT_TTL;
  }
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

function setButtonContent(button: HTMLButtonElement, icon: IconName, label: string): void {
  button.innerHTML = iconMarkup(icon);
  button.append(label);
}

const isVideoType = (contentType: string): boolean => Boolean(VIDEO_EXTENSIONS[contentType]);

/* ---------- Mode: temporary links or the visitor's bucket ---------- */

function paintMode(): void {
  const usingBucket = Boolean(bucketSettings);
  element("bucketStatusText").textContent = usingBucket ? "My bucket" : "Temporary";
  element("bucketStatusDot").dataset.active = String(usingBucket);
  element("openBucketSettings").ariaLabel = usingBucket
    ? `Uploading to your bucket ${bucketSettings!.bucket}${bucketSettings!.mode === "relay" ? " through the relay" : ""}. Change`
    : "Temporary links. Use my own bucket";
  element("temporaryDropSection").hidden = usingBucket;
  element("temporaryActions").hidden = usingBucket;
  element("bucketActions").hidden = !usingBucket;
  homeBottomBar.classList.toggle("bottom-bar-chrome", usingBucket);
  filePicker.accept = bucketSettings?.mode === "direct" ? IMAGE_AND_VIDEO_ACCEPT : IMAGE_ACCEPT;
  showBucket(bucketSettings);
}

function paintPasteHint(): void {
  const touchFirst = matchMedia("(pointer: coarse)").matches;
  if (touchFirst) {
    element("pasteHint").textContent = "or tap Paste · or share a photo to mmbox";
    return;
  }
  const isApple = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  element("pasteShortcut").textContent = isApple ? "⌘V" : "Ctrl V";
}

/* ---------- Screens ---------- */

function showFlowStage(stage: FlowStage, { allowEdit = false } = {}): void {
  if (flowScreen.hidden) {
    if (!(history.state as { mmboxFlow?: boolean } | null)?.mmboxFlow) history.pushState({ mmboxFlow: true }, "");
    homeScreen.hidden = true;
    flowScreen.hidden = false;
    window.scrollTo(0, 0);
  }
  flowScreen.dataset.stage = stage;
  selectedView.hidden = stage !== "selected";
  progressView.hidden = stage !== "progress";
  resultView.hidden = stage !== "result";
  uploadSelectedButton.hidden = stage !== "selected";
  element("cancelUpload").hidden = stage !== "progress";
  element("resultActions").hidden = stage !== "result";
  element("closeFlow").style.visibility = stage === "progress" ? "hidden" : "";
  element("editSelected").hidden = stage !== "selected" || !allowEdit;
  element("newUpload").hidden = stage !== "result";
  const usingBucket = Boolean(bucketSettings);
  element("flowTitle").textContent =
    stage === "selected" ? (usingBucket ? "Upload" : "New link") : stage === "progress" ? (usingBucket ? "Uploading" : "Creating link") : "";
}

function setFlowMedia(url: string, isVideo: boolean): void {
  flowImage.hidden = isVideo;
  flowVideo.hidden = !isVideo;
  if (isVideo) flowVideo.src = url;
  else {
    flowImage.src = url;
    flowVideo.removeAttribute("src");
  }
}

/** Back to the home screen, dropping whatever was picked or uploading. */
function showHomeAndForgetPending(): void {
  uploadAbortController?.abort();
  uploadAbortController = null;
  revokePending();
  lastResult = null;
  filePicker.value = "";
  flowVideo.removeAttribute("src");
  flowScreen.hidden = true;
  homeScreen.hidden = false;
}

/** Closing the flow from its own buttons goes through history, so the Android back gesture matches. */
function leaveFlow(): void {
  if ((history.state as { mmboxFlow?: boolean } | null)?.mmboxFlow) history.back();
  else showHomeAndForgetPending();
}

window.addEventListener("popstate", () => {
  const stillInFlow = (history.state as { mmboxFlow?: boolean } | null)?.mmboxFlow;
  if (!flowScreen.hidden && !stillInFlow) showHomeAndForgetPending();
});

function openFilePicker(): void {
  filePicker.value = "";
  filePicker.click();
}

/* ---------- Picking ---------- */

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
  const bitmap = isVideoType(file.type) ? await firstFrameOf(file) : await createImageBitmap(file);
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

/** What happens to metadata on the way, for the line under the photo. */
function privacySummary(contentType: string): string {
  if (isVideoType(contentType)) return "video is uploaded as-is, metadata included";
  if (bucketSettings?.mode === "relay") return "metadata stripped by the relay";
  return "location and camera data removed";
}

function paintDestination(): void {
  const usingBucket = Boolean(bucketSettings);
  element("lifetimeSection").hidden = usingBucket;
  element("destinationSection").hidden = !usingBucket;
  const note = element("destinationNote");
  note.hidden = !usingBucket;
  if (!bucketSettings || !pending) return;
  const relayed = bucketSettings.mode === "relay";
  element("destinationName").textContent = bucketSettings.prefix
    ? `${bucketSettings.bucket} / ${bucketSettings.prefix}`
    : bucketSettings.bucket;
  element("destinationMode").textContent = `Never expires · ${relayed ? "through the mmbox relay" : "direct to your bucket"}`;
  note.textContent = isVideoType(pending.contentType)
    ? "Video goes straight to your bucket as-is; its metadata is not removed."
    : relayed
      ? "The image passes through this server, which strips it; your keys are sent per request and never stored."
      : "Still images are re-drawn in the browser first, so EXIF and GPS never leave this device.";
}

function paintLifetimeExpiry(): void {
  element("lifetimeExpiry").textContent = `Link stops working ${formatDayAndTime(Date.now() + selectedLifetimeSeconds * 1000)}`;
}

function selectLifetime(seconds: number): void {
  selectedLifetimeSeconds = seconds;
  lifetimeChoices.querySelectorAll<HTMLButtonElement>(".chip").forEach((chip) => {
    const selected = Number(chip.dataset.seconds) === seconds;
    chip.setAttribute("aria-checked", String(selected));
    chip.tabIndex = selected ? 0 : -1;
  });
  paintLifetimeExpiry();
}

function showSelected(message = "", allowEdit = true, tone = ""): void {
  if (!pending) return;
  setFlowMedia(pending.previewUrl, isVideoType(pending.contentType));
  element("selectedInfo").textContent = `${formatBytes(pending.bytes)} · ${privacySummary(pending.contentType)}`;
  const note = element("selectedNote");
  note.textContent = message;
  note.dataset.tone = tone;
  note.hidden = !message;
  paintDestination();
  if (bucketSettings) setButtonContent(uploadSelectedButton, "upload", tone === "bad" ? "Try again" : "Upload to bucket");
  else setButtonContent(uploadSelectedButton, "link", tone === "bad" ? "Try again" : "Create link");
  showFlowStage("selected", { allowEdit });
  if (!bucketSettings) {
    paintLifetimeExpiry();
    lifetimeChoices.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }
}

async function accept(files: FileList | File[] | null): Promise<void> {
  if (pending?.uploading) return say("Wait for the current upload to finish", "bad");
  const offered = [...(files || [])].filter(Boolean);
  if (!offered.length) return;
  if (offered.length > 1) say("One file at a time");
  const file = offered[0];
  const isVideo = isVideoType(file.type);
  if (bucketSettings?.mode === "relay" && (isVideo || file.size > MAXIMUM_BYTES)) {
    return say("Video and files over 25 MB need CORS on your bucket (see bucket settings)", "bad");
  }
  if (bucketSettings) {
    if (!EXTENSIONS[file.type] && !isVideo) return say("Choose an image or an MP4, WEBM or MOV video", "bad");
  } else if (!EXTENSIONS[file.type] || file.size > MAXIMUM_BYTES) {
    return say("Choose a PNG, JPG, GIF or WebP under 25 MB", "bad");
  }
  revokePending();
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
    showSelected("", false);
    return;
  }
  const animated = ANIMATED_TYPES.has(file.type) && (await isAnimated(file).catch(() => true));
  pending.canEdit = !animated;
  showSelected(animated ? "Animation will be preserved." : "", !animated);
}

const editorHooks: EditorHooks = {
  getPending: () => pending,
  showSelected: (message, allowEdit) => showSelected(message, allowEdit),
  say,
};

/* ---------- Uploading ---------- */

function setProgress(percent: number): void {
  progressFill.style.width = `${percent}%`;
  element("progressText").textContent = `${percent}%`;
  element("progressTrack").setAttribute("aria-valuenow", String(percent));
  if (pending) {
    element("progressBytes").textContent = `Sending ${formatBytes((pending.bytes * percent) / 100)} of ${formatBytes(pending.bytes)}`;
  }
}

function paintProgressPrivacy(contentType: string): void {
  element("progressPrivacyStep").hidden = isVideoType(contentType);
  element("progressPrivacyText").textContent = !bucketSettings
    ? "Metadata is stripped on arrival"
    : bucketSettings.mode === "relay"
      ? "Metadata is stripped by the relay"
      : "Metadata removed in this browser";
}

async function uploadPending(): Promise<void> {
  if (!pending || pending.uploading) return;
  const current = pending;
  current.uploading = true;
  uploadAbortController = new AbortController();
  const abortSignal = uploadAbortController.signal;
  setFlowMedia(current.previewUrl, isVideoType(current.contentType));
  paintProgressPrivacy(current.contentType);
  setProgress(0);
  showFlowStage("progress");
  try {
    if (bucketSettings) {
      // The relay strips on the server; a direct upload must strip here, since the server never sees it.
      const stillUntouched = current.uploadFile === current.original && EXTENSIONS[current.contentType] && current.canEdit;
      if (stillUntouched && bucketSettings.mode === "direct") {
        current.uploadFile = await stripStill(current.original);
        current.bytes = current.uploadFile.size;
      }
      const stored =
        bucketSettings.mode === "relay"
          ? await uploadThroughRelay(bucketSettings, current, setProgress, abortSignal)
          : await uploadToBucket(bucketSettings, current, setProgress, abortSignal);
      await settleUpload({ id: stored.key, url: stored.url, deleteToken: "", expiresAt: 0, bucketKey: stored.key });
    } else {
      const body = await sendUpload(current, String(selectedLifetimeSeconds), setProgress, abortSignal);
      await settleUpload({
        id: body.id,
        url: body.url,
        deleteToken: body.delete_token,
        expiresAt: new Date(body.expires_at).getTime(),
      });
    }
  } catch (failure) {
    current.uploading = false;
    uploadAbortController = null;
    if (pending !== current) return;
    if (failure instanceof UploadCancelled) {
      showSelected("Upload cancelled.", current.canEdit);
      return;
    }
    const retryAfter = failure instanceof UploadFailure ? failure.retryAfter : 0;
    const wait = retryAfter ? ` Try again in ${retryAfter} seconds.` : "";
    const message = (failure as Error).message;
    showSelected(`${message}.${wait}`, current.canEdit, "bad");
  }
}

type StoredUpload = Pick<ShelfRecord, "id" | "url" | "deleteToken" | "expiresAt" | "bucketKey">;

async function settleUpload(stored: StoredUpload): Promise<void> {
  const current = pending;
  if (!current) return;
  uploadAbortController = null;
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
  // The result keeps showing the picked file until the visitor leaves; it is revoked then.
  lastResult = item;
  current.uploading = false;
  element("resultLink").textContent = formatLinkForDisplay(absoluteUrl(item));
  element("resultLink").title = absoluteUrl(item);
  element("resultShare").hidden = !navigator.share;
  paintResultExpiry();
  element("resultCopyState").textContent = "";
  showFlowStage("result");
  const copied = await copyText(absoluteUrl(item));
  element("resultCopyState").textContent = copied ? "Copied to clipboard" : "Tap Copy link to copy it";
  if (item.bucketKey) refreshBucket();
}

function paintResultExpiry(): void {
  if (lastResult) element("resultExpiry").textContent = describeExpiry(lastResult);
}

/* ---------- Paste, drop, share target ---------- */

async function pasteFromClipboard(): Promise<void> {
  if (!navigator.clipboard?.read) {
    say("Paste is not available here; press Ctrl V or ⌘V instead", "bad");
    return;
  }
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((type) => type.startsWith("image/"));
      if (!imageType) continue;
      const blob = await item.getType(imageType);
      void accept([new File([blob], `pasted.${EXTENSIONS[imageType] ?? "png"}`, { type: imageType })]);
      return;
    }
    say("No image on the clipboard", "bad");
  } catch {
    say("Could not read the clipboard", "bad");
  }
}

/** Files shared to the installed app arrive from the service worker after a redirect to `/?shared=1`. */
function receiveSharedFile(): void {
  if (!("serviceWorker" in navigator) || !new URLSearchParams(location.search).has("shared")) return;
  history.replaceState(null, "", "/");
  navigator.serviceWorker.addEventListener("message", (event: MessageEvent<{ type?: string; file?: File | null }>) => {
    if (event.data?.type !== "shared-file") return;
    if (event.data.file) void accept([event.data.file]);
    else say("Nothing to upload in that share", "bad");
  });
  navigator.serviceWorker.startMessages();
  void navigator.serviceWorker.ready.then((registration) => {
    (navigator.serviceWorker.controller ?? registration.active)?.postMessage("share-ready");
  });
}

function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register("/service-worker.js").catch((failure: unknown) => {
    console.warn("mmbox: service worker unavailable", failure);
  });
}

/* ---------- Wiring ---------- */

function applyBucketSettings(settings: BucketSettings | null): void {
  bucketSettings = settings;
  saveBucketSettings(settings);
  paintMode();
  if (!flowScreen.hidden && pending && !pending.uploading) showSelected("", pending.canEdit);
}

renderIconPlaceholders();
bindHistoryToast(say);
initShelf({
  say,
  onShelfItemRemoved: (item) => {
    if (lastResult?.id === item.id) leaveFlow();
  },
});
initBrowse({ say });
initViewer({ say, copyText });
initBucketSheet({ say, copyText, currentSettings: () => bucketSettings, applySettings: applyBucketSettings });
paintMode();
paintPasteHint();
selectLifetime(selectedLifetimeSeconds);

lifetimeChoices.addEventListener("click", (event) => {
  const chip = (event.target as HTMLElement).closest<HTMLButtonElement>(".chip");
  if (!chip) return;
  selectLifetime(Number(chip.dataset.seconds));
  try {
    localStorage.setItem(LIFETIME_STORAGE_KEY, String(selectedLifetimeSeconds));
  } catch {
    /* Selection still works for this tab. */
  }
});
lifetimeChoices.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
  const chips = [...lifetimeChoices.querySelectorAll<HTMLButtonElement>(".chip")];
  const index = chips.findIndex((chip) => chip.getAttribute("aria-checked") === "true");
  const next = chips[Math.max(0, Math.min(chips.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)))];
  next.click();
  next.focus();
  event.preventDefault();
});

filePicker.addEventListener("change", () => void accept(filePicker.files));
element("dropZone").addEventListener("click", openFilePicker);
element("choosePhoto").addEventListener("click", openFilePicker);
element("uploadToBucket").addEventListener("click", openFilePicker);
element("pasteFromClipboard").addEventListener("click", () => void pasteFromClipboard());
element("openBucketSettings").addEventListener("click", openBucketSheet);
element("openBucketSettingsFromBar").addEventListener("click", openBucketSheet);
element("changeDestination").addEventListener("click", openBucketSheet);
element("refreshBucket").addEventListener("click", refreshBucket);

element("closeFlow").addEventListener("click", leaveFlow);
element("newUpload").addEventListener("click", () => {
  leaveFlow();
  openFilePicker();
});
element("editSelected").addEventListener("click", () => void openMarkerEditor(editorHooks));
uploadSelectedButton.addEventListener("click", () => void uploadPending());
element("cancelUpload").addEventListener("click", () => uploadAbortController?.abort());
element("cancelEditor").addEventListener("click", () => closeMarkerEditor(editorHooks));
element("doneEditor").addEventListener("click", clickEditorDone);
element("resultCopy").addEventListener("click", () => {
  if (lastResult) {
    void copyItem(lastResult).then((copied) => {
      if (copied) element("resultCopyState").textContent = "Copied to clipboard";
    });
  }
});
element("resultCopyIcon").addEventListener("click", () => element("resultCopy").click());
element("resultShare").addEventListener("click", () => lastResult && void shareItem(lastResult));
element("resultDelete").addEventListener("click", () => lastResult && void deleteShelfItem(lastResult));

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
  if ((event.target as HTMLElement).closest?.("input, textarea")) return;
  const files = [...(event.clipboardData?.items || [])]
    .filter((item) => item.kind === "file" && (item.type.startsWith("image/") || item.type.startsWith("video/")))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  if (!files.length) return;
  event.preventDefault();
  void accept(files);
});

startCountdown(() => {
  if (flowScreen.dataset.stage === "selected" && !flowScreen.hidden && !bucketSettings) paintLifetimeExpiry();
  if (flowScreen.dataset.stage === "result" && !flowScreen.hidden) paintResultExpiry();
});
registerServiceWorker();
receiveSharedFile();
void restoreShelf();
