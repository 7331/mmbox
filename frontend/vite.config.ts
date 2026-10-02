import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  server: {
    proxy: {
      "/api": "http://localhost:8099",
      "^/[0-9a-f]{32}\\..*": "http://localhost:8099",
    },
  },
});
