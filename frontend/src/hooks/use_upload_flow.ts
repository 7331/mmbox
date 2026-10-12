// One upload from pick to link: "selected" (preview, lifetime or destination, Edit), "progress" (cancellable) and
// "result" (the link, copied at once). Server links go to `POST /api/upload`; with a bucket the file goes straight to
// it (stills redrawn here first, so EXIF and GPS never leave) or through the relay. The flow sits on its own history
// entry, so Back closes it.
import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"

import { useBrowserBackClosesLayer } from "@/hooks/use_browser_back_closes_layer"
import { buildAbsoluteUrl, buildPublicLabel } from "@/hooks/use_upload_shelf"
import { closeBrowserHistoryLayer, pushBrowserHistoryLayer } from "@/lib/browser_history_layers"
import { uploadDirectlyToBucket, uploadThroughBucketRelay, type BucketSettings } from "@/lib/bucket_connection"
import { tryCopyTextToClipboard } from "@/lib/clipboard_and_sharing"
import { createThumbnailBlob, isAnimatedImage, stripStillImageMetadata } from "@/lib/image_preparation"
import {
  imageExtensionsByContentType,
  isVideoContentType,
  maximumUploadBytes,
  possiblyAnimatedContentTypes,
  type PendingUpload,
  type ShelfItem,
  type ShelfRecord,
} from "@/lib/media_upload_types"
import { createRandomTransportName, UploadCancelled, UploadFailure, uploadToServer } from "@/lib/server_upload"

export type UploadFlowStage = "selected" | "progress" | "result"

export interface UploadFlowNote {
  text: string
  tone: "plain" | "error"
}

