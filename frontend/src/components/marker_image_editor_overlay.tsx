// The image editor: marker.js (`@markerjs/markerjs-ui`, loaded on first use) full screen over the flow, with our own
// Cancel and Done bar. Done renders the markup onto the image (`@markerjs/markerjs3` Renderer, at most 2048 px on the
// long edge) and hands back the new blob; no markup hands back null (the original stays). marker.js injects its own
// styles, which is why the CSP keeps style-src 'unsafe-inline' (backend/app/shared/security_headers.py).
import type { AnnotationEditor, AnnotationEditorRenderEventData } from "@markerjs/markerjs-ui"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { ApplicationButton } from "@/components/application_button"
import { Spinner } from "@/components/ui/spinner"
import { editorMaximumEdgePixels, type MarkerRenderSettings, type PendingUpload } from "@/lib/media_upload_types"

type MarkerUserInterfaceModule = typeof import("@markerjs/markerjs-ui")

let markerUserInterfaceModulePromise: Promise<MarkerUserInterfaceModule> | null = null

function loadMarkerUserInterfaceModule(): Promise<MarkerUserInterfaceModule> {
  markerUserInterfaceModulePromise ??= import("@markerjs/markerjs-ui").catch((loadError: unknown) => {
    markerUserInterfaceModulePromise = null
    throw loadError
  })
  return markerUserInterfaceModulePromise
}

// Hides the editor's own OK, Close and Notes buttons (our bar has Done and Cancel) and gives its controls 44 px on
// phones. The styles go into the editor's shadow root.
// marker.js UI 1.1.0 puts its dark palette on `#mainContainer` inside `@media (prefers-color-scheme: dark)`, which
// outranks its own `[data-theme=light]` rule, so a dark device kept a dark editor after the visitor picked the light theme.
// Its light rule is declared again on `#mainContainer[data-theme="light"]`, which wins on any device.
function readLightThemeRuleForChosenLightTheme(editorShadowRoot: ShadowRoot | null): string {
  const editorStyleSheets = editorShadowRoot ? [...editorShadowRoot.styleSheets, ...editorShadowRoot.adoptedStyleSheets] : []
  const pendingRules: CSSRule[] = editorStyleSheets.flatMap((editorStyleSheet) => [...editorStyleSheet.cssRules])
  while (pendingRules.length) {
    const editorRule = pendingRules.shift()!
    if (editorRule instanceof CSSStyleRule && editorRule.selectorText.includes('[data-theme="light"]')) {
      return `#mainContainer[data-theme="light"] { ${editorRule.style.cssText} }`
    }
    if (editorRule instanceof CSSGroupingRule) pendingRules.push(...editorRule.cssRules)
  }
  return ""
}

function adjustMarkerEditorShadowRoot(annotationEditor: AnnotationEditor): void {
  const editorShadowRoot = annotationEditor.shadowRoot
  const editorSaveButton = editorShadowRoot?.querySelector<HTMLElement>('[aria-label="OK"]')
  const editorCloseButton = editorShadowRoot?.querySelector<HTMLElement>('[aria-label="Close"]')
  if (editorSaveButton) {
    editorSaveButton.setAttribute("aria-label", "Done editing")
    editorSaveButton.title = "Done editing"
  }
  if (editorCloseButton) {
    editorCloseButton.setAttribute("aria-label", "Cancel editing")
    editorCloseButton.title = "Cancel editing"
  }
  const injectedStyles = document.createElement("style")
  injectedStyles.textContent = `
    ${readLightThemeRuleForChosenLightTheme(editorShadowRoot)}
    [aria-label="Done editing"], [aria-label="Cancel editing"], [aria-label="Notes"] { display: none !important; }
    @media (max-width: 699px) {
      #toolbarContainer > div, #toolboxContainer > div { min-height: 52px; padding: 4px 6px !important; }
      .btn, [role="button"] { min-width: 44px !important; min-height: 44px !important; }
      .btn svg, [role="button"] svg { width: 23px; height: 23px; }
      #markerAreaContainer { touch-action: none; }
    }
  `
  editorShadowRoot?.append(injectedStyles)
}

// The renderer hands back a base64 data URL. Decoded here rather than with fetch(): the CSP's connect-src has no
// `data:`, so fetching it is refused (the old page lost every edit that way).
function convertDataUrlToBlob(dataUrl: string): Blob {
  const [dataUrlHeader, base64Payload] = dataUrl.split(",", 2)
  const contentType = /^data:([^;,]+)/.exec(dataUrlHeader)?.[1] ?? "image/png"
  const binaryText = atob(base64Payload)
  const payloadBytes = new Uint8Array(binaryText.length)
  for (let byteIndex = 0; byteIndex < binaryText.length; byteIndex++) payloadBytes[byteIndex] = binaryText.charCodeAt(byteIndex)
  return new Blob([payloadBytes], { type: contentType })
}

