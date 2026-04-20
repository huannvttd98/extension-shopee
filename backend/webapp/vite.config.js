import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // FastAPI mount StaticFiles tại /app → build output phải ref asset theo base này.
  base: "/app/",

  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon.svg"],
      manifest: {
        name: "ProductMap Viewer",
        short_name: "ProductMap",
        description: "Xem sản phẩm Shopee đã crawl và trạng thái các phiên quét",
        theme_color: "#1f6feb",
        background_color: "#ffffff",
        display: "standalone",
        scope: "/app/",
        start_url: "/app/",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        runtimeCaching: [
          {
            urlPattern: /\/api\/(products|scan-sessions|stats)(\?.*)?$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "pm-api-get",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 },
            },
          },
        ],
      },
    }),
  ],

  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/healthz": "http://localhost:8000",
    },
  },
});
