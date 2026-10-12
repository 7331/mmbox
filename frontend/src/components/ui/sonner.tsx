import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

import { useMediaQuery } from "@/hooks/use_media_query"

const phoneToastBottomOffset = "calc(max(env(safe-area-inset-bottom), 1.25rem) + 4.25rem)"

const Toaster = ({ ...props }: ToasterProps) => {
  // Phones get toasts at the bottom, where they cover no top bar; wider screens at the top.
  const viewportIsPhone = useMediaQuery("(max-width: 639px)")
  return (
    <Sonner
      // The app follows prefers-color-scheme; there is no theme switch, so no next-themes.
      theme="system"
      position={viewportIsPhone ? "bottom-center" : "top-center"}
      // On a phone a screen's primary button sits at the bottom (PageColumn's footer: a 52 px button over the safe-area
      // padding), so toasts start just above it rather than over it. Sonner reads `mobileOffset` up to 600 px
      // and `offset` above that (https://sonner.emilkowal.ski/toaster).
      mobileOffset={{ bottom: phoneToastBottomOffset }}
      offset={viewportIsPhone ? { bottom: phoneToastBottomOffset } : undefined}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          // An action keeps its small look and gets a 44px hit area.
          actionButton: "relative touch-target-hit-area",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
