import type { ReactNode } from "react"

import { BrandMark } from "@/components/brand_mark"

// The bar over the home screen: the brand, and the controls the caller passes (the bucket status chip).
export function SiteTopBar({ trailing }: { trailing?: ReactNode }) {
  return (
    <header className="flex min-h-14 items-center justify-between gap-3">
      <BrandMark />
      <div className="flex items-center gap-1">{trailing}</div>
    </header>
  )
}
