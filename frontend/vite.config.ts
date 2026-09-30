import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Local dev and `vite preview` talk to the deployed backend through the same paths CloudFront serves.
const BACKEND = "https://dz81nhpgrhb93.cloudfront.net";
const proxy = Object.fromEntries(["/api", "/media", "/samples"].map((path) => [path, { target: BACKEND, changeOrigin: true }]));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy },
  preview: { proxy },
  build: {
    // The three.js chunk (~130 kB gzip) is expected and only loaded by the landing hero.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // three.js is only needed by the landing hero; keep it in its own cacheable chunk.
        manualChunks(id) {
          if (id.includes("node_modules/three/")) return "three";
          return undefined;
        },
      },
    },
  },
});
