// The upload flow and the viewer each sit on their own history entry, so the Android back gesture (and the browser's
// Back) closes them instead of leaving the page. A layer's flag lives in `history.state`; closing it from its own
// button goes through `history.back()`, and a `popstate` without the flag hides it.

export type BrowserHistoryLayerName = "mmboxFlow" | "mmboxViewer"

export function isBrowserHistoryLayerOpen(layerName: BrowserHistoryLayerName): boolean {
  return Boolean((history.state as Record<string, unknown> | null)?.[layerName])
}

export function pushBrowserHistoryLayer(layerName: BrowserHistoryLayerName): void {
  if (isBrowserHistoryLayerOpen(layerName)) return
  history.pushState({ ...(history.state as Record<string, unknown> | null), [layerName]: true }, "")
}

// Goes back when the layer has its history entry (popstate then hides it), else hides it at once.
export function closeBrowserHistoryLayer(layerName: BrowserHistoryLayerName, hideLayer: () => void): void {
  if (isBrowserHistoryLayerOpen(layerName)) history.back()
  else hideLayer()
}
