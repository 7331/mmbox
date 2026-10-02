import { EXTENSIONS, HISTORY_GRACE_MILLISECONDS, VIDEO_EXTENSIONS } from "./types";
import type { ShelfItem, ShelfRecord } from "./types";
import { allRecords, dropRecord, saveRecord } from "./history";
import { deleteBucketObject, loadBucketSettings } from "./bucket";

export interface ShelfHooks {
  say(message: string, tone?: string): void;
  resetPicker(): void;
  getLastResult(): ShelfItem | null;
}

export const uploads = new Map<string, ShelfItem>();

const uploadShelf = document.getElementById("uploadShelf") as HTMLElement;
const shelfList = document.getElementById("shelfList") as HTMLElement;
const shelfCount = document.getElementById("shelfCount") as HTMLElement;
const shelfItemTemplate = document.getElementById("shelfItemTemplate") as HTMLTemplateElement;
const deleteDialog = document.getElementById("deleteDialog") as HTMLDialogElement;

let hooks: ShelfHooks;
let deleting: ShelfItem | null = null;

export function absoluteUrl(item: Pick<ShelfItem, "url">): string {
  return new URL(item.url, location.origin).href;
}

export function publicLabel(id: string, contentType?: string): string {
  if (contentType && VIDEO_EXTENSIONS[contentType]) return `video-${id.slice(0, 8)}.${VIDEO_EXTENSIONS[contentType]}`;
  return `image-${id.slice(0, 8)}.${(contentType && EXTENSIONS[contentType]) || "img"}`;
}

/** Objects in the visitor's own bucket have no expiry. */
export const isPermanent = (item: Pick<ShelfRecord, "expiresAt">): boolean => !item.expiresAt;

export function formatLongDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" }).format(new Date(timestamp));
}

function remainingText(expiresAt: number): string {
  const seconds = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
  if (seconds === 0) return "expired";
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m left`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s left`;
  return `${seconds}s left`;
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

export async function copyItem(item: ShelfItem): Promise<void> {
  const copied = await copyText(absoluteUrl(item));
  hooks.say(copied ? "Link copied" : "Could not copy link", copied ? "" : "bad");
}

export async function shareItem(item: ShelfItem): Promise<void> {
  if (!navigator.share) return copyItem(item);
  try {
    await navigator.share({ url: absoluteUrl(item) });
  } catch (failure) {
    if ((failure as DOMException).name !== "AbortError") hooks.say("Could not open sharing", "bad");
  }
}

function downloadItem(item: ShelfItem): void {
  const link = document.createElement("a");
  link.href = absoluteUrl(item);
  link.download = item.label;
  document.body.append(link);
  link.click();
  link.remove();
}

export function updateShelfSummary(): void {
  const count = uploads.size;
  shelfCount.textContent = `${count} ${count === 1 ? "upload" : "uploads"}`;
  uploadShelf.hidden = count === 0;
}

export function paintShelfItem(item: ShelfItem): void {
  if (!item.node || !item.thumb || !item.relative || !item.date) return;
  const expired = !isPermanent(item) && item.expiresAt <= Date.now();
  item.node.dataset.expired = String(expired);
  item.relative.textContent = isPermanent(item) ? "in your bucket" : remainingText(item.expiresAt);
  item.date.textContent = isPermanent(item)
    ? `Uploaded ${formatLongDate(item.createdAt)}`
    : `${expired ? "Expired" : "Expires"} ${formatLongDate(item.expiresAt)}`;
  item.thumb.disabled = expired;
  item.thumb.ariaLabel = expired ? `${item.label}, expired` : `Open ${item.label}`;
  item.node
    .querySelectorAll<HTMLButtonElement>('[data-action="copy"], [data-action="share"], [data-action="download"]')
    .forEach((button) => {
      button.disabled = expired;
    });
}

export function createShelfItem(item: ShelfItem, prepend = false): void {
  const node = shelfItemTemplate.content.firstElementChild!.cloneNode(true) as HTMLElement;
  item.node = node;
  item.thumb = node.querySelector<HTMLButtonElement>(".thumb")!;
  item.relative = node.querySelector<HTMLElement>(".item-relative")!;
  item.date = node.querySelector<HTMLElement>(".item-date")!;
  const img = node.querySelector("img")!;
  img.src = item.previewUrl;
  img.alt = item.label;
  node.querySelector<HTMLElement>(".item-name")!.textContent = item.label;
  item.thumb.addEventListener("click", () => window.open(absoluteUrl(item), "_blank", "noopener"));
  node.querySelector(".item-actions")!.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest("button")?.dataset.action;
    if (action === "copy") void copyItem(item);
    else if (action === "share") void shareItem(item);
    else if (action === "download") downloadItem(item);
    else if (action === "delete") askDelete(item);
  });
  node.querySelector<HTMLElement>('[data-action="share"]')!.hidden = !navigator.share;
  if (prepend) shelfList.prepend(node);
  else shelfList.append(node);
  paintShelfItem(item);
  updateShelfSummary();
}

function askDelete(item: ShelfItem): void {
  deleting = item;
  deleteDialog.showModal();
}

function removeUpload(item: ShelfItem): void {
  uploads.delete(item.id);
  if (item.previewIsObject) URL.revokeObjectURL(item.previewUrl);
  item.node?.remove();
  void dropRecord(item.id);
  if (hooks.getLastResult()?.id === item.id) hooks.resetPicker();
  updateShelfSummary();
}

async function deleteUpload(): Promise<void> {
  const item = deleting;
  if (!item) return;
  const button = document.getElementById("deleteUpload") as HTMLButtonElement;
  button.disabled = true;
  button.textContent = "Deleting";
  try {
    if (item.bucketKey) {
      const settings = loadBucketSettings();
      if (!settings) throw new Error("Bucket settings were removed; delete it in your bucket");
      await deleteBucketObject(settings, item.bucketKey);
    } else {
      const response = await fetch(`/api/media/${item.id}`, {
        method: "DELETE",
        headers: { "X-Delete-Token": item.deleteToken ?? "" },
      });
      if (!response.ok && response.status !== 404) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message || "Could not delete the upload");
      }
    }
    deleteDialog.close();
    removeUpload(item);
    hooks.say("Upload deleted");
  } catch (failure) {
    hooks.say((failure as Error).message, "bad");
  } finally {
    deleting = null;
    button.disabled = false;
    button.textContent = "Delete now";
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
  [...uploads.values()]
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .forEach((item) => createShelfItem(item));
  updateShelfSummary();
}

export function initShelf(shelfHooks: ShelfHooks): void {
  hooks = shelfHooks;
  (document.getElementById("keepUpload") as HTMLButtonElement).addEventListener("click", () => {
    deleting = null;
    deleteDialog.close();
  });
  (document.getElementById("deleteUpload") as HTMLButtonElement).addEventListener("click", () => {
    void deleteUpload();
  });
  deleteDialog.addEventListener("close", () => {
    deleting = null;
  });
}

export function startCountdown(): void {
  setInterval(() => uploads.forEach(paintShelfItem), 1000);
}
