// Hides an open layer when the browser goes back past its history entry (lib/browser_history_layers.ts).
import { useEffect, useRef } from "react"

import { isBrowserHistoryLayerOpen, type BrowserHistoryLayerName } from "@/lib/browser_history_layers"

export function useBrowserBackClosesLayer(layerName: BrowserHistoryLayerName, layerIsOpen: boolean, hideLayer: () => void): void {
  const latestHideLayer = useRef(hideLayer)
  useEffect(() => {
    latestHideLayer.current = hideLayer
  })
  useEffect(() => {
    if (!layerIsOpen) return
    function hideLayerWhenItsEntryIsGone() {
      if (!isBrowserHistoryLayerOpen(layerName)) latestHideLayer.current()
    }
    window.addEventListener("popstate", hideLayerWhenItsEntryIsGone)
    return () => window.removeEventListener("popstate", hideLayerWhenItsEntryIsGone)
  }, [layerName, layerIsOpen])
}
