/** Full-screen viewer for shelf uploads and bucket objects: swipe or filmstrip, copy, share, save, delete. */

export interface ViewerEntry {
  title: string;
  /** Recomputed on every paint, so countdowns stay live. */
  describe(): string;
  /** What the stage shows: the full object, or the local thumbnail once a link has expired. */
  displayUrl(): string;
  thumbnailUrl: string;
  linkUrl: string;
  isVideo: boolean;
  /** Set for objects with no preview (not an image or video): shown as text instead. */
  placeholderText?: string;
  isExpired(): boolean;
  /** Same-origin links can be saved with a download; other origins only open. */
  canDownload: boolean;
  /** Asks, deletes, and resolves true once the object is gone. */
  delete(): Promise<boolean>;
}

export interface ViewerHooks {
  say(message: string, tone?: string): void;
  copyText(text: string): Promise<boolean>;
}

const SWIPE_THRESHOLD_PIXELS = 50;

const viewerLayer = document.getElementById("viewerLayer") as HTMLElement;
const viewerTitle = document.getElementById("viewerTitle") as HTMLElement;
const viewerSubtitle = document.getElementById("viewerSubtitle") as HTMLElement;
const viewerPosition = document.getElementById("viewerPosition") as HTMLElement;
const viewerStage = document.getElementById("viewerStage") as HTMLElement;
const viewerImage = document.getElementById("viewerImage") as HTMLImageElement;
const viewerVideo = document.getElementById("viewerVideo") as HTMLVideoElement;
const viewerPlaceholder = document.getElementById("viewerPlaceholder") as HTMLElement;
const viewerFilmstrip = document.getElementById("viewerFilmstrip") as HTMLElement;
const viewerHint = document.getElementById("viewerHint") as HTMLElement;
const viewerPrevious = document.getElementById("viewerPrevious") as HTMLButtonElement;
const viewerNext = document.getElementById("viewerNext") as HTMLButtonElement;
const closeViewerButton = document.getElementById("closeViewer") as HTMLButtonElement;

const actionButton = (action: string): HTMLButtonElement =>
  viewerLayer.querySelector<HTMLButtonElement>(`[data-viewer-action="${action}"]`)!;

let hooks: ViewerHooks;
let entries: ViewerEntry[] = [];
let currentIndex = 0;
let focusBeforeOpening: HTMLElement | null = null;
let touchStartX = 0;
let touchStartY = 0;
let touchIsSingleFinger = false;

export function isViewerOpen(): boolean {
  return !viewerLayer.hidden;
}

function currentEntry(): ViewerEntry | undefined {
  return entries[currentIndex];
}

function paintFilmstrip(): void {
  viewerFilmstrip.hidden = entries.length < 2;
  viewerHint.hidden = entries.length < 2;
  viewerFilmstrip.replaceChildren(
    ...entries.map((entry, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "viewer-filmstrip-item";
      item.ariaLabel = entry.title;
      if (entry.thumbnailUrl) {
        const image = document.createElement("img");
        image.src = entry.thumbnailUrl;
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        item.append(image);
      }
      item.addEventListener("click", () => showEntry(index));
      return item;
    }),
  );
}

/** Repaints the texts and buttons that depend on time (expiry) without reloading the media. */
export function paintViewerDetails(): void {
  const entry = currentEntry();
  if (!entry || !isViewerOpen()) return;
  const expired = entry.isExpired();
  viewerTitle.textContent = entry.title;
  viewerSubtitle.textContent = entry.describe();
  viewerPosition.textContent = entries.length > 1 ? `${currentIndex + 1} of ${entries.length}` : "";
  viewerImage.dataset.expired = String(expired);
  actionButton("copy").hidden = expired;
  actionButton("share").hidden = expired || !navigator.share;
  actionButton("download").hidden = expired || !entry.canDownload;
  actionButton("open").hidden = expired || entry.canDownload;
}

