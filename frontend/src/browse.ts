import type { BucketObject, BucketSettings } from "./bucket";
import { deleteBucketObject, listBucket, publicUrl } from "./bucket";

export interface BrowseHooks {
  say(message: string, tone?: string): void;
  copyText(text: string): Promise<boolean>;
}

const browser = document.getElementById("bucketBrowser") as HTMLElement;
const grid = document.getElementById("bucketGrid") as HTMLElement;
const note = document.getElementById("bucketBrowserNote") as HTMLElement;
const loadMore = document.getElementById("loadMoreBucket") as HTMLButtonElement;
const tileTemplate = document.getElementById("bucketTileTemplate") as HTMLTemplateElement;

const IMAGE_KEY = /\.(png|jpe?g|gif|webp|avif)$/i;
const VIDEO_KEY = /\.(mp4|webm|mov)$/i;

let hooks: BrowseHooks;
let settings: BucketSettings | null = null;
let nextToken: string | null = null;
let loading = false;

function addTile(object: BucketObject): void {
  if (!settings) return;
  const current = settings;
  const url = publicUrl(current, object.key);
  const tile = tileTemplate.content.firstElementChild!.cloneNode(true) as HTMLElement;
  const image = tile.querySelector("img")!;
  const kind = tile.querySelector<HTMLElement>(".tile-kind")!;
  if (IMAGE_KEY.test(object.key)) {
    image.src = url;
    image.alt = object.key;
  } else {
    image.hidden = true;
    kind.hidden = false;
    kind.textContent = VIDEO_KEY.test(object.key) ? "video" : object.key.split(".").pop() || "file";
  }
  tile.title = `${object.key} · ${(object.sizeBytes / 1024).toFixed(0)} KB`;
  tile.addEventListener("click", (event) => {
    const action = (event.target as HTMLElement).closest("button")?.dataset.action;
    if (action === "copy") void hooks.copyText(url).then((copied) => hooks.say(copied ? "Link copied" : "Could not copy", copied ? "" : "bad"));
    else if (action === "open") window.open(url, "_blank", "noopener");
    else if (action === "delete" && confirm(`Delete ${object.key}? Anyone with the link loses it.`)) {
      void deleteBucketObject(current, object.key).then(
        () => {
          tile.remove();
          hooks.say("Deleted from bucket");
        },
        (failure: Error) => hooks.say(failure.message, "bad"),
      );
    }
  });
  grid.append(tile);
}

async function loadPage(reset: boolean): Promise<void> {
  if (!settings || loading) return;
  loading = true;
  if (reset) {
    grid.replaceChildren();
    nextToken = null;
  }
  try {
    const page = await listBucket(settings, nextToken);
    page.objects
      .filter((object) => !object.key.endsWith("/"))
      .sort((left, right) => right.lastModifiedAt.localeCompare(left.lastModifiedAt))
      .forEach(addTile);
    nextToken = page.nextContinuationToken;
    loadMore.hidden = !nextToken;
    note.hidden = grid.childElementCount > 0;
    note.textContent = "Nothing here yet.";
  } catch (failure) {
    note.hidden = false;
    note.textContent = `Could not list the bucket: ${(failure as Error).message}`;
  } finally {
    loading = false;
  }
}

export function showBucket(current: BucketSettings | null): void {
  settings = current;
  browser.hidden = !current;
  if (current) void loadPage(true);
}

export function initBrowse(browseHooks: BrowseHooks): void {
  hooks = browseHooks;
  loadMore.addEventListener("click", () => void loadPage(false));
  document.getElementById("refreshBucket")!.addEventListener("click", () => void loadPage(true));
}
