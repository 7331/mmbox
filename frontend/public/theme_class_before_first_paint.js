// Runs in <head> before the page paints (a same-origin file: the CSP allows no inline script), so a dark device or a
// stored "dark" never flashes white. Puts `light` or `dark` on <html> and the matching theme-color, the way
// src/components/theme_provider.tsx and theme_browser_chrome_sync.tsx do once React runs. "mmbox.theme" is the
// ThemeProvider's storageKey in src/main.tsx.
;(function applyThemeClassBeforeFirstPaint() {
  var storedTheme = null
  try {
    storedTheme = window.localStorage.getItem("mmbox.theme")
  } catch {
    // Storage blocked: follow the device.
  }
  var systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  var resolvedTheme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : systemPrefersDark ? "dark" : "light"
  document.documentElement.classList.add(resolvedTheme)
  var themeColorMetas = document.querySelectorAll('meta[name="theme-color"]')
  for (var metaIndex = 0; metaIndex < themeColorMetas.length; metaIndex++) {
    themeColorMetas[metaIndex].setAttribute("content", resolvedTheme === "dark" ? "#0a0a0a" : "#ffffff")
  }
})()