function showEntry(index: number): void {
  if (!entries.length) return;
  currentIndex = Math.max(0, Math.min(entries.length - 1, index));
  const entry = entries[currentIndex];
  viewerVideo.pause();
  viewerImage.hidden = entry.isVideo || Boolean(entry.placeholderText);
  viewerVideo.hidden = !entry.isVideo || entry.isExpired();
  viewerPlaceholder.hidden = !entry.placeholderText;
  viewerPlaceholder.textContent = entry.placeholderText ?? "";
  if (entry.isVideo && entry.isExpired()) {
    viewerImage.hidden = false;
    viewerImage.src = entry.thumbnailUrl;
  } else if (entry.isVideo) {
    viewerVideo.src = entry.linkUrl;
    viewerVideo.poster = entry.thumbnailUrl;
  } else if (!entry.placeholderText) {
    viewerImage.src = entry.displayUrl();
    viewerImage.alt = entry.title;
  }
  viewerPrevious.hidden = currentIndex === 0;
  viewerNext.hidden = currentIndex >= entries.length - 1;
  viewerFilmstrip.querySelectorAll<HTMLElement>(".viewer-filmstrip-item").forEach((item, itemIndex) => {
    item.setAttribute("aria-current", String(itemIndex === currentIndex));
    if (itemIndex === currentIndex) item.scrollIntoView({ block: "nearest", inline: "center" });
  });
  paintViewerDetails();
}

const viewerIsInHistory = (): boolean => Boolean((history.state as { mmboxViewer?: boolean } | null)?.mmboxViewer);

export function openViewer(viewerEntries: ViewerEntry[], startIndex: number): void {
  entries = viewerEntries;
  focusBeforeOpening = document.activeElement as HTMLElement | null;
  // A history entry lets the Android back gesture close the viewer instead of leaving the page.
  if (!viewerIsInHistory()) history.pushState({ mmboxViewer: true }, "");
  viewerLayer.hidden = false;
  document.documentElement.style.overflow = "hidden";
  paintFilmstrip();
  showEntry(startIndex);
  closeViewerButton.focus();
}

export function closeViewer(): void {
  if (!isViewerOpen()) return;
  if (viewerIsInHistory()) history.back();
  else hideViewer();
}

function hideViewer(): void {
  viewerVideo.pause();
  viewerVideo.removeAttribute("src");
  viewerVideo.load();
  viewerLayer.hidden = true;
  document.documentElement.style.overflow = "";
  entries = [];
  focusBeforeOpening?.focus();
}

async function runAction(action: string): Promise<void> {
  const entry = currentEntry();
  if (!entry) return;
  if (action === "copy") {
    const copied = await hooks.copyText(entry.linkUrl);
    hooks.say(copied ? "Link copied" : "Could not copy link", copied ? "" : "bad");
  } else if (action === "share") {
    try {
      await navigator.share({ url: entry.linkUrl });
    } catch (failure) {
      if ((failure as DOMException).name !== "AbortError") hooks.say("Could not open sharing", "bad");
    }
  } else if (action === "download") {
    const link = document.createElement("a");
    link.href = entry.linkUrl;
    link.download = entry.title;
    document.body.append(link);
    link.click();
    link.remove();
  } else if (action === "open") {
    window.open(entry.linkUrl, "_blank", "noopener");
  } else if (action === "delete" && (await entry.delete())) {
    entries = entries.filter((candidate) => candidate !== entry);
    if (!entries.length) {
      closeViewer();
      return;
    }
    paintFilmstrip();
    showEntry(currentIndex);
  }
}

export function initViewer(viewerHooks: ViewerHooks): void {
  hooks = viewerHooks;
  window.addEventListener("popstate", () => {
    if (isViewerOpen() && !viewerIsInHistory()) hideViewer();
  });
  closeViewerButton.addEventListener("click", closeViewer);
  viewerPrevious.addEventListener("click", () => showEntry(currentIndex - 1));
  viewerNext.addEventListener("click", () => showEntry(currentIndex + 1));
  viewerLayer.querySelector(".viewer-actions")!.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>("[data-viewer-action]")?.dataset.viewerAction;
    if (action) void runAction(action);
  });
  document.addEventListener("keydown", (event) => {
    if (!isViewerOpen() || document.querySelector("dialog[open]")) return;
    if (event.key === "Escape") closeViewer();
    else if (event.key === "ArrowLeft") showEntry(currentIndex - 1);
    else if (event.key === "ArrowRight") showEntry(currentIndex + 1);
  });
  viewerStage.addEventListener(
    "touchstart",
    (event) => {
      touchIsSingleFinger = event.touches.length === 1;
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
    },
    { passive: true },
  );
  viewerStage.addEventListener("touchend", (event) => {
    if (!touchIsSingleFinger || event.target === viewerVideo) return;
    const touch = event.changedTouches[0];
    const horizontal = touch.clientX - touchStartX;
    const vertical = touch.clientY - touchStartY;
    if (Math.abs(horizontal) < SWIPE_THRESHOLD_PIXELS || Math.abs(horizontal) < Math.abs(vertical)) return;
    showEntry(currentIndex + (horizontal < 0 ? 1 : -1));
  });
}
