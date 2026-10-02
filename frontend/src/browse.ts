import type { BucketObject, BucketSettings } from "./bucket";
import { deleteBucketObject, listBucket, publicUrl } from "./bucket";
import { formatBytes, formatShortDate } from "./format";
import { confirmDeletion } from "./sheets";
import { openViewer } from "./viewer";
import type { ViewerEntry } from "./viewer";

export interface BrowseHooks {
  say(message: string, tone?: string): void;
}

const browser = document.getElementById("bucketBrowser") as HTMLElement;
const grid = document.getElementById("bucketGrid") as HTMLElement;
const summary = document.getElementById("bucketSummary") as HTMLElement;
const note = document.getElementById("bucketBrowserNote") as HTMLElement;
const loadMore = document.getElementById("loadMoreBucket") as HTMLButtonElement;
const tileTemplate = document.getElementById("bucketTileTemplate") as HTMLTemplateElement;

const IMAGE_KEY = /\.(png|jpe?g|gif|webp|avif)$/i;
const VIDEO_KEY = /\.(mp4|webm|mov)$/i;

let hooks: BrowseHooks;
let settings: BucketSettings | null = null;
let nextToken: string | null = null;
let loading = false;
/** Listed objects in grid order; the viewer pages through these. */
let listedObjects: BucketObject[] = [];
const tilesByKey = new Map<string, HTMLElement>();

const fileNameOf = (key: string): string => key.split("/").pop() || key;
const extensionOf = (key: string): string => key.split(".").pop()?.toLowerCase() || "file";

function paintSummary(): void {
  if (!settings) return;
  const place = settings.prefix ? `${settings.bucket} / ${settings.prefix}` : settings.bucket;
  const count = listedObjects.length;
  summary.textContent = `${place} · ${count}${nextToken ? "+" : ""} ${count === 1 ? "item" : "items"}`;
}

async function deleteObject(current: BucketSettings, object: BucketObject): Promise<boolean> {
  const accepted = await confirmDeletion({
    title: "Delete from your bucket?",
    message: `${fileNameOf(object.key)} is removed from ${current.bucket}. Anyone with the link loses it.`,
  });
  if (!accepted) return false;
  try {
    await deleteBucketObject(current, object.key);
  } catch (failure) {
    hooks.say((failure as Error).message, "bad");
    return false;
  }
  listedObjects = listedObjects.filter((candidate) => candidate !== object);
  tilesByKey.get(object.key)?.remove();
  tilesByKey.delete(object.key);
  note.hidden = listedObjects.length > 0;
  note.textContent = "Nothing here yet.";
  paintSummary();
  hooks.say("Deleted from bucket");
  return true;
}

function viewerEntryFor(current: BucketSettings, object: BucketObject): ViewerEntry {
  const url = publicUrl(current, object.key);
  const isImage = IMAGE_KEY.test(object.key);
  const isVideo = VIDEO_KEY.test(object.key);
  return {
    title: fileNameOf(object.key),
    describe: () => `${formatShortDate(Date.parse(object.lastModifiedAt))} · ${formatBytes(object.sizeBytes)}`,
    displayUrl: () => url,
    thumbnailUrl: isImage ? url : "",
    linkUrl: url,
    isVideo,
    placeholderText: isImage || isVideo ? undefined : extensionOf(object.key),
    isExpired: () => false,
    canDownload: false,
    delete: () => deleteObject(current, object),
  };
}

function addTile(object: BucketObject): void {
  if (!settings) return;
  const current = settings;
  const url = publicUrl(current, object.key);
  const tile = tileTemplate.content.firstElementChild!.cloneNode(true) as HTMLButtonElement;
  const image = tile.querySelector<HTMLImageElement>(".bucket-tile-image")!;
  const kind = tile.querySelector<HTMLElement>(".bucket-tile-kind")!;
  const videoBadge = tile.querySelector<HTMLElement>(".bucket-tile-video")!;
  if (IMAGE_KEY.test(object.key)) {
    image.src = url;
  } else {
    image.hidden = true;
    kind.hidden = false;
    kind.textContent = VIDEO_KEY.test(object.key) ? "" : extensionOf(object.key);
  }
  if (VIDEO_KEY.test(object.key)) {
    videoBadge.hidden = false;
    videoBadge.querySelector(".bucket-tile-extension")!.textContent = extensionOf(object.key);
  }
  tile.ariaLabel = `${fileNameOf(object.key)}, ${formatBytes(object.sizeBytes)}`;
  tile.addEventListener("click", () => {
    openViewer(
      listedObjects.map((listed) => viewerEntryFor(current, listed)),
      listedObjects.indexOf(object),
    );
  });
  tilesByKey.set(object.key, tile);
  grid.append(tile);
}

async function loadPage(reset: boolean): Promise<void> {
  if (!settings || loading) return;
  loading = true;
  if (reset) {
    grid.replaceChildren();
    tilesByKey.clear();
    listedObjects = [];
    nextToken = null;
  }
  try {
    const page = await listBucket(settings, nextToken);
    const pageObjects = page.objects
      .filter((object) => !object.key.endsWith("/"))
      .sort((left, right) => right.lastModifiedAt.localeCompare(left.lastModifiedAt));
    listedObjects.push(...pageObjects);
    pageObjects.forEach(addTile);
    nextToken = page.nextContinuationToken;
    loadMore.hidden = !nextToken;
    note.hidden = listedObjects.length > 0;
    note.textContent = "Nothing here yet. Tap Upload to add a photo or video.";
  } catch (failure) {
    note.hidden = false;
    note.textContent = `Could not list the bucket: ${(failure as Error).message}`;
  } finally {
    loading = false;
    paintSummary();
  }
}

export function showBucket(current: BucketSettings | null): void {
  settings = current;
  browser.hidden = !current;
  if (current) void loadPage(true);
}

export function refreshBucket(): void {
  void loadPage(true);
}

export function initBrowse(browseHooks: BrowseHooks): void {
  hooks = browseHooks;
  loadMore.addEventListener("click", () => void loadPage(false));
}
