// The whole page: home (drop zone or bucket grid, the device shelf), the upload flow, the viewer, the editor, the
// bucket sheet, and the ways a file comes in (picker, paste, drop, the Android share target).
import { ImagePlus } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import type { MediaViewerEntry } from "@/components/media_viewer_overlay"
import { PageContentRisesInContext } from "@/components/page_content_rises_in_context"
import { useBrowserBackClosesLayer } from "@/hooks/use_browser_back_closes_layer"
import { useBucketListing } from "@/hooks/use_bucket_listing"
import { useCurrentTimeEverySecond } from "@/hooks/use_current_time_every_second"
import { useDeletionConfirmation } from "@/hooks/use_deletion_confirmation"
import { useUploadFlow } from "@/hooks/use_upload_flow"
import { buildAbsoluteUrl, isExpiredShelfRecord, isPermanentShelfRecord, useUploadShelf } from "@/hooks/use_upload_shelf"
import { closeBrowserHistoryLayer, pushBrowserHistoryLayer } from "@/lib/browser_history_layers"
import {
  buildPublicObjectUrl,
  deleteBucketObject,
  imageObjectKeyPattern,
  loadBucketSettings,
  readObjectExtension,
  readObjectFileName,
  videoObjectKeyPattern,
  saveBucketSettings,
  type BucketObject,
  type BucketSettings,
} from "@/lib/bucket_connection"
import { canOpenShareSheet, shareLinkWithShareSheet, tryCopyTextToClipboard } from "@/lib/clipboard_and_sharing"
import { formatByteCount, formatRemainingTimeShort, formatShortDate } from "@/lib/display_formatting"
import {
  acceptedImageAndVideoTypes,
  acceptedImageTypes,
  defaultLifetimeSeconds,
  imageExtensionsByContentType,
  isVideoContentType,
  maximumLifetimeSeconds,
  minimumLifetimeSeconds,
  type ShelfItem,
} from "@/lib/media_upload_types"
import { deleteFromServer } from "@/lib/server_upload"
import { setFirstHistoryFailureReporter } from "@/lib/upload_history_database"
import { HomeScreen } from "@/screens/home_screen"
import { UploadFlowScreen } from "@/screens/upload_flow_screen"

// The overlays load on first use, so the first paint carries only the home screen
// (https://react.dev/reference/react/lazy).
const BucketSettingsSheet = lazy(async () => ({ default: (await import("@/components/bucket_settings_sheet")).BucketSettingsSheet }))
const MediaViewerOverlay = lazy(async () => ({ default: (await import("@/components/media_viewer_overlay")).MediaViewerOverlay }))
const MarkerImageEditorOverlay = lazy(async () => ({ default: (await import("@/components/marker_image_editor_overlay")).MarkerImageEditorOverlay }))

const lifetimeStorageKey = "mmbox.lifetime"

setFirstHistoryFailureReporter(() => toast.error("Local history is unavailable"))

function readStoredLifetimeSeconds(): number {
  try {
    const storedSeconds = Number(localStorage.getItem(lifetimeStorageKey))
    const storedIsAccepted = Number.isInteger(storedSeconds) && storedSeconds >= minimumLifetimeSeconds && storedSeconds <= maximumLifetimeSeconds
    return storedIsAccepted ? storedSeconds : defaultLifetimeSeconds
  } catch {
    return defaultLifetimeSeconds
  }
}

type OpenViewer = { viewerSource: "shelf" | "bucket"; currentEntryIndex: number }

