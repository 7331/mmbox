import { EXTENSIONS, HISTORY_GRACE_MILLISECONDS, VIDEO_EXTENSIONS } from "./types";
import type { ShelfItem, ShelfRecord } from "./types";
import { allRecords, dropRecord, saveRecord } from "./history";
import { deleteBucketObject, loadBucketSettings } from "./bucket";
import { formatBytes, formatDayAndTime, formatRemainingShort, formatShortDate } from "./format";
import { confirmDeletion } from "./sheets";
import { openViewer, paintViewerDetails } from "./viewer";
import type { ViewerEntry } from "./viewer";

export interface ShelfHooks {
  say(message: string, tone?: string): void;
  /** Called after an item is deleted, so the result screen can close if it showed that item. */
  onShelfItemRemoved(item: ShelfItem): void;
}

/** The strip shows this many before "See all" is worth offering. */
const STRIP_VISIBLE_COUNT = 5;

export const uploads = new Map<string, ShelfItem>();

const uploadShelf = document.getElementById("uploadShelf") as HTMLElement;
const shelfList = document.getElementById("shelfList") as HTMLElement;
const toggleShelfLayout = document.getElementById("toggleShelfLayout") as HTMLButtonElement;
const shelfItemTemplate = document.getElementById("shelfItemTemplate") as HTMLTemplateElement;

let hooks: ShelfHooks;

export function absoluteUrl(item: Pick<ShelfItem, "url">): string {
  return new URL(item.url, location.origin).href;
}

export function publicLabel(id: string, contentType?: string): string {
  if (contentType && VIDEO_EXTENSIONS[contentType]) return `video-${id.slice(0, 8)}.${VIDEO_EXTENSIONS[contentType]}`;
  return `image-${id.slice(0, 8)}.${(contentType && EXTENSIONS[contentType]) || "img"}`;
}

/** Objects in the visitor's own bucket have no expiry. */
export const isPermanent = (item: Pick<ShelfRecord, "expiresAt">): boolean => !item.expiresAt;

const isExpired = (item: ShelfItem): boolean => !isPermanent(item) && item.expiresAt <= Date.now();

