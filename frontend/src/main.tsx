// The one page the API answers at `/` (backend/app/main.py). Providers, toasts and the share-target service worker.
import { MotionConfig } from "motion/react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { DeletionConfirmationProvider } from "@/components/deletion_confirmation_provider"
import { Toaster } from "@/components/ui/sonner"
import { MediaBoxApplication } from "@/media_box_application"
import "./index.css"

// The service worker only receives files shared to the installed app (public/service-worker.js); it caches nothing.
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/service-worker.js").catch((registrationError: unknown) => {
    console.warn("mmbox: service worker unavailable", registrationError)
  })
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Motion follows the device's reduced-motion setting: transforms off, fades kept. */}
    <MotionConfig reducedMotion="user">
      <DeletionConfirmationProvider>
        <MediaBoxApplication />
        <Toaster />
      </DeletionConfirmationProvider>
    </MotionConfig>
  </StrictMode>,
)
