import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the API (uvicorn on :8000) is proxied so the browser sees a single origin,
// exactly like production behind nginx.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: process.env.VITE_API_PROXY ?? "http://localhost:8000", changeOrigin: true },
    },
  },
});
