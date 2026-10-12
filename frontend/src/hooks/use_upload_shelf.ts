// The device's uploads ("On this device"): read from IndexedDB once, newest first, with object URLs for the stored
// thumbnails. Server links that expired more than a day ago are forgotten on load; bucket objects never expire.
import { useCallback, useEffect, useRef, useState } from "react"

import { formatDayAndTime, formatRemainingTimeShort } from "@/lib/display_formatting"
import { expiredShelfGraceMilliseconds, imageExtensionsByContentType, videoExtensionsByContentType, type ShelfItem, type ShelfRecord } from "@/lib/media_upload_types"
import { deleteShelfRecord, readAllShelfRecords, saveShelfRecord } from "@/lib/upload_history_database"

export function buildAbsoluteUrl(relativeOrAbsoluteUrl: string): string {
  return new URL(relativeOrAbsoluteUrl, location.origin).href
}

export function buildPublicLabel(mediaId: string, contentType?: string): string {
  if (contentType && videoExtensionsByContentType[contentType]) return `video-${mediaId.slice(0, 8)}.${videoExtensionsByContentType[contentType]}`
  return `image-${mediaId.slice(0, 8)}.${(contentType && imageExtensionsByContentType[contentType]) || "img"}`
}

// Objects in the visitor's own bucket have no expiry.
export const isPermanentShelfRecord = (shelfRecord: Pick<ShelfRecord, "expiresAt">): boolean => !shelfRecord.expiresAt

export const isExpiredShelfRecord = (shelfRecord: Pick<ShelfRecord, "expiresAt">, currentTime: number): boolean =>
  !isPermanentShelfRecord(shelfRecord) && shelfRecord.expiresAt <= currentTime

// "Expires in 1 h · today 12:24", when it expired, or that it never does.
export function describeShelfItemExpiry(shelfItem: Pick<ShelfItem, "expiresAt">, currentTime: number): string {
  if (isPermanentShelfRecord(shelfItem)) return "In your bucket · never expires"
  if (shelfItem.expiresAt <= currentTime) return `Expired ${formatDayAndTime(shelfItem.expiresAt)}`
  return `Expires in ${formatRemainingTimeShort(shelfItem.expiresAt, currentTime)} · ${formatDayAndTime(shelfItem.expiresAt)}`
}

const sortNewestFirst = (shelfItems: ShelfItem[]): ShelfItem[] =>
  [...shelfItems].sort((leftItem, rightItem) => (rightItem.createdAt ?? 0) - (leftItem.createdAt ?? 0))

function buildShelfItemFromRecord(storedRecord: ShelfRecord): ShelfItem {
  return {
    ...storedRecord,
    label: storedRecord.label || buildPublicLabel(storedRecord.id, storedRecord.contentType),
    previewUrl: storedRecord.thumbnail ? URL.createObjectURL(storedRecord.thumbnail) : buildAbsoluteUrl(storedRecord.url),
    previewIsObjectUrl: Boolean(storedRecord.thumbnail),
  }
}

export function useUploadShelf() {
  const [shelfItems, setShelfItems] = useState<ShelfItem[]>([])
  const shelfItemsReference = useRef<ShelfItem[]>([])
  useEffect(() => {
    shelfItemsReference.current = shelfItems
  })

  useEffect(() => {
    let isStillMounted = true
    void readAllShelfRecords().then((storedRecords) => {
      if (!isStillMounted) return
      const forgetBefore = Date.now() - expiredShelfGraceMilliseconds
      const restoredItems: ShelfItem[] = []
      for (const storedRecord of storedRecords ?? []) {
        if (!isPermanentShelfRecord(storedRecord) && storedRecord.expiresAt <= forgetBefore) {
          void deleteShelfRecord(storedRecord.id)
          continue
        }
        const cleanedRecord: ShelfRecord = {
          id: storedRecord.id,
          url: storedRecord.url,
          deleteToken: storedRecord.deleteToken,
          expiresAt: storedRecord.expiresAt,
          bucketKey: storedRecord.bucketKey,
          createdAt: storedRecord.createdAt,
          label: storedRecord.label || buildPublicLabel(storedRecord.id, storedRecord.contentType),
          bytes: storedRecord.bytes,
          contentType: storedRecord.contentType,
          thumbnail: storedRecord.thumbnail || null,
        }
        // Records from before labels carried the original file name; rewrite them without it.
        if (storedRecord.name || !storedRecord.label) void saveShelfRecord(cleanedRecord)
        restoredItems.push(buildShelfItemFromRecord(cleanedRecord))
      }
      setShelfItems((currentItems) => sortNewestFirst([...currentItems, ...restoredItems]))
    })
    return () => {
      isStillMounted = false
    }
  }, [])

  const addShelfItem = useCallback(async (newRecord: ShelfRecord): Promise<ShelfItem> => {
    await saveShelfRecord(newRecord)
    const newItem = buildShelfItemFromRecord(newRecord)
    setShelfItems((currentItems) => sortNewestFirst([newItem, ...currentItems.filter((currentItem) => currentItem.id !== newItem.id)]))
    return newItem
  }, [])

  const removeShelfItem = useCallback((removedItem: ShelfItem) => {
    if (removedItem.previewIsObjectUrl) URL.revokeObjectURL(removedItem.previewUrl)
    void deleteShelfRecord(removedItem.id)
    setShelfItems((currentItems) => currentItems.filter((currentItem) => currentItem.id !== removedItem.id))
  }, [])

  return { shelfItems, addShelfItem, removeShelfItem }
}
