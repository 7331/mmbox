// The one layout every screen uses: full-bleed on a phone, a centered card-like column on a wide screen (never
// stretched). Content stacks top-down; `footer` holds the screen's one or two buttons, pinned to the bottom on phones.
// `stickyFooter` keeps them in view while a long page scrolls under them (the home
// screen's upload buttons over the shelf and the bucket grid). Inside `PageContentRisesInContext` the content and footer slide in when the column mounts while the top
// bar stays put: the upload flow swaps its stages by remounting them, and the top bar must not blink with every stage.
import { motion } from "motion/react"
import { use, type ReactNode } from "react"

import { PageContentRisesInContext } from "@/components/page_content_rises_in_context"
import { settleSpring } from "@/lib/motion_presets"
import { cn } from "@/lib/utils"

const contentEntranceAnimation = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: settleSpring }

export function PageColumn({
  topBar,
  children,
  footer,
  stickyFooter = false,
  className,
}: {
  topBar?: ReactNode
  children: ReactNode
  footer?: ReactNode
  stickyFooter?: boolean
  className?: string
}) {
  const entranceAnimation = use(PageContentRisesInContext) ? contentEntranceAnimation : {}
  return (
    <div className="flex min-h-dvh w-full justify-center sm:items-start sm:bg-muted/50 sm:px-6 sm:py-12">
      <main
        className={cn(
          "flex min-h-dvh w-full max-w-[440px] flex-col bg-background px-5 pt-[max(env(safe-area-inset-top),0.75rem)] pb-[max(env(safe-area-inset-bottom),1.25rem)]",
          "sm:min-h-[min(820px,calc(100dvh-6rem))] sm:rounded-[28px] sm:border sm:px-7 sm:pb-7 sm:shadow-xl sm:shadow-black/5",
          className,
        )}
      >
        {topBar}
        <motion.div className="flex flex-1 flex-col" {...entranceAnimation}>
          {children}
        </motion.div>
        {footer ? (
          <motion.div
            {...entranceAnimation}
            className={cn(
              "mt-6 flex flex-col gap-2",
              stickyFooter &&
                "sticky bottom-0 z-10 -mx-5 -mb-[max(env(safe-area-inset-bottom),1.25rem)] bg-background/95 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)] backdrop-blur sm:-mx-7 sm:-mb-7 sm:rounded-b-[28px] sm:px-7 sm:pb-7",
            )}
          >
            {footer}
          </motion.div>
        ) : null}
      </main>
    </div>
  )
}
