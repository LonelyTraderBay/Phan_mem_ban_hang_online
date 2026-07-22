import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// See https://v2.tauri.app/start/frontend/ for the Vite+Tauri config conventions this follows.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5175,
    strictPort: true,
  },
  envPrefix: ["VITE_PUBLIC_", "TAURI_"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "esnext",
  },
});
