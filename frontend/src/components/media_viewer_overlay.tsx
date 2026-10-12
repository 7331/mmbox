// Full-screen viewer for shelf uploads and bucket objects: swipe, arrow keys or the filmstrip to move; copy, share,
// save or open, and delete. Always dark, photo first. A Radix Dialog for focus and Escape; the caller closes it
// through history (Back closes it too).
import { ChevronLeft, ChevronRight, Download, ExternalLink, Link as LinkIcon, Share, Trash2, X } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { canOpenShareSheet, shareLinkWithShareSheet, tryCopyTextToClipboard } from "@/lib/clipboard_and_sharing"
import { vibrateBriefly } from "@/lib/haptic_feedback"
import { cn } from "@/lib/utils"

export interface MediaViewerEntry {
  entryKey: string
  title: string
  subtitle: string
  // What the stage shows: the full object, or the local thumbnail once a link has expired.
  displayUrl: string
  thumbnailUrl: string
  linkUrl: string
  isVideo: boolean
  // Set for objects with no preview (not an image or video): shown as text instead.
  placeholderText?: string
  isExpired: boolean
  // Same-origin links can be saved with a download; other origins only open.
  canDownload: boolean
  // Asks, deletes, and resolves true once the object is gone.
  deleteEntry(): Promise<boolean>
}

const swipeThresholdPixels = 50

