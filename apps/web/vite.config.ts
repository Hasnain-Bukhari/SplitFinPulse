import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: "../..",
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "favicon.svg",
        "apple-touch-icon-180x180.png",
      ],
      manifest: {
        name: "SplitFinPulse",
        short_name: "SplitFinPulse",
        description:
          "Personal finance and shared expenses, clearly understood.",
        theme_color: "#0a0f1c",
        background_color: "#f5f7fb",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/pwa-64x64.png",
            sizes: "64x64",
            type: "image/png",
          },
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.spec.ts"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