export function MarkerImageEditorOverlay({
  pendingUpload,
  onCancelEditing,
  onFinishEditing,
  onEditorUnavailable,
}: {
  pendingUpload: PendingUpload
  onCancelEditing(): void
  onFinishEditing(renderedBlob: Blob | null): void
  onEditorUnavailable(): void
}) {
  const markerHostElement = useRef<HTMLDivElement>(null)
  const markerEditor = useRef<AnnotationEditor | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const isRenderingReference = useRef(false)
  // The callbacks change per render; the editor's listeners read the latest.
  const latestCallbacks = useRef({ onCancelEditing, onFinishEditing, onEditorUnavailable })
  useEffect(() => {
    latestCallbacks.current = { onCancelEditing, onFinishEditing, onEditorUnavailable }
  })

  useEffect(() => {
    let editorWasRemoved = false
    document.documentElement.style.overflow = "hidden"
    async function openMarkerEditor() {
      try {
        const { AnnotationEditor: AnnotationEditorElement } = await loadMarkerUserInterfaceModule()
        const targetImage = new Image()
        targetImage.src = pendingUpload.previewUrl
        await targetImage.decode()
        if (editorWasRemoved || !markerHostElement.current) return
        const renderScale = Math.min(1, editorMaximumEdgePixels / Math.max(targetImage.naturalWidth, targetImage.naturalHeight))
        const renderSettings: MarkerRenderSettings = {
          width: Math.max(1, Math.round(targetImage.naturalWidth * renderScale)),
          height: Math.max(1, Math.round(targetImage.naturalHeight * renderScale)),
          imageType: pendingUpload.contentType === "image/jpeg" ? "image/jpeg" : "image/png",
          imageQuality: 0.92,
        }
        const annotationEditor = new AnnotationEditorElement()
        annotationEditor.targetImage = targetImage
        // The theme the page shows: the ThemeProvider's light or dark class on <html> (components/theme_provider.tsx).
        annotationEditor.theme = document.documentElement.classList.contains("dark") ? "dark" : "light"
        annotationEditor.settings.autoZoomIn = true
        annotationEditor.settings.autoZoomOut = true
        annotationEditor.settings.renderOnSave = false
        annotationEditor.addEventListener("editorclose", () => latestCallbacks.current.onCancelEditing())
        annotationEditor.addEventListener("editorsave", (saveEvent) => {
          void renderMarkupOntoImage(saveEvent as CustomEvent<AnnotationEditorRenderEventData>, targetImage, renderSettings)
        })
        markerHostElement.current.replaceChildren(annotationEditor)
        markerEditor.current = annotationEditor
        requestAnimationFrame(() => adjustMarkerEditorShadowRoot(annotationEditor))
      } catch (editorLoadError) {
        console.warn("mmbox: marker.js unavailable", editorLoadError)
        if (!editorWasRemoved) latestCallbacks.current.onEditorUnavailable()
      }
    }
    async function renderMarkupOntoImage(
      saveEvent: CustomEvent<AnnotationEditorRenderEventData>,
      targetImage: HTMLImageElement,
      renderSettings: MarkerRenderSettings,
    ) {
      if (isRenderingReference.current) return
      isRenderingReference.current = true
      setIsRendering(true)
      try {
        const placedMarkers = saveEvent.detail.state?.markers || []
        if (!placedMarkers.length) {
          latestCallbacks.current.onFinishEditing(null)
          return
        }
        const { Renderer } = await import("@markerjs/markerjs3")
        const markupRenderer = new Renderer()
        markupRenderer.targetImage = targetImage
        markupRenderer.naturalSize = false
        Object.assign(markupRenderer, renderSettings)
        const renderedDataUrl = await markupRenderer.rasterize(saveEvent.detail.state)
        if (!renderedDataUrl) throw new Error("Marker.js did not render the edited image")
        const renderedBlob = convertDataUrlToBlob(renderedDataUrl)
        latestCallbacks.current.onFinishEditing(renderedBlob)
      } catch (renderError) {
        console.warn("mmbox: could not render markup", renderError)
        toast.error("Could not render the markup")
      } finally {
        isRenderingReference.current = false
        setIsRendering(false)
      }
    }
    void openMarkerEditor()
    return () => {
      editorWasRemoved = true
      markerEditor.current = null
      document.documentElement.style.overflow = ""
    }
  }, [pendingUpload.previewUrl, pendingUpload.contentType])

  // Done forwards to the editor's own (hidden) OK button, which fires "editorsave" with the markup.
  function pressEditorDone() {
    markerEditor.current?.shadowRoot?.querySelector<HTMLElement>('[aria-label="Done editing"], [aria-label="OK"]')?.click()
  }

  return (
    <section
      id="image_editor"
      aria-label="Image editor"
      className="fixed inset-0 z-50 flex flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid min-h-14 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b px-3">
        <ApplicationButton id="cancel_editor_button" variant="ghost" size="touch" className="justify-self-start" onClick={onCancelEditing}>
          Cancel
        </ApplicationButton>
        <h2 className="text-[17px] font-semibold">Edit</h2>
        <ApplicationButton id="done_editor_button" size="touch" className="justify-self-end" disabled={isRendering} onClick={pressEditorDone}>
          {isRendering ? <Spinner /> : null}
          Done
        </ApplicationButton>
      </div>
      <div ref={markerHostElement} id="marker_editor_host" className="min-h-0 flex-1 [&>*]:block [&>*]:size-full" />
    </section>
  )
}
