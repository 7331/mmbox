import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/",
  plugins: [tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:8099",
      "^/[0-9a-f]{32}\\..*": "http://localhost:8099",
    },
  },
});
