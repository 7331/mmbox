// "On this device": this browser's uploads, newest first, as square thumbnails with the time left on server links.
// Four show until "See all"; an expired link stays greyed for a day (its local thumbnail shows what it was).
import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"

import { ApplicationButton } from "@/components/application_button"
import { describeShelfItemExpiry, isExpiredShelfRecord, isPermanentShelfRecord } from "@/hooks/use_upload_shelf"
import { formatRemainingTimeShort } from "@/lib/display_formatting"
import type { ShelfItem } from "@/lib/media_upload_types"
import { popSpring } from "@/lib/motion_presets"
import { cn } from "@/lib/utils"

const collapsedShelfItemCount = 4

export function DeviceUploadShelf({
  shelfItems,
  currentTime,
  onOpenShelfItem,
}: {
  shelfItems: ShelfItem[]
  currentTime: number
  onOpenShelfItem(shelfItemIndex: number): void
}) {
  const [shelfIsExpanded, setShelfIsExpanded] = useState(false)
  if (!shelfItems.length) return null
  const canExpand = shelfItems.length > collapsedShelfItemCount
  const shownShelfItems = shelfIsExpanded && canExpand ? shelfItems : shelfItems.slice(0, collapsedShelfItemCount)
  return (
    <section id="upload_shelf" aria-labelledby="upload_shelf_title" className="flex flex-col gap-2">
      <header className="flex min-h-11 items-center justify-between">
        <h2 id="upload_shelf_title" className="text-[15px] font-semibold">
          On this device
        </h2>
        {canExpand ? (
          <ApplicationButton
            id="toggle_shelf_button"
            variant="ghost"
            size="touch"
            className="-mr-3.5 text-muted-foreground"
            aria-controls="upload_shelf_list"
            aria-expanded={shelfIsExpanded}
            onClick={() => setShelfIsExpanded(!shelfIsExpanded)}
          >
            {shelfIsExpanded ? "Show less" : `See all ${shelfItems.length}`}
          </ApplicationButton>
        ) : null}
      </header>
      <div id="upload_shelf_list" className="grid grid-cols-4 gap-2">
        <AnimatePresence initial={false}>
          {shownShelfItems.map((shelfItem, shelfItemIndex) => {
            const shelfItemIsExpired = isExpiredShelfRecord(shelfItem, currentTime)
            return (
              <motion.button
                key={shelfItem.id}
                layout
                type="button"
                data-testid="shelf_item"
                data-expired={shelfItemIsExpired}
                aria-label={`${shelfItem.label}, ${describeShelfItemExpiry(shelfItem, currentTime)}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={popSpring}
                whileTap={{ scale: 0.97 }}
                onClick={() => onOpenShelfItem(shelfItemIndex)}
                className="relative aspect-square overflow-hidden rounded-xl bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <img
                  src={shelfItem.previewUrl}
                  alt=""
                  decoding="async"
                  className={cn("size-full object-cover", shelfItemIsExpired && "opacity-50 grayscale")}
                />
                {!isPermanentShelfRecord(shelfItem) ? (
                  <span className="absolute bottom-1 left-1 rounded-full bg-black/65 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
                    {formatRemainingTimeShort(shelfItem.expiresAt, currentTime)}
                  </span>
                ) : null}
              </motion.button>
            )
          })}
        </AnimatePresence>
      </div>
    </section>
  )
}
