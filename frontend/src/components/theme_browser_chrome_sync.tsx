// What the docs' ThemeProvider (components/theme_provider.tsx, kept as shadcn writes it) leaves to the app: the browser's
// theme-color follows the chosen theme, and "system" keeps following the device when it switches while the page is
// open (the provider reads the device only when the choice changes). public/theme_class_before_first_paint.js does the
// same before the first paint.
import { useEffect } from "react"

import { useTheme } from "@/components/theme_provider"

// The background token of each theme (index.css: oklch(1 0 0) and oklch(0.145 0 0)), as in index.html's meta tags.
const themeColorByResolvedTheme = { light: "#ffffff", dark: "#0a0a0a" } as const

export function ThemeBrowserChromeSync() {
  const { theme } = useTheme()

  useEffect(() => {
    const systemPrefersDarkQuery = window.matchMedia("(prefers-color-scheme: dark)")
    function applyResolvedTheme() {
      const resolvedTheme = theme === "system" ? (systemPrefersDarkQuery.matches ? "dark" : "light") : theme
      document.documentElement.classList.remove("light", "dark")
      document.documentElement.classList.add(resolvedTheme)
      for (const themeColorMeta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
        themeColorMeta.content = themeColorByResolvedTheme[resolvedTheme]
      }
    }
    applyResolvedTheme()
    if (theme !== "system") return
    systemPrefersDarkQuery.addEventListener("change", applyResolvedTheme)
    return () => systemPrefersDarkQuery.removeEventListener("change", applyResolvedTheme)
  }, [theme])

  return null
}
