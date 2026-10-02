// mmbox service worker: only receives files shared to the installed app (Web Share Target).
// It caches nothing and leaves every other request to the network.

const SHARE_TARGET_PATH = "/share-target";
const PAGE_READY_TIMEOUT_MILLISECONDS = 15000;

/** Resolved by the page's "share-ready" message once it can take the file. */
let resolvePageReady = null;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  if (event.data === "share-ready" && resolvePageReady) resolvePageReady(event.source);
});

function waitForReadyPage() {
  return new Promise((resolve, reject) => {
    resolvePageReady = resolve;
    setTimeout(() => reject(new Error("page never asked for the shared file")), PAGE_READY_TIMEOUT_MILLISECONDS);
  });
}

async function handOverSharedFile(request) {
  const pageReady = waitForReadyPage();
  const formData = await request.formData();
  const sharedFile = formData.get("file");
  const page = await pageReady;
  page.postMessage({ type: "shared-file", file: sharedFile instanceof File ? sharedFile : null });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== SHARE_TARGET_PATH) return;
  event.respondWith(Response.redirect("/?shared=1", 303));
  event.waitUntil(handOverSharedFile(event.request).catch(() => undefined));
});
