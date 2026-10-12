import type { ReactNode } from "react"

import { BrandMark } from "@/components/brand_mark"
import { ModeToggle } from "@/components/mode_toggle"

// The bar over the home screen: the brand, the controls the caller passes (the bucket status chip) and the theme menu.
export function SiteTopBar({ trailing }: { trailing?: ReactNode }) {
  return (
    <header className="flex min-h-14 items-center justify-between gap-3">
      <BrandMark />
      <div className="flex items-center gap-1">
        {trailing}
        <ModeToggle />
      </div>
    </header>
  )
}
