// "In your bucket": the listed objects as a grid (images by their public URL, videos and other files by their
// extension), "Load more" for the next page, and the empty or failed state.
import { CloudOff, ImageOff, Video } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { ApplicationButton } from "@/components/application_button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  buildPublicObjectUrl,
  describeBucketPlace,
  imageObjectKeyPattern,
  readObjectExtension,
  readObjectFileName,
  videoObjectKeyPattern,
  type BucketObject,
  type BucketSettings,
} from "@/lib/bucket_connection"
import { formatByteCount } from "@/lib/display_formatting"

export function BucketObjectGrid({
  bucketSettings,
  listedObjects,
  hasMoreBucketObjects,
  isLoadingBucketPage,
  bucketListingError,
  onLoadNextBucketPage,
  onOpenBucketObject,
}: {
  bucketSettings: BucketSettings
  listedObjects: BucketObject[]
  hasMoreBucketObjects: boolean
  isLoadingBucketPage: boolean
  bucketListingError: string
  onLoadNextBucketPage(): void
  onOpenBucketObject(objectIndex: number): void
}) {
  const objectCount = listedObjects.length
  const isFirstLoad = isLoadingBucketPage && objectCount === 0
  return (
    <section id="bucket_browser" aria-labelledby="bucket_browser_title" className="flex flex-col gap-2">
      <header className="flex min-h-11 flex-col justify-center">
        <h2 id="bucket_browser_title" className="text-[15px] font-semibold">
          In your bucket
        </h2>
        <p id="bucket_summary" className="truncate text-[13px] text-muted-foreground">
          {describeBucketPlace(bucketSettings)} · {objectCount}
          {hasMoreBucketObjects ? "+" : ""} {objectCount === 1 ? "item" : "items"}
        </p>
      </header>
      {bucketListingError ? (
        <Alert id="bucket_listing_error" variant="destructive">
          <CloudOff />
          <AlertDescription>{bucketListingError}</AlertDescription>
        </Alert>
      ) : null}
      {isFirstLoad ? (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 6 }, (_, placeholderIndex) => (
            <Skeleton key={placeholderIndex} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : null}
      {!isLoadingBucketPage && !bucketListingError && objectCount === 0 ? (
        <Empty id="bucket_empty_state" className="rounded-2xl border border-dashed py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ImageOff />
            </EmptyMedia>
            <EmptyTitle>Nothing here yet</EmptyTitle>
            <EmptyDescription>Tap Upload to add a photo or video.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {objectCount > 0 ? (
        <div id="bucket_grid" className="grid grid-cols-3 gap-1.5">
          {listedObjects.map((listedObject, objectIndex) => {
            const objectIsImage = imageObjectKeyPattern.test(listedObject.key)
            const objectIsVideo = videoObjectKeyPattern.test(listedObject.key)
            return (
              <button
                key={listedObject.key}
                type="button"
                data-testid="bucket_tile"
                aria-label={`${readObjectFileName(listedObject.key)}, ${formatByteCount(listedObject.sizeBytes)}`}
                onClick={() => onOpenBucketObject(objectIndex)}
                className="relative grid aspect-square place-items-center overflow-hidden rounded-lg bg-muted outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 motion-safe:active:scale-[0.97]"
              >
                {objectIsImage ? (
                  <img src={buildPublicObjectUrl(bucketSettings, listedObject.key)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                ) : objectIsVideo ? null : (
                  <span className="font-mono text-sm font-semibold text-muted-foreground uppercase">{readObjectExtension(listedObject.key)}</span>
                )}
                {objectIsVideo ? (
                  <>
                    <Video className="size-7 text-muted-foreground" />
                    <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded-full bg-black/65 px-1.5 py-0.5 text-[11px] font-medium text-white uppercase">
                      {readObjectExtension(listedObject.key)}
                    </span>
                  </>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
      {hasMoreBucketObjects ? (
        <ApplicationButton id="load_more_bucket_button" variant="outline" size="touch" className="mt-2 w-full" disabled={isLoadingBucketPage} onClick={onLoadNextBucketPage}>
          {isLoadingBucketPage ? <Spinner /> : null}
          Load more
        </ApplicationButton>
      ) : null}
    </section>
  )
}
