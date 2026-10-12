import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Built into dist/, which the API serves (backend/app/main.py): `/` answers dist/index.html, hashed files sit under
// /assets/, and public/ (icons, the manifest, the share-target service worker) lands at the root as is.
// `pnpm dev` proxies the API and the server-hosted images to a running stack (MMBOX_DEV_API_URL).
const developmentApiUrl = process.env.MMBOX_DEV_API_URL ?? "http://127.0.0.1:8099"

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    proxy: {
      "/api": developmentApiUrl,
      "^/[0-9a-f]{32}\\..*": developmentApiUrl,
    },
  },
})
