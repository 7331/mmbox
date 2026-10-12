// Home: without a bucket, the drop zone for a self-deleting link; with one, the bucket's grid. The device shelf in
// both, and the screen's actions at the bottom, in the thumb's reach.
import { ChevronDown, ClipboardPaste, ImagePlus, Images, Lock, RefreshCw, Settings, Upload } from "lucide-react"
import { motion } from "motion/react"

import { BucketObjectGrid } from "@/components/bucket_object_grid"
import { DeviceUploadShelf } from "@/components/device_upload_shelf"
import { PageColumn } from "@/components/page_column"
import { SiteTopBar } from "@/components/site_top_bar"
import { Button } from "@/components/ui/button"
import type { useBucketListing } from "@/hooks/use_bucket_listing"
import { useMediaQuery } from "@/hooks/use_media_query"
import type { BucketSettings } from "@/lib/bucket_connection"
import type { ShelfItem } from "@/lib/media_upload_types"
import { pressedScale } from "@/lib/motion_presets"
import { cn } from "@/lib/utils"

const pasteShortcutText = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘V" : "Ctrl V"

function BucketStatusChip({ bucketSettings, onOpenBucketSheet }: { bucketSettings: BucketSettings | null; onOpenBucketSheet(): void }) {
  const accessibleLabel = bucketSettings
    ? `Uploading to your bucket ${bucketSettings.bucket}${bucketSettings.mode === "relay" ? " through the relay" : ""}. Change`
    : "Temporary links. Use my own bucket"
  return (
    <Button
      id="open_bucket_settings_button"
      variant="outline"
      size="touch"
      aria-haspopup="dialog"
      aria-label={accessibleLabel}
      onClick={onOpenBucketSheet}
      className="rounded-full pr-2.5 pl-3"
    >
      <span aria-hidden="true" className={cn("size-2 rounded-full", bucketSettings ? "bg-success" : "bg-muted-foreground")} />
      <span id="bucket_status_text">{bucketSettings ? "My bucket" : "Temporary"}</span>
      <ChevronDown className="text-muted-foreground" />
    </Button>
  )
}

export function HomeScreen({
  bucketSettings,
  bucketListing,
  shelfItems,
  currentTime,
  onOpenBucketSheet,
  onChooseFile,
  onPasteFromClipboard,
  onOpenShelfItem,
  onOpenBucketObject,
}: {
  bucketSettings: BucketSettings | null
  bucketListing: ReturnType<typeof useBucketListing>
  shelfItems: ShelfItem[]
  currentTime: number
  onOpenBucketSheet(): void
  onChooseFile(): void
  onPasteFromClipboard(): void
  onOpenShelfItem(shelfItemIndex: number): void
  onOpenBucketObject(objectIndex: number): void
}) {
  const pointerIsCoarse = useMediaQuery("(pointer: coarse)")
  const homeFooter = bucketSettings ? (
    <div className="grid grid-cols-[auto_1fr_auto] gap-2">
      <Button id="open_bucket_settings_from_bar_button" variant="outline" size="xl" className="w-13 px-0" aria-label="Bucket settings" onClick={onOpenBucketSheet}>
        <Settings />
      </Button>
      <Button id="upload_to_bucket_button" size="xl" onClick={onChooseFile}>
        <Upload />
        Upload
      </Button>
      <Button
        id="refresh_bucket_button"
        variant="outline"
        size="xl"
        className="w-13 px-0"
        aria-label="Refresh the bucket"
        disabled={bucketListing.isLoadingBucketPage}
        onClick={bucketListing.refreshBucketListing}
      >
        <RefreshCw className={cn(bucketListing.isLoadingBucketPage && "motion-safe:animate-spin")} />
      </Button>
    </div>
  ) : (
    <div className="grid grid-cols-[auto_1fr] gap-2">
      <Button id="paste_from_clipboard_button" variant="outline" size="xl" onClick={onPasteFromClipboard}>
        <ClipboardPaste />
        Paste
      </Button>
      <Button id="choose_photo_button" size="xl" onClick={onChooseFile}>
        <ImagePlus />
        Choose photo
      </Button>
    </div>
  )

  return (
    <PageColumn
      topBar={<SiteTopBar trailing={<BucketStatusChip bucketSettings={bucketSettings} onOpenBucketSheet={onOpenBucketSheet} />} />}
      footer={homeFooter}
      stickyFooter
    >
      <div className="flex flex-col gap-6 pt-3">
        {bucketSettings ? null : (
          <section aria-label="Upload an image" className="flex flex-col gap-3">
            <motion.button
              id="drop_zone_button"
              type="button"
              whileTap={{ scale: pressedScale }}
              onClick={onChooseFile}
              className="flex min-h-72 w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-input px-6 py-10 text-center outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="mb-2 grid size-16 place-items-center rounded-full bg-muted">
                <Images className="size-8" />
              </span>
              <strong className="text-xl font-semibold tracking-tight">Choose a photo</strong>
              <span className="text-sm text-muted-foreground">PNG, JPG, GIF or WebP, up to 25 MB</span>
              <span id="paste_hint" className="mt-1 text-[13px] text-muted-foreground">
                {pointerIsCoarse ? (
                  "or tap Paste · or share a photo to mmbox"
                ) : (
                  <>
                    or paste <kbd className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{pasteShortcutText}</kbd> · or drop a file
                  </>
                )}
              </span>
            </motion.button>
            <p className="flex items-center justify-center gap-1.5 text-[13px] text-muted-foreground">
              <Lock className="size-3.5" />
              Metadata stripped · links expire in 15 min to 1 day
            </p>
          </section>
        )}
        <DeviceUploadShelf shelfItems={shelfItems} currentTime={currentTime} onOpenShelfItem={onOpenShelfItem} />
        {bucketSettings ? (
          <BucketObjectGrid
            bucketSettings={bucketSettings}
            listedObjects={bucketListing.listedObjects}
            hasMoreBucketObjects={bucketListing.hasMoreBucketObjects}
            isLoadingBucketPage={bucketListing.isLoadingBucketPage}
            bucketListingError={bucketListing.bucketListingError}
            onLoadNextBucketPage={bucketListing.loadNextBucketPage}
            onOpenBucketObject={onOpenBucketObject}
          />
        ) : null}
      </div>
    </PageColumn>
  )
}
