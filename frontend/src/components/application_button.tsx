// shadcn's Button (components/ui/button.tsx stays exactly as `shadcn add button` writes it) with what pay.7331.org's
// design adds: two phone sizes and a press scale instead of shadcn's 1 px press nudge. Every app button uses this.
import type { ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Shrinks a touch while held, like `pressedScale` in lib/motion_presets.ts; translate-y-0 replaces the stock nudge
// (tailwind-merge keeps the later of two classes with the same variant).
const buttonPressScaleClassName = "active:not-aria-[haspopup]:translate-y-0 motion-safe:active:not-aria-[haspopup]:scale-[0.97]"

const applicationButtonSizeClassNames = {
  // The screen's one primary action on a phone: 52 px tall, full width by the caller.
  xl: "h-13 gap-2 rounded-2xl px-5 text-base font-semibold [&_svg:not([class*='size-'])]:size-5",
  // A secondary action or a top-bar control that still meets the 44 px tap target.
  touch: "h-11 gap-1.5 rounded-xl px-3.5 text-[15px] font-medium",
} as const

type ApplicationButtonSize = keyof typeof applicationButtonSizeClassNames | ComponentProps<typeof Button>["size"]

function isApplicationButtonSize(size: ApplicationButtonSize): size is keyof typeof applicationButtonSizeClassNames {
  return size === "xl" || size === "touch"
}

export function ApplicationButton({
  size,
  className,
  ...buttonProps
}: Omit<ComponentProps<typeof Button>, "size"> & { size?: ApplicationButtonSize }) {
  // An app size replaces shadcn's size classes entirely (null turns the cva size variant off).
  const sizeIsApplicationSize = isApplicationButtonSize(size)
  return (
    <Button
      size={sizeIsApplicationSize ? null : size}
      className={cn(sizeIsApplicationSize && applicationButtonSizeClassNames[size], buttonPressScaleClassName, className)}
      {...buttonProps}
    />
  )
}
