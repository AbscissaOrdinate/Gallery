import { defineConfig, version as viteVersion } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed port and no HMR host clobbering.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: {
    ignored: ["**/src-tauri/**"],  }, },
  envPrefix: ["VITE_", "TAURI_"],
  // The boot screen names the build it runs on (docs/STYLE.md §7.1).
  define: { __VITE_VERSION__: JSON.stringify(viteVersion) },
  build: {
    target: "es2022",
    minify: "esbuild",
    sourcemap: false,
  },
});
