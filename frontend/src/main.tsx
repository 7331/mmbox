// The one page the API answers at `/` (backend/app/main.py). Providers (theme, motion, deletion), toasts and the
// share-target service worker.
import { MotionConfig } from "motion/react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { ApplicationToaster } from "@/components/application_toaster"
import { DeletionConfirmationProvider } from "@/components/deletion_confirmation_provider"
import { ThemeBrowserChromeSync } from "@/components/theme_browser_chrome_sync"
import { ThemeProvider } from "@/components/theme_provider"
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
    {/* Light, dark or the device's ("system", the default); public/theme_class_before_first_paint.js reads the same key. */}
    <ThemeProvider defaultTheme="system" storageKey="mmbox.theme">
      <ThemeBrowserChromeSync />
      {/* Motion follows the device's reduced-motion setting: transforms off, fades kept. */}
      <MotionConfig reducedMotion="user">
        <DeletionConfirmationProvider>
          <MediaBoxApplication />
          <ApplicationToaster />
        </DeletionConfirmationProvider>
      </MotionConfig>
    </ThemeProvider>
  </StrictMode>,
)