export function MediaBoxApplication() {
  const [bucketSettings, setBucketSettings] = useState<BucketSettings | null>(loadBucketSettings)
  const [selectedLifetimeSeconds, setSelectedLifetimeSeconds] = useState(readStoredLifetimeSeconds)
  const [bucketSheetIsOpen, setBucketSheetIsOpen] = useState(false)
  // Mounted from the first opening on, so its closing animation plays.
  const [bucketSheetWasOpened, setBucketSheetWasOpened] = useState(false)
  const [editorIsOpen, setEditorIsOpen] = useState(false)
  const [openViewer, setOpenViewer] = useState<OpenViewer | null>(null)
  const [dragCoverIsShown, setDragCoverIsShown] = useState(false)
  const filePickerElement = useRef<HTMLInputElement>(null)
  const currentTime = useCurrentTimeEverySecond()
  const askForDeletionConfirmation = useDeletionConfirmation()

  const { shelfItems, addShelfItem, removeShelfItem } = useUploadShelf()
  const bucketListing = useBucketListing(bucketSettings)
  const uploadFlow = useUploadFlow({
    bucketSettings,
    selectedLifetimeSeconds,
    addShelfItem,
    onBucketObjectUploaded: bucketListing.refreshBucketListing,
  })
  const { acceptPickedFiles, uploadFlowStage, showSelectedStage, closeUploadFlowIfShowing } = uploadFlow

  function applyBucketSettings(nextBucketSettings: BucketSettings | null) {
    setBucketSettings(nextBucketSettings)
    saveBucketSettings(nextBucketSettings)
    // A file waiting in "selected" is redrawn for its new destination.
    if (uploadFlowStage === "selected") showSelectedStage()
  }

  function openBucketSheet() {
    setBucketSheetWasOpened(true)
    setBucketSheetIsOpen(true)
  }

  function selectLifetime(lifetimeSeconds: number) {
    setSelectedLifetimeSeconds(lifetimeSeconds)
    try {
      localStorage.setItem(lifetimeStorageKey, String(lifetimeSeconds))
    } catch {
      // The choice still holds for this tab.
    }
  }

  function openFilePicker() {
    if (!filePickerElement.current) return
    filePickerElement.current.value = ""
    filePickerElement.current.click()
  }

  async function pasteFromClipboard() {
    if (!navigator.clipboard?.read) {
      toast.error("Paste is not available here; press Ctrl V or ⌘V instead")
      return
    }
    try {
      const clipboardItems = await navigator.clipboard.read()
      for (const clipboardItem of clipboardItems) {
        const imageType = clipboardItem.types.find((clipboardType) => clipboardType.startsWith("image/"))
        if (!imageType) continue
        const imageBlob = await clipboardItem.getType(imageType)
        void acceptPickedFiles([new File([imageBlob], `pasted.${imageExtensionsByContentType[imageType] ?? "png"}`, { type: imageType })])
        return
      }
      toast.error("No image on the clipboard")
    } catch {
      toast.error("Could not read the clipboard")
    }
  }

  // Confirms, deletes on the server or in the bucket, and forgets the item. Resolves true when gone.
  const deleteShelfItem = useCallback(
    async (shelfItem: ShelfItem): Promise<boolean> => {
      const shelfItemIsExpired = isExpiredShelfRecord(shelfItem, Date.now())
      const deletionAccepted = await askForDeletionConfirmation(
        shelfItemIsExpired
          ? { title: "Remove from this device?", message: "The link already expired.", acceptLabel: "Remove" }
          : { title: "Delete this upload?", message: "Anyone with the link will lose access immediately." },
      )
      if (!deletionAccepted) return false
      try {
        if (shelfItem.bucketKey) {
          const storedBucketSettings = loadBucketSettings()
          if (!storedBucketSettings) throw new Error("Bucket settings were removed; delete it in your bucket")
          await deleteBucketObject(storedBucketSettings, shelfItem.bucketKey)
          bucketListing.forgetListedObject({ key: shelfItem.bucketKey, sizeBytes: 0, lastModifiedAt: "" })
        } else if (!shelfItemIsExpired) {
          await deleteFromServer(shelfItem.id, shelfItem.deleteToken ?? "")
        }
        removeShelfItem(shelfItem)
        closeUploadFlowIfShowing(shelfItem)
        toast(shelfItemIsExpired ? "Removed" : "Upload deleted")
        return true
      } catch (deletionError) {
        toast.error((deletionError as Error).message)
        return false
      }
    },
    [askForDeletionConfirmation, bucketListing, closeUploadFlowIfShowing, removeShelfItem],
  )

  const deleteListedBucketObject = useCallback(
    async (listedObject: BucketObject): Promise<boolean> => {
      if (!bucketSettings) return false
      const deletionAccepted = await askForDeletionConfirmation({
        title: "Delete from your bucket?",
        message: `${readObjectFileName(listedObject.key)} is removed from ${bucketSettings.bucket}. Anyone with the link loses it.`,
      })
      if (!deletionAccepted) return false
      try {
        await deleteBucketObject(bucketSettings, listedObject.key)
      } catch (deletionError) {
        toast.error((deletionError as Error).message)
        return false
      }
      bucketListing.forgetListedObject(listedObject)
      toast("Deleted from bucket")
      return true
    },
    [askForDeletionConfirmation, bucketListing, bucketSettings],
  )

  /* The viewer: entries rebuilt from the shelf or the listing on every render, so countdowns and deletions show. */

  const viewerEntries = useMemo((): MediaViewerEntry[] => {
    if (!openViewer) return []
    if (openViewer.viewerSource === "shelf") {
      return shelfItems.map((shelfItem) => {
        const shelfItemIsExpired = isExpiredShelfRecord(shelfItem, currentTime)
        const subtitleParts = [
          isPermanentShelfRecord(shelfItem)
            ? `Uploaded ${formatShortDate(shelfItem.createdAt)}`
            : shelfItemIsExpired
              ? "Expired"
              : `${formatRemainingTimeShort(shelfItem.expiresAt, currentTime)} left`,
        ]
        if (shelfItem.bytes) subtitleParts.push(formatByteCount(shelfItem.bytes))
        return {
          entryKey: shelfItem.id,
          title: shelfItem.label,
          subtitle: subtitleParts.join(" · "),
          // An expired link is gone from the server; the local thumbnail still shows what it was.
          displayUrl: shelfItemIsExpired ? shelfItem.previewUrl : buildAbsoluteUrl(shelfItem.url),
          thumbnailUrl: shelfItem.previewUrl,
          linkUrl: buildAbsoluteUrl(shelfItem.url),
          isVideo: isVideoContentType(shelfItem.contentType),
          isExpired: shelfItemIsExpired,
          canDownload: !shelfItem.bucketKey,
          deleteEntry: () => deleteShelfItem(shelfItem),
        }
      })
    }
    if (!bucketSettings) return []
    return bucketListing.listedObjects.map((listedObject) => {
      const publicObjectUrl = buildPublicObjectUrl(bucketSettings, listedObject.key)
      const objectIsImage = imageObjectKeyPattern.test(listedObject.key)
      const objectIsVideo = videoObjectKeyPattern.test(listedObject.key)
      return {
        entryKey: listedObject.key,
        title: readObjectFileName(listedObject.key),
        subtitle: `${formatShortDate(Date.parse(listedObject.lastModifiedAt))} · ${formatByteCount(listedObject.sizeBytes)}`,
        displayUrl: publicObjectUrl,
        thumbnailUrl: objectIsImage ? publicObjectUrl : "",
        linkUrl: publicObjectUrl,
        isVideo: objectIsVideo,
        placeholderText: objectIsImage || objectIsVideo ? undefined : readObjectExtension(listedObject.key),
        isExpired: false,
        canDownload: false,
        deleteEntry: () => deleteListedBucketObject(listedObject),
      }
    })
  }, [openViewer, shelfItems, currentTime, bucketSettings, bucketListing.listedObjects, deleteShelfItem, deleteListedBucketObject])

  function showViewer(viewerSource: OpenViewer["viewerSource"], currentEntryIndex: number) {
    pushBrowserHistoryLayer("mmboxViewer")
    setOpenViewer({ viewerSource, currentEntryIndex })
  }
  const hideViewer = useCallback(() => setOpenViewer(null), [])
  const closeViewer = useCallback(() => closeBrowserHistoryLayer("mmboxViewer", hideViewer), [hideViewer])
  useBrowserBackClosesLayer("mmboxViewer", openViewer !== null, hideViewer)
  const viewerIsShowing = openViewer !== null && viewerEntries.length > 0
  // The last entry deleted closes the viewer.
  useEffect(() => {
    if (openViewer && viewerEntries.length === 0) closeViewer()
  }, [openViewer, viewerEntries.length, closeViewer])

  /* Files from outside: drop, paste, the share target. */

  const latestAcceptPickedFiles = useRef(acceptPickedFiles)
  useEffect(() => {
    latestAcceptPickedFiles.current = acceptPickedFiles
  })

  useEffect(() => {
    let dragDepth = 0
    function showDragCover(dragEvent: DragEvent) {
      dragEvent.preventDefault()
      dragDepth += 1
      setDragCoverIsShown(true)
    }
    function allowDrop(dragEvent: DragEvent) {
      dragEvent.preventDefault()
    }
    function hideDragCoverWhenLeft() {
      dragDepth = Math.max(0, dragDepth - 1)
      if (dragDepth === 0) setDragCoverIsShown(false)
    }
    function acceptDroppedFiles(dropEvent: DragEvent) {
      dropEvent.preventDefault()
      dragDepth = 0
      setDragCoverIsShown(false)
      void latestAcceptPickedFiles.current(dropEvent.dataTransfer?.files ?? [])
    }
    function acceptPastedFiles(pasteEvent: ClipboardEvent) {
      if ((pasteEvent.target as HTMLElement).closest?.("input, textarea")) return
      const pastedFiles = [...(pasteEvent.clipboardData?.items ?? [])]
        .filter((clipboardItem) => clipboardItem.kind === "file" && (clipboardItem.type.startsWith("image/") || clipboardItem.type.startsWith("video/")))
        .map((clipboardItem) => clipboardItem.getAsFile())
        .filter((pastedFile): pastedFile is File => Boolean(pastedFile))
      if (!pastedFiles.length) return
      pasteEvent.preventDefault()
      void latestAcceptPickedFiles.current(pastedFiles)
    }
    document.addEventListener("dragenter", showDragCover)
    document.addEventListener("dragover", allowDrop)
    document.addEventListener("dragleave", hideDragCoverWhenLeft)
    document.addEventListener("drop", acceptDroppedFiles)
    document.addEventListener("paste", acceptPastedFiles)
    return () => {
      document.removeEventListener("dragenter", showDragCover)
      document.removeEventListener("dragover", allowDrop)
      document.removeEventListener("dragleave", hideDragCoverWhenLeft)
      document.removeEventListener("drop", acceptDroppedFiles)
      document.removeEventListener("paste", acceptPastedFiles)
    }
  }, [])

  // Files shared to the installed app arrive from the service worker after its redirect to `/?shared=1`.
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !new URLSearchParams(location.search).has("shared")) return
    history.replaceState(null, "", "/")
    function receiveSharedFile(messageEvent: MessageEvent<{ type?: string; file?: File | null }>) {
      if (messageEvent.data?.type !== "shared-file") return
      if (messageEvent.data.file) void latestAcceptPickedFiles.current([messageEvent.data.file])
      else toast.error("Nothing to upload in that share")
    }
    navigator.serviceWorker.addEventListener("message", receiveSharedFile)
    navigator.serviceWorker.startMessages()
    void navigator.serviceWorker.ready.then((serviceWorkerRegistration) => {
      ;(navigator.serviceWorker.controller ?? serviceWorkerRegistration.active)?.postMessage("share-ready")
    })
    return () => navigator.serviceWorker.removeEventListener("message", receiveSharedFile)
  }, [])

  const shownUploadFlowStage = uploadFlow.pendingUpload ? uploadFlowStage : null

  return (
    <>
      <input
        ref={filePickerElement}
        id="file_picker_input"
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        accept={bucketSettings?.mode === "direct" ? acceptedImageAndVideoTypes : acceptedImageTypes}
        onChange={(changeEvent) => void acceptPickedFiles(changeEvent.target.files)}
      />

      {shownUploadFlowStage && uploadFlow.pendingUpload ? (
        <PageContentRisesInContext value>
          <UploadFlowScreen
            key={shownUploadFlowStage}
            uploadFlowStage={shownUploadFlowStage}
            pendingUpload={uploadFlow.pendingUpload}
            uploadFlowNote={uploadFlow.uploadFlowNote}
            uploadProgressPercent={uploadFlow.uploadProgressPercent}
            uploadedShelfItem={uploadFlow.uploadedShelfItem}
            resultCopyStateText={uploadFlow.resultCopyStateText}
            bucketSettings={bucketSettings}
            selectedLifetimeSeconds={selectedLifetimeSeconds}
            currentTime={currentTime}
            onSelectLifetime={selectLifetime}
            onCloseFlow={uploadFlow.leaveUploadFlow}
            onOpenEditor={() => setEditorIsOpen(true)}
            onStartNewUpload={() => {
              uploadFlow.leaveUploadFlow()
              openFilePicker()
            }}
            onUploadPendingFile={() => void uploadFlow.uploadPendingFile()}
            onCancelUpload={uploadFlow.cancelRunningUpload}
            onChangeDestination={openBucketSheet}
            onCopyResultLink={() => void uploadFlow.copyResultLink()}
            onShareResultLink={() => {
              const uploadedShelfItem = uploadFlow.uploadedShelfItem
              if (!uploadedShelfItem) return
              const resultLinkUrl = buildAbsoluteUrl(uploadedShelfItem.url)
              if (!canOpenShareSheet()) {
                void tryCopyTextToClipboard(resultLinkUrl).then((linkWasCopied) => (linkWasCopied ? toast("Link copied") : toast.error("Could not copy link")))
                return
              }
              void shareLinkWithShareSheet(resultLinkUrl).then((shareOutcome) => {
                if (shareOutcome === "failed") toast.error("Could not open sharing")
              })
            }}
            onDeleteResult={() => {
              if (uploadFlow.uploadedShelfItem) void deleteShelfItem(uploadFlow.uploadedShelfItem)
            }}
          />
        </PageContentRisesInContext>
      ) : (
        <HomeScreen
          bucketSettings={bucketSettings}
          bucketListing={bucketListing}
          shelfItems={shelfItems}
          currentTime={currentTime}
          onOpenBucketSheet={openBucketSheet}
          onChooseFile={openFilePicker}
          onPasteFromClipboard={() => void pasteFromClipboard()}
          onOpenShelfItem={(shelfItemIndex) => showViewer("shelf", shelfItemIndex)}
          onOpenBucketObject={(objectIndex) => showViewer("bucket", objectIndex)}
        />
      )}

      <Suspense fallback={null}>
        {viewerIsShowing && openViewer ? (
          <MediaViewerOverlay
            viewerEntries={viewerEntries}
            currentEntryIndex={Math.min(openViewer.currentEntryIndex, viewerEntries.length - 1)}
            onCurrentEntryIndexChange={(nextEntryIndex) => setOpenViewer({ ...openViewer, currentEntryIndex: nextEntryIndex })}
            onCloseViewer={closeViewer}
          />
        ) : null}

        {editorIsOpen && uploadFlow.pendingUpload ? (
          <MarkerImageEditorOverlay
            pendingUpload={uploadFlow.pendingUpload}
            onCancelEditing={() => {
              setEditorIsOpen(false)
              showSelectedStage()
            }}
            onFinishEditing={(renderedBlob) => {
              setEditorIsOpen(false)
              uploadFlow.applyEditedImage(renderedBlob)
            }}
            onEditorUnavailable={() => {
              setEditorIsOpen(false)
              showSelectedStage("Editor unavailable. The original is unchanged.")
            }}
          />
        ) : null}

        {bucketSheetWasOpened ? (
          <BucketSettingsSheet
            isOpen={bucketSheetIsOpen}
            onOpenChange={setBucketSheetIsOpen}
            currentBucketSettings={bucketSettings}
            onApplyBucketSettings={applyBucketSettings}
          />
        ) : null}
      </Suspense>

      <AnimatePresence>
        {dragCoverIsShown ? (
          <motion.div
            id="drag_cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none fixed inset-3 z-50 flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-foreground/40 bg-background/90 text-lg font-semibold backdrop-blur"
          >
            <ImagePlus className="size-9" />
            Drop to upload
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