/** "Expires in 1 h · today 12:24", or when it expired. */
export function describeExpiry(item: Pick<ShelfRecord, "expiresAt">): string {
  if (isPermanent(item)) return "In your bucket · never expires";
  if (item.expiresAt <= Date.now()) return `Expired ${formatDayAndTime(item.expiresAt)}`;
  return `Expires in ${formatRemainingShort(item.expiresAt)} · ${formatDayAndTime(item.expiresAt)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  }
}

export async function copyItem(item: ShelfItem): Promise<boolean> {
  const copied = await copyText(absoluteUrl(item));
  hooks.say(copied ? "Link copied" : "Could not copy link", copied ? "" : "bad");
  return copied;
}

export async function shareItem(item: ShelfItem): Promise<void> {
  if (!navigator.share) {
    await copyItem(item);
    return;
  }
  try {
    await navigator.share({ url: absoluteUrl(item) });
  } catch (failure) {
    if ((failure as DOMException).name !== "AbortError") hooks.say("Could not open sharing", "bad");
  }
}

function updateShelfSummary(): void {
  uploadShelf.hidden = uploads.size === 0;
  toggleShelfLayout.hidden = uploads.size <= STRIP_VISIBLE_COUNT;
  if (toggleShelfLayout.hidden) setShelfExpanded(false);
}

function setShelfExpanded(expanded: boolean): void {
  shelfList.dataset.expanded = String(expanded);
  toggleShelfLayout.textContent = expanded ? "Show less" : "See all";
  toggleShelfLayout.setAttribute("aria-expanded", String(expanded));
}

function paintShelfItem(item: ShelfItem): void {
  if (!item.node || !item.badge) return;
  const expired = isExpired(item);
  item.node.dataset.expired = String(expired);
  item.badge.textContent = isPermanent(item) ? "" : formatRemainingShort(item.expiresAt);
  item.node.ariaLabel = `${item.label}, ${describeExpiry(item)}`;
}

/** Items newest first, as the strip shows them. */
function itemsInShelfOrder(): ShelfItem[] {
  return [...uploads.values()].sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));
}

function viewerEntryFor(item: ShelfItem): ViewerEntry {
  const isVideo = Boolean(item.contentType && VIDEO_EXTENSIONS[item.contentType]);
  return {
    title: item.label,
    describe: () => {
      const expiry = isExpired(item) ? "Expired" : `${formatRemainingShort(item.expiresAt)} left`;
      const parts = [isPermanent(item) ? `Uploaded ${formatShortDate(item.createdAt)}` : expiry];
      if (item.bytes) parts.push(formatBytes(item.bytes));
      return parts.join(" · ");
    },
    // An expired link is gone from the server; the local thumbnail still shows what it was.
    displayUrl: () => (isExpired(item) ? item.previewUrl : absoluteUrl(item)),
    thumbnailUrl: item.previewUrl,
    linkUrl: absoluteUrl(item),
    isVideo,
    isExpired: () => isExpired(item),
    canDownload: !item.bucketKey,
    delete: () => deleteShelfItem(item),
  };
}

function openShelfViewer(item: ShelfItem): void {
  const ordered = itemsInShelfOrder();
  openViewer(ordered.map(viewerEntryFor), ordered.indexOf(item));
}

export function createShelfItem(item: ShelfItem, prepend = false): void {
  const node = shelfItemTemplate.content.firstElementChild!.cloneNode(true) as HTMLButtonElement;
  item.node = node;
  item.badge = node.querySelector<HTMLElement>(".shelf-item-badge")!;
  node.querySelector("img")!.src = item.previewUrl;
  node.addEventListener("click", () => openShelfViewer(item));
  if (prepend) shelfList.prepend(node);
  else shelfList.append(node);
  paintShelfItem(item);
  updateShelfSummary();
}

function removeUpload(item: ShelfItem): void {
  uploads.delete(item.id);
  if (item.previewIsObject) URL.revokeObjectURL(item.previewUrl);
  item.node?.remove();
  void dropRecord(item.id);
  updateShelfSummary();
  hooks.onShelfItemRemoved(item);
}

/** Confirms, deletes on the server or in the bucket, and forgets the item. Resolves true when gone. */
export async function deleteShelfItem(item: ShelfItem): Promise<boolean> {
  const expired = isExpired(item);
  const accepted = await confirmDeletion(
    expired
      ? { title: "Remove from this device?", message: "The link already expired.", acceptLabel: "Remove" }
      : { title: "Delete this upload?", message: "Anyone with the link will lose access immediately." },
  );
  if (!accepted) return false;
  try {
    if (item.bucketKey) {
      const settings = loadBucketSettings();
      if (!settings) throw new Error("Bucket settings were removed; delete it in your bucket");
      await deleteBucketObject(settings, item.bucketKey);
    } else if (!expired) {
      const response = await fetch(`/api/media/${item.id}`, {
        method: "DELETE",
        headers: { "X-Delete-Token": item.deleteToken ?? "" },
      });
      if (!response.ok && response.status !== 404) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message || "Could not delete the upload");
      }
    }
    removeUpload(item);
    hooks.say(expired ? "Removed" : "Upload deleted");
    return true;
  } catch (failure) {
    hooks.say((failure as Error).message, "bad");
    return false;
  }
}

export async function restoreShelf(): Promise<void> {
  const records = (await allRecords()) || [];
  const cutoff = Date.now() - HISTORY_GRACE_MILLISECONDS;
  for (const record of records) {
    if (!isPermanent(record) && record.expiresAt <= cutoff) {
      void dropRecord(record.id);
      continue;
    }
    const safeRecord: ShelfRecord = {
      id: record.id,
      url: record.url,
      deleteToken: record.deleteToken,
      expiresAt: record.expiresAt,
      bucketKey: record.bucketKey,
      createdAt: record.createdAt,
      label: record.label || publicLabel(record.id, record.contentType),
      bytes: record.bytes,
      contentType: record.contentType,
      thumbnail: record.thumbnail || null,
    };
    if (record.name || !record.label) void saveRecord(safeRecord);
    const item: ShelfItem = {
      ...(safeRecord as ShelfItem),
      label: safeRecord.label!,
      previewUrl: safeRecord.thumbnail ? URL.createObjectURL(safeRecord.thumbnail) : absoluteUrl(safeRecord),
      previewIsObject: Boolean(safeRecord.thumbnail),
    };
    uploads.set(item.id, item);
  }
  itemsInShelfOrder().forEach((item) => createShelfItem(item));
  updateShelfSummary();
}

export function initShelf(shelfHooks: ShelfHooks): void {
  hooks = shelfHooks;
  toggleShelfLayout.addEventListener("click", () => setShelfExpanded(shelfList.dataset.expanded !== "true"));
}

/** One tick a second keeps badges and an open viewer's countdown current. */
export function startCountdown(onTick: () => void): void {
  setInterval(() => {
    uploads.forEach(paintShelfItem);
    paintViewerDetails();
    onTick();
  }, 1000);
}