export function useUploadFlow({
  bucketSettings,
  selectedLifetimeSeconds,
  addShelfItem,
  onBucketObjectUploaded,
}: {
  bucketSettings: BucketSettings | null
  selectedLifetimeSeconds: number
  addShelfItem(newRecord: ShelfRecord): Promise<ShelfItem>
  onBucketObjectUploaded(): void
}) {
  const [uploadFlowStage, setUploadFlowStage] = useState<UploadFlowStage | null>(null)
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null)
  const [uploadFlowNote, setUploadFlowNote] = useState<UploadFlowNote | null>(null)
  const [uploadProgressPercent, setUploadProgressPercent] = useState(0)
  const [uploadedShelfItem, setUploadedShelfItem] = useState<ShelfItem | null>(null)
  const [resultCopyStateText, setResultCopyStateText] = useState("")
  // The pending upload the running upload belongs to; a result for an upload the visitor left is dropped.
  const pendingUploadReference = useRef<PendingUpload | null>(null)
  const uploadAbortController = useRef<AbortController | null>(null)

  const replacePendingUpload = useCallback((nextPendingUpload: PendingUpload | null) => {
    const previousPendingUpload = pendingUploadReference.current
    if (previousPendingUpload && previousPendingUpload.previewUrl !== nextPendingUpload?.previewUrl) {
      URL.revokeObjectURL(previousPendingUpload.previewUrl)
    }
    pendingUploadReference.current = nextPendingUpload
    setPendingUpload(nextPendingUpload)
  }, [])

  const uploadFlowStageReference = useRef<UploadFlowStage | null>(null)
  const showUploadFlowStage = useCallback((nextStage: UploadFlowStage) => {
    if (uploadFlowStageReference.current === null) {
      pushBrowserHistoryLayer("mmboxFlow")
      window.scrollTo(0, 0)
    }
    uploadFlowStageReference.current = nextStage
    setUploadFlowStage(nextStage)
  }, [])

  // Back to the home screen, dropping whatever was picked or uploading.
  const hideUploadFlowAndForgetPending = useCallback(() => {
    uploadAbortController.current?.abort()
    uploadAbortController.current = null
    replacePendingUpload(null)
    setUploadedShelfItem(null)
    setUploadFlowNote(null)
    uploadFlowStageReference.current = null
    setUploadFlowStage(null)
  }, [replacePendingUpload])

  useBrowserBackClosesLayer("mmboxFlow", uploadFlowStage !== null, hideUploadFlowAndForgetPending)

  const leaveUploadFlow = useCallback(() => closeBrowserHistoryLayer("mmboxFlow", hideUploadFlowAndForgetPending), [hideUploadFlowAndForgetPending])

  const showSelectedStage = useCallback(
    (noteText = "", noteTone: UploadFlowNote["tone"] = "plain") => {
      setUploadFlowNote(noteText ? { text: noteText, tone: noteTone } : null)
      showUploadFlowStage("selected")
    },
    [showUploadFlowStage],
  )

  const isUploadRunning = uploadFlowStage === "progress"

  const acceptPickedFiles = useCallback(
    async (offeredFiles: FileList | File[] | null) => {
      if (isUploadRunning) {
        toast.error("Wait for the current upload to finish")
        return
      }
      const pickedFiles = [...(offeredFiles || [])].filter(Boolean)
      if (!pickedFiles.length) return
      if (pickedFiles.length > 1) toast("One file at a time")
      const pickedFile = pickedFiles[0]
      const pickedFileIsVideo = isVideoContentType(pickedFile.type)
      if (bucketSettings?.mode === "relay" && (pickedFileIsVideo || pickedFile.size > maximumUploadBytes)) {
        toast.error("Video and files over 25 MB need CORS on your bucket (see bucket settings)")
        return
      }
      if (bucketSettings) {
        if (!imageExtensionsByContentType[pickedFile.type] && !pickedFileIsVideo) {
          toast.error("Choose an image or an MP4, WEBM or MOV video")
          return
        }
      } else if (!imageExtensionsByContentType[pickedFile.type] || pickedFile.size > maximumUploadBytes) {
        toast.error("Choose a PNG, JPG, GIF or WebP under 25 MB")
        return
      }
      setUploadedShelfItem(null)
      const isAnimated = !pickedFileIsVideo && possiblyAnimatedContentTypes.has(pickedFile.type) && (await isAnimatedImage(pickedFile).catch(() => true))
      replacePendingUpload({
        originalFile: pickedFile,
        uploadFile: pickedFile,
        contentType: pickedFile.type,
        byteCount: pickedFile.size,
        previewUrl: URL.createObjectURL(pickedFile),
        transportName: createRandomTransportName(pickedFile.type),
        canEdit: !pickedFileIsVideo && !isAnimated,
      })
      showSelectedStage(isAnimated ? "Animation will be preserved." : "")
    },
    [bucketSettings, isUploadRunning, replacePendingUpload, showSelectedStage],
  )

  const settleFinishedUpload = useCallback(
    async (uploadedPending: PendingUpload, storedUpload: Pick<ShelfRecord, "id" | "url" | "deleteToken" | "expiresAt" | "bucketKey">) => {
      uploadAbortController.current = null
      const thumbnailBlob = await createThumbnailBlob(uploadedPending.uploadFile).catch(() => null)
      const newShelfItem = await addShelfItem({
        ...storedUpload,
        createdAt: Date.now(),
        label: buildPublicLabel(storedUpload.id.replace(/^.*\//, ""), uploadedPending.contentType),
        bytes: uploadedPending.byteCount,
        contentType: uploadedPending.contentType,
        thumbnail: thumbnailBlob,
      })
      if (pendingUploadReference.current !== uploadedPending) return
      setUploadedShelfItem(newShelfItem)
      setResultCopyStateText("")
      showUploadFlowStage("result")
      const linkWasCopied = await tryCopyTextToClipboard(buildAbsoluteUrl(newShelfItem.url))
      setResultCopyStateText(linkWasCopied ? "Copied to clipboard" : "Tap Copy link to copy it")
      if (newShelfItem.bucketKey) onBucketObjectUploaded()
    },
    [addShelfItem, onBucketObjectUploaded, showUploadFlowStage],
  )

  const uploadPendingFile = useCallback(async () => {
    const uploadingPending = pendingUploadReference.current
    if (!uploadingPending || isUploadRunning) return
    const abortController = new AbortController()
    uploadAbortController.current = abortController
    setUploadProgressPercent(0)
    setUploadFlowNote(null)
    showUploadFlowStage("progress")
    try {
      if (bucketSettings) {
        let preparedPending = uploadingPending
        // The relay strips on the server; a direct upload must strip here, since the server never sees it.
        const stillUntouched = uploadingPending.uploadFile === uploadingPending.originalFile && uploadingPending.canEdit
        if (stillUntouched && bucketSettings.mode === "direct") {
          const strippedBlob = await stripStillImageMetadata(uploadingPending.originalFile)
          preparedPending = { ...uploadingPending, uploadFile: strippedBlob, byteCount: strippedBlob.size }
          pendingUploadReference.current = preparedPending
          setPendingUpload(preparedPending)
        }
        const storedObject =
          bucketSettings.mode === "relay"
            ? await uploadThroughBucketRelay(bucketSettings, preparedPending, setUploadProgressPercent, abortController.signal)
            : await uploadDirectlyToBucket(bucketSettings, preparedPending, setUploadProgressPercent, abortController.signal)
        await settleFinishedUpload(preparedPending, { id: storedObject.key, url: storedObject.url, deleteToken: "", expiresAt: 0, bucketKey: storedObject.key })
      } else {
        const serverResponse = await uploadToServer(uploadingPending, selectedLifetimeSeconds, setUploadProgressPercent, abortController.signal)
        await settleFinishedUpload(uploadingPending, {
          id: serverResponse.id,
          url: serverResponse.url,
          deleteToken: serverResponse.delete_token,
          expiresAt: new Date(serverResponse.expires_at).getTime(),
        })
      }
    } catch (uploadError) {
      uploadAbortController.current = null
      if (!pendingUploadReference.current) return
      if (uploadError instanceof UploadCancelled) {
        showSelectedStage("Upload cancelled.")
        return
      }
      const retryAfterSeconds = uploadError instanceof UploadFailure ? uploadError.retryAfterSeconds : 0
      const waitText = retryAfterSeconds ? ` Try again in ${retryAfterSeconds} seconds.` : ""
      showSelectedStage(`${(uploadError as Error).message}.${waitText}`, "error")
    }
  }, [bucketSettings, isUploadRunning, selectedLifetimeSeconds, settleFinishedUpload, showSelectedStage, showUploadFlowStage])

  const cancelRunningUpload = useCallback(() => uploadAbortController.current?.abort(), [])

  // An edit from the editor replaces the pending file and returns to "selected".
  const applyEditedImage = useCallback(
    (renderedBlob: Blob | null) => {
      const editedPending = pendingUploadReference.current
      if (!editedPending) return
      if (renderedBlob) {
        const renderedContentType = renderedBlob.type || "image/png"
        replacePendingUpload({
          ...editedPending,
          uploadFile: renderedBlob,
          contentType: renderedContentType,
          byteCount: renderedBlob.size,
          previewUrl: URL.createObjectURL(renderedBlob),
          transportName: createRandomTransportName(renderedContentType),
        })
      }
      showSelectedStage()
    },
    [replacePendingUpload, showSelectedStage],
  )

  // The flow closes when its result was deleted from anywhere (the viewer, the shelf).
  const closeUploadFlowIfShowing = useCallback(
    (removedItem: ShelfItem) => {
      if (uploadedShelfItem?.id === removedItem.id) leaveUploadFlow()
    },
    [leaveUploadFlow, uploadedShelfItem],
  )

  const copyResultLink = useCallback(async () => {
    if (!uploadedShelfItem) return
    const linkWasCopied = await tryCopyTextToClipboard(buildAbsoluteUrl(uploadedShelfItem.url))
    if (linkWasCopied) {
      setResultCopyStateText("Copied to clipboard")
      toast("Link copied")
    } else toast.error("Could not copy link")
  }, [uploadedShelfItem])

  return {
    uploadFlowStage,
    pendingUpload,
    uploadFlowNote,
    uploadProgressPercent,
    uploadedShelfItem,
    resultCopyStateText,
    acceptPickedFiles,
    uploadPendingFile,
    cancelRunningUpload,
    leaveUploadFlow,
    applyEditedImage,
    showSelectedStage,
    closeUploadFlowIfShowing,
    copyResultLink,
  }
}
