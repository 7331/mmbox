// One upload, one screen per stage: "selected" (the photo, what happens to its metadata, the lifetime or the bucket it
// goes to, Edit), "progress" (Cancel) and "result" (the link, already copied, Share and Copy, Delete now). The caller
// remounts it per stage inside `PageContentRisesInContext`, so each stage rises in.
import { Check, CircleCheck, Database, Link as LinkIcon, Lock, Pencil, Plus, Share, Upload, X } from "lucide-react"
import type { ReactNode } from "react"

import { DrawnCheckPath } from "@/components/drawn_check_path"
import { OneLineLinkText } from "@/components/one_line_link_text"
import { PageColumn } from "@/components/page_column"
import { SlidingSelectionPill } from "@/components/sliding_selection_pill"
import { TapToCopyButton } from "@/components/tap_to_copy_button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { UploadFlowNote, UploadFlowStage } from "@/hooks/use_upload_flow"
import { buildAbsoluteUrl, describeShelfItemExpiry } from "@/hooks/use_upload_shelf"
import { describeBucketPlace, type BucketSettings } from "@/lib/bucket_connection"
import { canOpenShareSheet } from "@/lib/clipboard_and_sharing"
import { formatByteCount, formatDayAndTime } from "@/lib/display_formatting"
import { isVideoContentType, lifetimeChoices, type PendingUpload, type ShelfItem } from "@/lib/media_upload_types"

// What happens to metadata on the way, for the line under the photo.
function describeMetadataHandling(contentType: string, bucketSettings: BucketSettings | null): string {
  if (isVideoContentType(contentType)) return "video is uploaded as-is, metadata included"
  if (bucketSettings?.mode === "relay") return "metadata stripped by the relay"
  return "location and camera data removed"
}

function describeProgressPrivacyStep(bucketSettings: BucketSettings | null): string {
  if (!bucketSettings) return "Metadata is stripped on arrival"
  return bucketSettings.mode === "relay" ? "Metadata is stripped by the relay" : "Metadata removed in this browser"
}

function describeDestinationNote(contentType: string, bucketSettings: BucketSettings): string {
  if (isVideoContentType(contentType)) return "Video goes straight to your bucket as-is; its metadata is not removed."
  if (bucketSettings.mode === "relay") return "The image passes through this server, which strips it; your keys are sent per request and never stored."
  return "Still images are re-drawn in the browser first, so EXIF and GPS never leave this device."
}

function UploadFlowTopBar({ title, leading, trailing }: { title: string; leading: ReactNode; trailing: ReactNode }) {
  return (
    <header className="grid min-h-14 grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div className="justify-self-start">{leading}</div>
      <h1 id="upload_flow_title" className="text-[17px] font-semibold tracking-tight">
        {title}
      </h1>
      <div className="justify-self-end">{trailing}</div>
    </header>
  )
}

function FlowPhotoPreview({ pendingUpload }: { pendingUpload: PendingUpload }) {
  return (
    <div id="upload_flow_photo" className="grid max-h-[40dvh] place-items-center overflow-hidden rounded-2xl bg-muted">
      {isVideoContentType(pendingUpload.contentType) ? (
        <video id="upload_flow_video" src={pendingUpload.previewUrl} muted playsInline preload="metadata" className="max-h-[40dvh] w-full object-contain" />
      ) : (
        <img id="upload_flow_image" src={pendingUpload.previewUrl} alt="" className="max-h-[40dvh] w-full object-contain" />
      )}
    </div>
  )
}

