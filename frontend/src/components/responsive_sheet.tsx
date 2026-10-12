// A Drawer on a phone, a Dialog from 768 px (shadcn's responsive pattern, https://ui.shadcn.com/docs/components/drawer),
// controlled by the caller, with its own title and description for screen readers. The bucket settings use it.
import { XIcon } from "lucide-react"
import type { ReactNode } from "react"

import { ApplicationButton } from "@/components/application_button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { useMediaQuery } from "@/hooks/use_media_query"

// shadcn's `md` breakpoint, as in its responsive Dialog/Drawer example.
const wideScreenMediaQuery = "(min-width: 768px)"

export function ResponsiveSheet({
  isOpen,
  onOpenChange,
  title,
  description,
  children,
}: {
  isOpen: boolean
  onOpenChange: (nextIsOpen: boolean) => void
  title: string
  description: ReactNode
  children: ReactNode
}) {
  const isWideScreen = useMediaQuery(wideScreenMediaQuery)
  if (isWideScreen) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="max-h-[90dvh] gap-0 overflow-y-auto rounded-3xl p-7 sm:max-w-[440px]">
          <DialogHeader className="pb-4 text-left">
            <DialogTitle className="text-2xl font-semibold tracking-tight">{title}</DialogTitle>
            <DialogDescription className="text-[15px]">{description}</DialogDescription>
          </DialogHeader>
          {children}
          {/* shadcn's own close button, as an app button: the press scale and a 44 px hit area round its small look. */}
          <DialogClose asChild>
            <ApplicationButton variant="ghost" size="icon-sm" className="absolute top-2 right-2 touch-target-hit-area">
              <XIcon />
              <span className="sr-only">Close</span>
            </ApplicationButton>
          </DialogClose>
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <Drawer open={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-[440px] overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
          <DrawerHeader className="px-0 pt-5 pb-4 text-left md:text-left">
            <DrawerTitle className="text-2xl font-semibold tracking-tight">{title}</DrawerTitle>
            <DrawerDescription className="text-[15px]">{description}</DrawerDescription>
          </DrawerHeader>
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
