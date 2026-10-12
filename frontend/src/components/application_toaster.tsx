// shadcn's Toaster (components/ui/sonner.tsx stays exactly as `shadcn add sonner` writes it, next-themes import
// included) with the app's theme and placement. The stock file reads next-themes, which has no provider here, so it
// would always say "system"; the chosen theme is passed in instead (props win over the stock defaults).
import { useTheme } from "@/components/theme_provider"
import { Toaster } from "@/components/ui/sonner"
import { useMediaQuery } from "@/hooks/use_media_query"

const phoneToastBottomOffset = "calc(max(env(safe-area-inset-bottom), 1.25rem) + 4.25rem)"

export function ApplicationToaster() {
  const { theme } = useTheme()
  // Phones get toasts at the bottom, where they cover no top bar; wider screens at the top.
  const viewportIsPhone = useMediaQuery("(max-width: 639px)")
  return (
    <Toaster
      theme={theme}
      position={viewportIsPhone ? "bottom-center" : "top-center"}
      // On a phone a screen's primary button sits at the bottom (PageColumn's footer: a 52 px button over the safe-area
      // padding), so toasts start just above it rather than over it. Sonner reads `mobileOffset` up to 600 px
      // and `offset` above that (https://sonner.emilkowal.ski/toaster).
      mobileOffset={{ bottom: phoneToastBottomOffset }}
      offset={viewportIsPhone ? { bottom: phoneToastBottomOffset } : undefined}
      // Replaces the stock toastOptions, so its "cn-toast" class is repeated; an action keeps its small look and gets a
      // 44 px hit area.
      toastOptions={{ classNames: { toast: "cn-toast", actionButton: "relative touch-target-hit-area" } }}
    />
  )
}