export function UploadFlowScreen({
  uploadFlowStage,
  pendingUpload,
  uploadFlowNote,
  uploadProgressPercent,
  uploadedShelfItem,
  resultCopyStateText,
  bucketSettings,
  selectedLifetimeSeconds,
  currentTime,
  onSelectLifetime,
  onCloseFlow,
  onOpenEditor,
  onStartNewUpload,
  onUploadPendingFile,
  onCancelUpload,
  onChangeDestination,
  onCopyResultLink,
  onShareResultLink,
  onDeleteResult,
}: {
  uploadFlowStage: UploadFlowStage
  pendingUpload: PendingUpload
  uploadFlowNote: UploadFlowNote | null
  uploadProgressPercent: number
  uploadedShelfItem: ShelfItem | null
  resultCopyStateText: string
  bucketSettings: BucketSettings | null
  selectedLifetimeSeconds: number
  currentTime: number
  onSelectLifetime(lifetimeSeconds: number): void
  onCloseFlow(): void
  onOpenEditor(): void
  onStartNewUpload(): void
  onUploadPendingFile(): void
  onCancelUpload(): void
  onChangeDestination(): void
  onCopyResultLink(): void
  onShareResultLink(): void
  onDeleteResult(): void
}) {
  const closeButton = (
    <Button id="close_flow_button" variant="ghost" size="touch" className="-ml-3.5 w-11 px-0" aria-label="Close" onClick={onCloseFlow}>
      <X className="size-5" />
    </Button>
  )
  const usingBucket = Boolean(bucketSettings)
  const failedBefore = uploadFlowNote?.tone === "error"

  if (uploadFlowStage === "selected") {
    return (
      <PageColumn
        topBar={
          <UploadFlowTopBar
            title={usingBucket ? "Upload" : "New link"}
            leading={closeButton}
            trailing={
              pendingUpload.canEdit ? (
                <Button id="edit_selected_button" variant="ghost" size="touch" className="-mr-3.5" onClick={onOpenEditor}>
                  <Pencil />
                  Edit
                </Button>
              ) : null
            }
          />
        }
        footer={
          <Button id="upload_selected_button" size="xl" className="w-full" onClick={onUploadPendingFile}>
            {usingBucket ? <Upload /> : <LinkIcon />}
            {failedBefore ? "Try again" : usingBucket ? "Upload to bucket" : "Create link"}
          </Button>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <FlowPhotoPreview pendingUpload={pendingUpload} />
          <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Lock className="size-3.5 shrink-0" />
            <span id="selected_info">
              {formatByteCount(pendingUpload.byteCount)} · {describeMetadataHandling(pendingUpload.contentType, bucketSettings)}
            </span>
          </p>
          {uploadFlowNote ? (
            failedBefore ? (
              <Alert id="selected_note" variant="destructive">
                <AlertDescription>{uploadFlowNote.text}</AlertDescription>
              </Alert>
            ) : (
              <p id="selected_note" className="text-sm text-muted-foreground">
                {uploadFlowNote.text}
              </p>
            )
          ) : null}
          {bucketSettings ? (
            <div className="flex flex-col gap-2">
              <div id="destination_section" className="divide-y rounded-2xl border">
                <div className="flex min-h-13 items-center gap-3 py-1 pr-1.5 pl-4">
                  <Database className="size-5 shrink-0 text-muted-foreground" />
                  <span id="destination_name" className="min-w-0 flex-1 truncate text-[15px] font-medium">
                    {describeBucketPlace(bucketSettings)}
                  </span>
                  <Button id="change_destination_button" variant="ghost" size="touch" onClick={onChangeDestination}>
                    Change
                  </Button>
                </div>
                <div className="flex min-h-12 items-center gap-3 px-4 text-sm text-muted-foreground">
                  <CircleCheck className="size-5 shrink-0" />
                  <span id="destination_mode">Never expires · {bucketSettings.mode === "relay" ? "through the mmbox relay" : "direct to your bucket"}</span>
                </div>
              </div>
              <p id="destination_note" className="text-[13px] text-muted-foreground">
                {describeDestinationNote(pendingUpload.contentType, bucketSettings)}
              </p>
            </div>
          ) : (
            <div id="lifetime_section" className="flex flex-col gap-2">
              <h2 id="lifetime_heading" className="text-sm font-medium">
                Delete after
              </h2>
              <ToggleGroup
                id="lifetime_choices"
                type="single"
                variant="outline"
                spacing={0}
                value={String(selectedLifetimeSeconds)}
                onValueChange={(pickedSeconds) => {
                  if (pickedSeconds) onSelectLifetime(Number(pickedSeconds))
                }}
                aria-labelledby="lifetime_heading"
                className="grid w-full grid-cols-4 [&>*:nth-child(-n+4)]:border-b-0"
              >
                {lifetimeChoices.map((lifetimeChoice, choiceIndex) => (
                  <ToggleGroupItem
                    key={lifetimeChoice.seconds}
                    value={String(lifetimeChoice.seconds)}
                    data-testid={`lifetime_choice_${lifetimeChoice.seconds}`}
                    className={
                      // A 4x2 grid of one outline: square inner corners, round outer ones, one border between rows.
                      "relative h-11 rounded-none! border-l-0 text-[15px] font-medium data-[state=on]:bg-transparent data-[state=on]:text-background " +
                      ["rounded-tl-lg! border-l!", "", "", "rounded-tr-lg!", "rounded-bl-lg! border-l!", "", "", "rounded-br-lg!"][choiceIndex]
                    }
                  >
                    {selectedLifetimeSeconds === lifetimeChoice.seconds ? <SlidingSelectionPill layoutId="lifetime_selected_pill" /> : null}
                    <span className="relative">{lifetimeChoice.label}</span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p id="lifetime_expiry" className="text-[13px] text-muted-foreground">
                Link stops working {formatDayAndTime(currentTime + selectedLifetimeSeconds * 1000)}
              </p>
            </div>
          )}
        </div>
      </PageColumn>
    )
  }

  if (uploadFlowStage === "progress") {
    const sentByteCount = (pendingUpload.byteCount * uploadProgressPercent) / 100
    return (
      <PageColumn
        topBar={<UploadFlowTopBar title={usingBucket ? "Uploading" : "Creating link"} leading={<span className="block size-11" />} trailing={null} />}
        footer={
          <Button id="cancel_upload_button" variant="outline" size="xl" className="w-full" onClick={onCancelUpload}>
            Cancel
          </Button>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <FlowPhotoPreview pendingUpload={pendingUpload} />
          <div className="flex items-baseline justify-between">
            <strong className="text-[15px] font-semibold">Uploading…</strong>
            <span id="upload_progress_text" className="text-sm text-muted-foreground tabular-nums">
              {uploadProgressPercent}%
            </span>
          </div>
          <Progress id="upload_progress_bar" aria-label="Upload progress" value={uploadProgressPercent} className="h-2" />
          {!isVideoContentType(pendingUpload.contentType) ? (
            <p className="flex items-center gap-2 text-sm text-success">
              <Check className="size-4 shrink-0" />
              {describeProgressPrivacyStep(bucketSettings)}
            </p>
          ) : null}
          <p className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
            <Upload className="size-4 shrink-0" />
            Sending {formatByteCount(sentByteCount)} of {formatByteCount(pendingUpload.byteCount)}
          </p>
        </div>
      </PageColumn>
    )
  }

  const resultLinkUrl = uploadedShelfItem ? buildAbsoluteUrl(uploadedShelfItem.url) : ""
  return (
    <PageColumn
      topBar={
        <UploadFlowTopBar
          title=""
          leading={closeButton}
          trailing={
            <Button id="new_upload_button" variant="ghost" size="touch" className="-mr-3.5" onClick={onStartNewUpload}>
              <Plus />
              New
            </Button>
          }
        />
      }
      footer={
        <div className={canOpenShareSheet() ? "grid grid-cols-2 gap-2" : "grid"}>
          {canOpenShareSheet() ? (
            <Button id="share_result_button" variant="outline" size="xl" onClick={onShareResultLink}>
              <Share />
              Share
            </Button>
          ) : null}
          <Button id="copy_result_button" size="xl" onClick={onCopyResultLink}>
            <LinkIcon />
            Copy link
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        <FlowPhotoPreview pendingUpload={pendingUpload} />
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-success/15 text-success">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <DrawnCheckPath />
            </svg>
          </span>
          <div className="flex flex-col">
            <h2 id="result_title" className="text-2xl font-semibold tracking-tight">
              Link ready
            </h2>
            <p id="result_copy_state" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
              {resultCopyStateText}
            </p>
          </div>
        </div>
        {uploadedShelfItem ? (
          <>
            <TapToCopyButton
              id="result_link_button"
              textToCopy={resultLinkUrl}
              accessibleLabel={`Copy link ${resultLinkUrl}`}
              feedbackShownBy="trailing_icon"
              className="flex min-h-14 w-full items-center gap-3 border px-4 text-left"
            >
              <OneLineLinkText id="result_link_text" linkUrl={resultLinkUrl} className="flex-1 text-sm text-foreground" />
            </TapToCopyButton>
            <div className="flex items-center justify-between gap-3">
              <span id="result_expiry" className="text-[13px] text-muted-foreground">
                {describeShelfItemExpiry(uploadedShelfItem, currentTime)}
              </span>
              <Button id="delete_result_button" variant="ghost" size="touch" className="-mr-3.5 shrink-0 text-destructive hover:text-destructive" onClick={onDeleteResult}>
                Delete now
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </PageColumn>
  )
}