export function MediaViewerOverlay({
  viewerEntries,
  currentEntryIndex,
  onCurrentEntryIndexChange,
  onCloseViewer,
}: {
  viewerEntries: MediaViewerEntry[]
  currentEntryIndex: number
  onCurrentEntryIndexChange(nextEntryIndex: number): void
  onCloseViewer(): void
}) {
  const currentEntry = viewerEntries[currentEntryIndex]
  const touchStart = useRef<{ horizontal: number; vertical: number; isSingleFinger: boolean }>({ horizontal: 0, vertical: 0, isSingleFinger: false })
  const filmstripElement = useRef<HTMLDivElement>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  function showEntryAt(nextEntryIndex: number) {
    onCurrentEntryIndexChange(Math.max(0, Math.min(viewerEntries.length - 1, nextEntryIndex)))
  }

  useEffect(() => {
    filmstripElement.current
      ?.querySelector<HTMLElement>('[aria-current="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" })
  }, [currentEntryIndex])

  if (!currentEntry) return null

  async function copyCurrentLink() {
    const linkWasCopied = await tryCopyTextToClipboard(currentEntry.linkUrl)
    if (linkWasCopied) {
      vibrateBriefly()
      toast("Link copied")
    } else toast.error("Could not copy link")
  }

  async function shareCurrentLink() {
    if ((await shareLinkWithShareSheet(currentEntry.linkUrl)) === "failed") toast.error("Could not open sharing")
  }

  function downloadCurrentEntry() {
    const downloadLink = document.createElement("a")
    downloadLink.href = currentEntry.linkUrl
    downloadLink.download = currentEntry.title
    document.body.append(downloadLink)
    downloadLink.click()
    downloadLink.remove()
  }

  async function deleteCurrentEntry() {
    setIsDeleting(true)
    try {
      await currentEntry.deleteEntry()
    } finally {
      setIsDeleting(false)
    }
  }

  const hasSeveralEntries = viewerEntries.length > 1

  return (
    <DialogPrimitive.Root open onOpenChange={(nextIsOpen) => (nextIsOpen ? undefined : onCloseViewer())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          data-testid="media_viewer"
          aria-describedby="media_viewer_subtitle"
          onKeyDown={(keyEvent) => {
            if (keyEvent.key === "ArrowLeft") showEntryAt(currentEntryIndex - 1)
            else if (keyEvent.key === "ArrowRight") showEntryAt(currentEntryIndex + 1)
          }}
          className="fixed inset-0 z-50 flex flex-col bg-black pt-[max(env(safe-area-inset-top),0.5rem)] pb-[max(env(safe-area-inset-bottom),0.5rem)] text-white outline-none"
        >
          <header className="flex min-h-14 items-center gap-3 px-3">
            <DialogPrimitive.Close
              id="close_viewer_button"
              aria-label="Close"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 transition-colors outline-none hover:bg-white/20 focus-visible:ring-3 focus-visible:ring-white/50 motion-safe:active:scale-[0.97]"
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
            <div className="flex min-w-0 flex-1 flex-col">
              <DialogPrimitive.Title id="media_viewer_title" className="truncate text-[15px] font-semibold">
                {currentEntry.title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description id="media_viewer_subtitle" className="truncate text-[13px] text-white/70">
                {currentEntry.subtitle}
              </DialogPrimitive.Description>
            </div>
            {hasSeveralEntries ? (
              <span id="media_viewer_position" className="shrink-0 text-[13px] text-white/70 tabular-nums">
                {currentEntryIndex + 1} of {viewerEntries.length}
              </span>
            ) : null}
          </header>

          <div
            id="media_viewer_stage"
            className="relative flex min-h-0 flex-1 items-center justify-center px-2 py-2"
            onTouchStart={(touchEvent) => {
              touchStart.current = {
                horizontal: touchEvent.touches[0].clientX,
                vertical: touchEvent.touches[0].clientY,
                isSingleFinger: touchEvent.touches.length === 1,
              }
            }}
            onTouchEnd={(touchEvent) => {
              if (!touchStart.current.isSingleFinger || (touchEvent.target as HTMLElement).tagName === "VIDEO") return
              const endingTouch = touchEvent.changedTouches[0]
              const horizontalDistance = endingTouch.clientX - touchStart.current.horizontal
              const verticalDistance = endingTouch.clientY - touchStart.current.vertical
              if (Math.abs(horizontalDistance) < swipeThresholdPixels || Math.abs(horizontalDistance) < Math.abs(verticalDistance)) return
              showEntryAt(currentEntryIndex + (horizontalDistance < 0 ? 1 : -1))
            }}
          >
            <ViewerStageMedia key={currentEntry.entryKey} viewerEntry={currentEntry} />
            {currentEntryIndex > 0 ? (
              <ViewerStepButton accessibleLabel="Previous" className="left-2" onClick={() => showEntryAt(currentEntryIndex - 1)}>
                <ChevronLeft className="size-6" />
              </ViewerStepButton>
            ) : null}
            {currentEntryIndex < viewerEntries.length - 1 ? (
              <ViewerStepButton accessibleLabel="Next" className="right-2" onClick={() => showEntryAt(currentEntryIndex + 1)}>
                <ChevronRight className="size-6" />
              </ViewerStepButton>
            ) : null}
          </div>

          {hasSeveralEntries ? (
            <>
              <div ref={filmstripElement} id="media_viewer_filmstrip" className="mx-auto flex max-w-full gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:none]">
                {viewerEntries.map((viewerEntry, entryIndex) => (
                  <button
                    key={viewerEntry.entryKey}
                    type="button"
                    aria-label={viewerEntry.title}
                    aria-current={entryIndex === currentEntryIndex}
                    onClick={() => showEntryAt(entryIndex)}
                    className={cn(
                      "size-11 shrink-0 overflow-hidden rounded-lg bg-white/10 opacity-60 outline-none transition-[opacity,box-shadow] focus-visible:ring-3 focus-visible:ring-white/50",
                      entryIndex === currentEntryIndex && "opacity-100 ring-2 ring-white",
                    )}
                  >
                    {viewerEntry.thumbnailUrl ? <img src={viewerEntry.thumbnailUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : null}
                  </button>
                ))}
              </div>
              <p className="text-center text-xs text-white/60">Swipe for next</p>
            </>
          ) : null}

          <div className="mx-auto grid w-full max-w-[440px] auto-cols-fr grid-flow-col gap-1 px-3 pt-2">
            {!currentEntry.isExpired ? (
              <ViewerActionButton actionName="copy" icon={<LinkIcon />} label="Copy link" onClick={() => void copyCurrentLink()} />
            ) : null}
            {!currentEntry.isExpired && canOpenShareSheet() ? (
              <ViewerActionButton actionName="share" icon={<Share />} label="Share" onClick={() => void shareCurrentLink()} />
            ) : null}
            {!currentEntry.isExpired && currentEntry.canDownload ? (
              <ViewerActionButton actionName="download" icon={<Download />} label="Download" onClick={downloadCurrentEntry} />
            ) : null}
            {!currentEntry.isExpired && !currentEntry.canDownload ? (
              <ViewerActionButton actionName="open" icon={<ExternalLink />} label="Open" onClick={() => window.open(currentEntry.linkUrl, "_blank", "noopener")} />
            ) : null}
            <ViewerActionButton
              actionName="delete"
              icon={<Trash2 />}
              label="Delete"
              isDanger
              isDisabled={isDeleting}
              onClick={() => void deleteCurrentEntry()}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// Remounted per entry, so a video stops and a new image never flashes the previous one.
function ViewerStageMedia({ viewerEntry }: { viewerEntry: MediaViewerEntry }) {
  const mediaClassName = cn("max-h-full max-w-full rounded-md object-contain", viewerEntry.isExpired && "opacity-50 grayscale")
  if (viewerEntry.placeholderText) {
    return <p className="font-mono text-4xl font-semibold text-white/70 uppercase">{viewerEntry.placeholderText}</p>
  }
  if (viewerEntry.isVideo && !viewerEntry.isExpired) {
    return <video id="media_viewer_video" src={viewerEntry.linkUrl} poster={viewerEntry.thumbnailUrl || undefined} controls playsInline preload="metadata" className={mediaClassName} />
  }
  return <img id="media_viewer_image" src={viewerEntry.isVideo ? viewerEntry.thumbnailUrl : viewerEntry.displayUrl} alt={viewerEntry.title} className={mediaClassName} />
}

function ViewerStepButton({ accessibleLabel, className, onClick, children }: { accessibleLabel: string; className: string; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={accessibleLabel}
      onClick={onClick}
      className={cn(
        "absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white outline-none backdrop-blur transition-colors hover:bg-black/70 focus-visible:ring-3 focus-visible:ring-white/50",
        className,
      )}
    >
      {children}
    </button>
  )
}

function ViewerActionButton({
  actionName,
  icon,
  label,
  onClick,
  isDanger = false,
  isDisabled = false,
}: {
  actionName: string
  icon: ReactNode
  label: string
  onClick(): void
  isDanger?: boolean
  isDisabled?: boolean
}) {
  return (
    <button
      type="button"
      data-viewer-action={actionName}
      disabled={isDisabled}
      onClick={onClick}
      className={cn(
        "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium outline-none transition-colors hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-white/50 disabled:opacity-50 motion-safe:active:scale-[0.97] [&_svg]:size-6",
        // The dark scheme's destructive token: the viewer is dark in both schemes.
        isDanger ? "text-[oklch(0.75_0.16_22.216)]" : "text-white",
      )}
    >
      {icon}
      {label}
    </button>
  )
}
